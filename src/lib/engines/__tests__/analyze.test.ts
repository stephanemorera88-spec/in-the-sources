import { describe, expect, it } from "vitest";
import type { EngineAnswer, Source } from "../../contracts";
import { DONT_KNOW_PHRASES, analyzeAnswer, findMention } from "../analyze";

function answer(text: string, sources: Source[] = []): EngineAnswer {
  return { engine: "openai", model: "gpt-5-mini", text, sources, searchResults: [], latencyMs: 10, error: null };
}

function src(url: string, domain?: string): Source {
  return { url, domain: domain ?? new URL(url).hostname, title: null };
}

const project = {
  brandName: "In the Sources",
  domain: "evoix.io",
  aliases: ["InTheSources", "ITS tracker"],
  competitorDomains: ["competitor.com", "https://www.Other.co/", "competitor.com"],
};

describe("analyzeAnswer", () => {
  it("mentions via an alias, with no position for a prose mention", () => {
    const result = analyzeAnswer(answer("Try InTheSources if you want citation tracking."), project);
    expect(result).toEqual({ mentioned: true, position: null, cited: false, competitorDomainsCited: [] });
  });

  it("takes the position from a numbered-list entry, through link and bold markup", () => {
    const text = "A few options:\n1. **Competitor A**\n2. [In the Sources](https://evoix.io) tracks citations\n3. Other";
    expect(analyzeAnswer(answer(text), project).position).toBe(2);
    expect(analyzeAnswer(answer("1) **In the Sources**: a tracker"), project).position).toBe(1);
  });

  it("gives no position when the numbered line does not start with the name", () => {
    const result = analyzeAnswer(answer("1. Competitor A is better than In the Sources"), project);
    expect(result.mentioned).toBe(true);
    expect(result.position).toBeNull();
  });

  it("ignores numbers that are not list entries", () => {
    const result = analyzeAnswer(answer("Founded in 2026. In the Sources tracks citations.\n2026. In the Sources again"), project);
    expect(result.mentioned).toBe(true);
    expect(result.position).toBeNull();
  });

  it("takes the smallest position across the brand name and aliases", () => {
    expect(analyzeAnswer(answer("1. InTheSources\n2. In the Sources"), project).position).toBe(1);
  });

  it("counts a subdomain of the project domain as cited", () => {
    const result = analyzeAnswer(answer("See the blog.", [src("https://blog.evoix.io/post")]), project);
    expect(result.cited).toBe(true);
  });

  it("does not count a lookalike domain as cited", () => {
    const result = analyzeAnswer(answer("x", [src("https://notevoix.io/"), src("https://evoix.io.example.com/")]), project);
    expect(result.cited).toBe(false);
  });

  it("derives the source domain from the url when domain is empty", () => {
    const result = analyzeAnswer(answer("x", [{ url: "https://www.evoix.io/p", domain: "", title: null }]), project);
    expect(result.cited).toBe(true);
  });

  it("lists competitor domains cited, normalized and deduped", () => {
    const sources = [src("https://www.competitor.com/x"), src("https://sub.other.co/y"), src("https://competitor.com/z")];
    const result = analyzeAnswer(answer("x", sources), project);
    expect(result.competitorDomainsCited).toEqual(["competitor.com", "other.co"]);
  });

  it("zeroes a mention inside the don't-know radius", () => {
    const result = analyzeAnswer(answer("I couldn't find any information about In the Sources online."), project);
    expect(result.mentioned).toBe(false);
    expect(result.position).toBeNull();
  });

  it("zeroes a numbered mention too when it sits inside the radius", () => {
    const result = analyzeAnswer(answer("1. In the Sources\nI don't have information about it."), project);
    expect(result.mentioned).toBe(false);
    expect(result.position).toBeNull();
  });

  it("keeps a mention when the don't-know phrase is far away", () => {
    const text = `In the Sources is a tracker. ${"x".repeat(260)} I couldn't find pricing details.`;
    expect(analyzeAnswer(answer(text), project).mentioned).toBe(true);
  });

  it("keeps a mention when a later occurrence is clean", () => {
    const text = `I couldn't find reviews for In the Sources. ${"x".repeat(260)} In the Sources is a tracker.`;
    expect(analyzeAnswer(answer(text), project).mentioned).toBe(true);
  });

  it("respects word boundaries and is case-insensitive", () => {
    const dental = { brandName: "A1 Dental", domain: "a1dental.com", aliases: [], competitorDomains: [] };
    expect(analyzeAnswer(answer("1A1 Dentalcare is great."), dental).mentioned).toBe(false);
    expect(analyzeAnswer(answer("A1 Dentalcare is great."), dental).mentioned).toBe(false);
    expect(analyzeAnswer(answer("Go to A1 Dental."), dental).mentioned).toBe(true);
    expect(analyzeAnswer(answer("IN THE SOURCES is a tracker"), project).mentioned).toBe(true);
  });

  it("returns all-false for empty text and no sources", () => {
    expect(analyzeAnswer(answer(""), project)).toEqual({ mentioned: false, position: null, cited: false, competitorDomainsCited: [] });
  });

  it("escapes regex characters in names", () => {
    const odd = { brandName: "C++ (Pro)", domain: "cpp.pro", aliases: [], competitorDomains: [] };
    expect(analyzeAnswer(answer("Use C++ (Pro) today"), odd).mentioned).toBe(true);
  });
});

describe("findMention", () => {
  it("keeps the don't-know phrase list from the audit parser", () => {
    expect(DONT_KNOW_PHRASES).toContain("couldn't find");
    expect(DONT_KNOW_PHRASES).toContain("not familiar with");
    expect(findMention("", "anything")).toEqual({ mentioned: false, position: null });
  });
});
