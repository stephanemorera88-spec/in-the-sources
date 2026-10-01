import { describe, expect, it } from "vitest";
import type { Candidate } from "@google/genai";
import { askGemini, collectGemini, extractGemini, type GeminiResponseSubset } from "../gemini";
import { GEMINI_MODEL, SYSTEM_PROMPT } from "../models";
import { fakeFetch, jsonResponse } from "./helpers";

const KEY = "AIzaSyTestKeyAbcdef1234567890";
const REDIRECT_A = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA";
const REDIRECT_B = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB";

// Fixture typed with the SDK's own types (node_modules/@google/genai/dist/genai.d.ts: Candidate line 1693,
// Content line 2192, Part line 12805, GroundingMetadata line 8009, GroundingChunk line 7856, GroundingChunkWeb line 7999).
const candidate: Candidate = {
  content: {
    role: "model",
    parts: [{ text: "Let me think.", thought: true }, { text: "EVOIX is an AI consultancy " }, { text: "in DeLand, Florida." }],
  },
  finishReason: "STOP" as Candidate["finishReason"],
  groundingMetadata: {
    webSearchQueries: ["evoix.io"],
    groundingChunks: [
      { web: { uri: REDIRECT_A, title: "evoix.io" } },
      { web: { uri: REDIRECT_B, title: "competitor.com" } },
      { web: { uri: "https://direct.example.com/page", title: "Direct page" } },
      { web: { title: "no uri" } },
      { retrievedContext: { uri: "gs://bucket/doc", title: "not web" } },
    ],
  },
};

const fixture: GeminiResponseSubset = { candidates: [candidate], modelVersion: "gemini-2.5-flash-001" };

function redirectFetch() {
  return fakeFetch((req) => {
    if (req.url === REDIRECT_A) return new Response(null, { status: 302, headers: { location: "https://www.evoix.io/about" } });
    if (req.url === REDIRECT_B) return new Response("not a redirect", { status: 200 });
    return new Response("unexpected", { status: 500 });
  });
}

describe("collectGemini", () => {
  it("joins non-thought text parts and collects web chunks only", () => {
    const collected = collectGemini(fixture);
    expect(collected.text).toBe("EVOIX is an AI consultancy in DeLand, Florida.");
    expect(collected.model).toBe("gemini-2.5-flash-001");
    expect(collected.error).toBeNull();
    expect(collected.chunks).toEqual([
      { uri: REDIRECT_A, title: "evoix.io" },
      { uri: REDIRECT_B, title: "competitor.com" },
      { uri: "https://direct.example.com/page", title: "Direct page" },
    ]);
  });

  it("explains a blocked or empty answer", () => {
    const blocked = collectGemini({
      candidates: [],
      modelVersion: "gemini-2.5-flash",
      promptFeedback: { blockReason: "SAFETY" as NonNullable<GeminiResponseSubset["promptFeedback"]>["blockReason"] },
    });
    expect(blocked.text).toBe("");
    expect(blocked.error).toContain("SAFETY");
    expect(blocked.model).toBe("gemini-2.5-flash");
  });
});

describe("extractGemini", () => {
  it("resolves redirects and fills sources and searchResults with the same list", async () => {
    const fetchImpl = redirectFetch();
    const extracted = await extractGemini(fixture, { fetch: fetchImpl, timeoutMs: 1000 });
    expect(extracted.sources).toEqual([
      { url: "https://www.evoix.io/about", domain: "evoix.io", title: "evoix.io" },
      { url: REDIRECT_B, domain: "competitor.com", title: "competitor.com" },
      { url: "https://direct.example.com/page", domain: "direct.example.com", title: "Direct page" },
    ]);
    expect(extracted.searchResults).toEqual(extracted.sources);
    expect(extracted.searchResults).not.toBe(extracted.sources);
    expect(fetchImpl.requests.map((r) => r.url).sort()).toEqual([REDIRECT_A, REDIRECT_B]);
  });
});

const apiBody = {
  candidates: [candidate],
  modelVersion: "gemini-2.5-flash-001",
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
};

describe("askGemini", () => {
  it("sends the user's key, the system instruction and Google Search grounding, then resolves the redirects", async () => {
    const redirects = redirectFetch();
    const fetchImpl = fakeFetch((req, init) => (req.url.includes(":generateContent") ? jsonResponse(apiBody) : redirects(req.url, init)));
    const answer = await askGemini(KEY, "What is evoix.io?", { fetch: fetchImpl, timeoutMs: 5000 });

    const apiRequest = fetchImpl.requests.find((r) => r.url.includes(":generateContent"));
    expect(apiRequest).toBeDefined();
    expect(apiRequest?.url).toContain(`models/${GEMINI_MODEL}:generateContent`);
    expect(apiRequest?.headers.get("x-goog-api-key")).toBe(KEY);
    const sent = JSON.stringify(apiRequest?.body);
    expect(sent).toContain(SYSTEM_PROMPT);
    expect(sent).toContain('"googleSearch":{}');
    expect(sent).toContain("What is evoix.io?");

    expect(answer.error).toBeNull();
    expect(answer.engine).toBe("gemini");
    expect(answer.model).toBe("gemini-2.5-flash-001");
    expect(answer.text).toBe("EVOIX is an AI consultancy in DeLand, Florida.");
    expect(answer.sources.map((s) => s.domain)).toEqual(["evoix.io", "competitor.com", "direct.example.com"]);
    expect(answer.searchResults).toEqual(answer.sources);
  });

  it("returns an error answer on an API failure, without the key", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse({ error: { code: 400, message: `API key not valid: ${KEY}`, status: "INVALID_ARGUMENT" } }, 400)
    );
    const answer = await askGemini(KEY, "What is evoix.io?", { fetch: fetchImpl, timeoutMs: 5000 });
    expect(answer.text).toBe("");
    expect(answer.sources).toEqual([]);
    expect(answer.error).toMatch(/API key not valid/);
    expect(answer.error).not.toContain(KEY);
  });

  it("does not retry a server error", async () => {
    // 500 is in the SDK's default retry set; attempts 1 means the first try is the only try.
    const fetchImpl = fakeFetch(() => jsonResponse({ error: { code: 500, message: "internal", status: "INTERNAL" } }, 500));
    const answer = await askGemini(KEY, "What is evoix.io?", { fetch: fetchImpl, timeoutMs: 5000 });
    expect(answer.text).toBe("");
    expect(answer.error).toMatch(/500|internal/i);
    expect(fetchImpl.requests).toHaveLength(1);
  });

  it("returns an error answer when Gemini blocks the prompt", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ promptFeedback: { blockReason: "SAFETY" }, modelVersion: "gemini-2.5-flash" }));
    const answer = await askGemini(KEY, "What is evoix.io?", { fetch: fetchImpl, timeoutMs: 5000 });
    expect(answer.text).toBe("");
    expect(answer.error).toContain("SAFETY");
  });
});
