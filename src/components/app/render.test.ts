import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CompetitorRow, PromptRow, RunSummary } from "@/lib/contracts";

/* next/link needs the App Router context; a plain anchor is enough to check the markup here. */
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, ...rest }, children),
}));

import { CompetitorLeaderboard } from "./CompetitorLeaderboard";
import { EngineReadout } from "./EngineReadout";
import { PromptTable } from "./PromptTable";
import { TrendChart } from "./TrendChart";
import { ENGINE_LABELS, formatDateTime, formatPercent, scrubKeyLike } from "./format";

function summary(runId: string, startedAt: string, rates: Array<[RunSummary["perEngine"][number]["engine"], number | null, number | null]>): RunSummary {
  return {
    runId,
    startedAt,
    status: "complete",
    perEngine: rates.map(([engine, citationRate, mentionRate]) => ({
      engine,
      attempted: citationRate === null ? 0 : 10,
      answered: citationRate === null ? 0 : 10,
      cited: citationRate === null ? 0 : Math.round(citationRate * 10),
      mentioned: mentionRate === null ? 0 : Math.round(mentionRate * 10),
      citationRate,
      mentionRate,
    })),
    overall: { answered: 10, mentioned: 5, cited: 3 },
  };
}

describe("format helpers", () => {
  it("formats rates, UTC times and masks key-shaped text", () => {
    expect(formatPercent(0.6667)).toBe("67%");
    expect(formatPercent(null)).toBe("n/a");
    expect(formatDateTime("2026-10-01T14:03:00.000Z")).toBe("Oct 1, 2026, 14:03 UTC");
    expect(formatDateTime("not a date")).toBe("not a date");
    expect(scrubKeyLike("bad key sk-proj-abcdefghijklmnop and AIzaSyABCDEFGHIJKL")).toBe("bad key sk-[hidden] and AIza[hidden]");
  });
});

describe("EngineReadout", () => {
  it("shows an empty state without a run", () => {
    const html = renderToStaticMarkup(createElement(EngineReadout, { latestRun: null }));
    expect(html).toContain("No runs yet");
  });

  it("leads with the citation rate per engine and names the mention rate", () => {
    const run = summary("run_1", "2026-10-01T10:00:00.000Z", [
      ["openai", 0.5, 0.8],
      ["anthropic", null, null],
    ]);
    const html = renderToStaticMarkup(createElement(EngineReadout, { latestRun: run }));
    expect(html).toContain("OpenAI");
    expect(html).toContain("In the sources");
    expect(html).toContain("50%");
    expect(html).toContain("Named");
    expect(html).toContain("80%");
    expect(html).toContain("No answers");
    expect(html).toContain("No key for this engine");
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });

  it("tells an engine without a key apart from one whose calls all failed", () => {
    const run = summary("run_1", "2026-10-01T10:00:00.000Z", [
      ["openai", null, null],
      ["anthropic", null, null],
    ]);
    // OpenAI made three calls and every one errored; Anthropic had no key, so the run holds no row for it.
    run.perEngine[0].attempted = 3;
    const html = renderToStaticMarkup(createElement(EngineReadout, { latestRun: run }));
    const openai = html.slice(html.indexOf(ENGINE_LABELS.openai), html.indexOf(ENGINE_LABELS.anthropic));
    const anthropic = html.slice(html.indexOf(ENGINE_LABELS.anthropic), html.indexOf(ENGINE_LABELS.gemini));
    expect(openai).toContain("Every call to this engine failed in this run.");
    expect(openai).not.toContain("No key for this engine");
    expect(anthropic).toContain("No key for this engine when the run started.");
    expect(anthropic).not.toContain("Every call to this engine failed");
  });
});

