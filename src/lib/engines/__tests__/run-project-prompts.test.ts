import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineAnswer, EngineId, Project, Prompt, ResultInput } from "../../contracts";
import { RUN_BUDGET_EXHAUSTED, askEngine, runProjectPrompts, type AskFn } from "../index";
import { MIN_CALL_BUDGET_MS, QUERY_TIMEOUT_MS } from "../models";
import { tick } from "./helpers";

const project: Project = {
  id: "p1",
  licenseId: "l1",
  brandName: "In the Sources",
  domain: "evoix.io",
  aliases: [],
  competitorDomains: ["competitor.com"],
  dailyRun: true,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const prompts: Prompt[] = [
  { id: "q1", projectId: "p1", text: "best AEO tracker", createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null },
  { id: "q2", projectId: "p1", text: "what is In the Sources", createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null },
  { id: "q3", projectId: "p1", text: "archived one", createdAt: "2026-10-01T00:00:00.000Z", archivedAt: "2026-10-01T01:00:00.000Z" },
];

function good(engine: EngineId): EngineAnswer {
  return {
    engine,
    model: `${engine}-model`,
    text: "1. In the Sources tracks citations.",
    sources: [
      { url: "https://evoix.io/", domain: "evoix.io", title: null },
      { url: "https://competitor.com/x", domain: "competitor.com", title: "Competitor" },
    ],
    searchResults: [{ url: "https://competitor.com/x", domain: "competitor.com", title: "Competitor" }],
    latencyMs: 12.6,
    error: null,
  };
}

function bad(engine: EngineId): EngineAnswer {
  return { engine, model: `${engine}-model`, text: "", sources: [], searchResults: [], latencyMs: 5, error: "AuthenticationError: 401" };
}

describe("runProjectPrompts", () => {
  it("runs every active prompt on every engine with a key and reports the analyzed results", async () => {
    const ask: AskFn = async (engine, apiKey, prompt) => {
      expect(apiKey).toBe(engine === "openai" ? "key-o" : "key-a");
      return engine === "anthropic" && prompt === "what is In the Sources" ? bad(engine) : good(engine);
    };
    const results: ResultInput[] = [];
    const outcome = await runProjectPrompts({
      keys: { openai: " key-o ", anthropic: "key-a", gemini: "   " },
      project,
      prompts,
      onResult: async (r) => {
        results.push(r);
      },
      ask,
    });

    expect(outcome).toEqual({ total: 4, errored: 1 });
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.promptId).sort()).toEqual(["q1", "q1", "q2", "q2"]);
    expect(results.every((r) => r.engine !== "gemini")).toBe(true);

    const ok = results.find((r) => r.engine === "openai" && r.promptId === "q1");
    expect(ok).toMatchObject({
      model: "openai-model",
      mentioned: true,
      position: 1,
      cited: true,
      competitorDomainsCited: ["competitor.com"],
      rawText: "1. In the Sources tracks citations.",
      error: null,
      latencyMs: 13,
    });
    expect(ok?.sources).toHaveLength(2);
    expect(ok?.searchResults).toHaveLength(1);

    const failed = results.find((r) => r.engine === "anthropic" && r.promptId === "q2");
    expect(failed).toMatchObject({
      model: "anthropic-model",
      mentioned: false,
      position: null,
      cited: false,
      competitorDomainsCited: [],
      rawText: "",
      error: "AuthenticationError: 401",
      latencyMs: 5,
    });
  });

  it("counts a failing onResult as errored and keeps going", async () => {
    let calls = 0;
    const outcome = await runProjectPrompts({
      keys: { openai: "k" },
      project,
      prompts,
      onResult: async () => {
        calls += 1;
        if (calls === 1) throw new Error("db down");
      },
      ask: async (engine) => good(engine),
    });
    expect(calls).toBe(2);
    expect(outcome).toEqual({ total: 2, errored: 1 });
  });

  it("does not double count a failed call whose onResult also throws", async () => {
    const outcome = await runProjectPrompts({
      keys: { openai: "k" },
      project,
      prompts: prompts.slice(0, 1),
      onResult: async () => {
        throw new Error("db down");
      },
      ask: async (engine) => bad(engine),
    });
    expect(outcome).toEqual({ total: 1, errored: 1 });
  });

  it("turns a throwing ask into an errored result instead of rejecting", async () => {
    const results: ResultInput[] = [];
    const outcome = await runProjectPrompts({
      keys: { gemini: "k" },
      project,
      prompts: prompts.slice(0, 1),
      onResult: async (r) => {
        results.push(r);
      },
      ask: async () => {
        throw new Error("exploded");
      },
    });
    expect(outcome).toEqual({ total: 1, errored: 1 });
    expect(results[0]?.error).toContain("exploded");
    expect(results[0]?.rawText).toBe("");
  });

  it("respects the concurrency cap", async () => {
    let active = 0;
    let peak = 0;
    const many: Prompt[] = Array.from({ length: 5 }, (_, i) => ({ ...prompts[0], id: `q${i}` }));
    const outcome = await runProjectPrompts({
      keys: { openai: "a", anthropic: "b", gemini: "c" },
      project,
      prompts: many,
      concurrency: 2,
      onResult: async () => {},
      ask: async (engine) => {
        active += 1;
        peak = Math.max(peak, active);
        await tick(2);
        active -= 1;
        return good(engine);
      },
    });
    expect(outcome).toEqual({ total: 15, errored: 0 });
    expect(peak).toBe(2);
  });

  it("returns zeros when there is nothing to run", async () => {
    await expect(
      runProjectPrompts({ keys: {}, project, prompts, onResult: async () => {}, ask: async (e) => good(e) })
    ).resolves.toEqual({ total: 0, errored: 0 });
    await expect(
      runProjectPrompts({ keys: { openai: "k" }, project, prompts: [], onResult: async () => {}, ask: async (e) => good(e) })
    ).resolves.toEqual({ total: 0, errored: 0 });
  });
});