describe("TrendChart", () => {
  it("draws one path per engine, breaks the line at runs without answers, and lists every run in the table", () => {
    const trend = [
      summary("run_1", "2026-09-29T10:00:00.000Z", [["openai", 0.2, 0.4], ["anthropic", 0.1, 0.1], ["gemini", 0.3, 0.3]]),
      summary("run_2", "2026-09-30T10:00:00.000Z", [["openai", null, null], ["anthropic", 0.2, 0.2], ["gemini", 0.3, 0.3]]),
      summary("run_3", "2026-10-01T10:00:00.000Z", [["openai", 0.6, 0.7], ["anthropic", 0.3, 0.3], ["gemini", 0.3, 0.3]]),
    ];
    const html = renderToStaticMarkup(createElement(TrendChart, { trend, projectId: "prj_1" }));

    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    // Accessible title and point tooltips must be non-empty strings (React drops a <title> with several children).
    expect(html).toContain("<title id=\"trend-title-prj_1\">Share of answers that cited the site, per engine, across the last 3 runs</title>");
    expect(html).toContain("OpenAI, Sep 29, 2026, 10:00 UTC: 20% in the sources</title>");
    expect(html).not.toContain("<title></title>");
    expect((html.match(/<path /g) ?? []).length).toBe(3);
    // OpenAI has a gap in the middle: two separate M commands, no L between them.
    const openaiPath = html.match(/<path d="(M[^"]*)"/g) ?? [];
    expect(openaiPath.some((p) => (p.match(/M/g) ?? []).length === 2)).toBe(true);
    // Table fallback: three rows, linked to the run pages, newest first.
    expect(html).toContain("/app/projects/prj_1/runs/run_1");
    expect(html).toContain("/app/projects/prj_1/runs/run_3");
    expect(html.indexOf("run_3")).toBeLessThan(html.indexOf("run_1"));
    expect(html).toContain("no answers");
    expect(html).toContain("60% / 70%");
    expect(html).toContain("0%");
    expect(html).toContain("100%");
  });

  it("renders a single run without dividing by zero", () => {
    const trend = [summary("run_1", "2026-10-01T10:00:00.000Z", [["openai", 1, 1]])];
    const html = renderToStaticMarkup(createElement(TrendChart, { trend, projectId: "prj_1" }));
    expect(html).not.toContain("NaN");
    expect(html).toContain("<circle");
  });

  it("keeps at most 30 runs", () => {
    const trend = Array.from({ length: 40 }, (_, i) =>
      summary(`run_${i}`, `2026-08-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`, [["openai", 0.5, 0.5]])
    );
    const html = renderToStaticMarkup(createElement(TrendChart, { trend, projectId: "prj_1" }));
    expect(html).not.toContain("runs/run_9\"");
    expect(html).toContain("runs/run_39");
    expect(html).toContain("the last 30 runs");
  });

  it("shows an empty state without runs", () => {
    const html = renderToStaticMarkup(createElement(TrendChart, { trend: [], projectId: "prj_1" }));
    expect(html).toContain("No runs yet");
    expect(html).not.toContain("<svg");
  });
});

describe("PromptTable", () => {
  it("shows two marks per engine cell, the list position, and errors with the message as a title", () => {
    const rows: PromptRow[] = [
      {
        promptId: "prm_1",
        text: "best dentist in DeLand",
        perEngine: {
          openai: { mentioned: true, position: 2, cited: true, error: null },
          anthropic: { mentioned: false, position: null, cited: false, error: null },
          gemini: { mentioned: false, position: null, cited: false, error: "timeout after 90 s with sk-ant-abcdefghijklmnop" },
        },
      },
    ];
    const html = renderToStaticMarkup(createElement(PromptTable, { rows }));
    expect(html).toContain("best dentist in DeLand");
    expect(html).toContain(">cited<");
    expect(html).toContain("named #2");
    expect(html).toContain("not cited");
    expect(html).toContain("not named");
    expect(html).toContain('title="timeout after 90 s with sk-[hidden]"');
    expect(html).toContain(">error<");
    expect(html).not.toContain("abcdefghijklmnop");
  });

  it("marks a missing engine cell as no result", () => {
    const rows: PromptRow[] = [{ promptId: "prm_1", text: "q", perEngine: { openai: { mentioned: false, position: null, cited: true, error: null } } }];
    const html = renderToStaticMarkup(createElement(PromptTable, { rows }));
    expect((html.match(/no result/g) ?? []).length).toBe(2);
  });
});

describe("CompetitorLeaderboard", () => {
  it("ranks domains and marks the project domain and named competitors", () => {
    const rows: CompetitorRow[] = [
      { domain: "rival.com", citations: 7, isUs: false, isNamedCompetitor: true },
      { domain: "acme.com", citations: 5, isUs: true, isNamedCompetitor: false },
      { domain: "wikipedia.org", citations: 2, isUs: false, isNamedCompetitor: false },
    ];
    const html = renderToStaticMarkup(createElement(CompetitorLeaderboard, { rows }));
    expect(html).toContain("rival.com");
    expect(html).toContain("named competitor");
    expect(html).toContain(">you<");
    expect(html.indexOf("rival.com")).toBeLessThan(html.indexOf("acme.com"));
    expect(html).toContain('class="w-full overflow-x-auto"');
  });

  it("shows an empty state", () => {
    const html = renderToStaticMarkup(createElement(CompetitorLeaderboard, { rows: [] }));
    expect(html).toContain("No cited domains yet");
  });
});