describe("runProjectPrompts deadline", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes every remaining call as an errored row once the deadline has passed, without touching the engine", async () => {
    const ask = vi.fn<AskFn>(async (engine) => good(engine));
    const results: ResultInput[] = [];
    const outcome = await runProjectPrompts({
      keys: { openai: "k", anthropic: "k" },
      project,
      prompts,
      deadline: Date.now() - 1,
      onResult: async (r) => {
        results.push(r);
      },
      ask,
    });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome).toEqual({ total: 4, errored: 4 });
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.error).toBe(RUN_BUDGET_EXHAUSTED);
      expect(r.rawText).toBe("");
      expect(r.model).toBeNull();
      expect(r.latencyMs).toBeNull();
      expect(r.mentioned).toBe(false);
      expect(r.cited).toBe(false);
    }
  });

  it("caps each call's timeout at what is left of the budget, and uses the plain timeout without a deadline", async () => {
    const timeouts: Array<number | undefined> = [];
    const ask: AskFn = async (engine, _apiKey, _prompt, opts) => {
      timeouts.push(opts?.timeoutMs);
      return good(engine);
    };
    await runProjectPrompts({
      keys: { openai: "k" },
      project,
      prompts: prompts.slice(0, 1),
      deadline: Date.now() + 20_000,
      onResult: async () => {},
      ask,
    });
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]).toBeGreaterThanOrEqual(MIN_CALL_BUDGET_MS);
    expect(timeouts[0]).toBeLessThanOrEqual(20_000);
    expect(timeouts[0]).toBeLessThan(QUERY_TIMEOUT_MS);

    timeouts.length = 0;
    await runProjectPrompts({ keys: { openai: "k" }, project, prompts: prompts.slice(0, 1), onResult: async () => {}, ask });
    expect(timeouts).toEqual([QUERY_TIMEOUT_MS]);
  });

  it("keeps the answers of calls that started and errors the rest when the budget runs out mid-run", async () => {
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    // The first call eats the whole budget; with one call in flight the second one finds nothing left.
    const ask: AskFn = async (engine) => {
      clock += 100_000;
      return good(engine);
    };
    const results: ResultInput[] = [];
    const outcome = await runProjectPrompts({
      keys: { openai: "k" },
      project,
      prompts,
      concurrency: 1,
      deadline: clock + 60_000,
      onResult: async (r) => {
        results.push(r);
      },
      ask,
    });
    expect(outcome).toEqual({ total: 2, errored: 1 });
    expect(results.map((r) => r.error)).toEqual([null, RUN_BUDGET_EXHAUSTED]);
    expect(results[0]?.cited).toBe(true);
  });
});

describe("askEngine", () => {
  it("never throws for an unknown engine id", async () => {
    const answer = await askEngine("perplexity" as EngineId, "k", "hi");
    expect(answer.error).toMatch(/Unknown engine/);
    expect(answer.text).toBe("");
  });
});
