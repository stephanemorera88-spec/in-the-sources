import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { OPENAI_MODEL, SYSTEM_PROMPT } from "../models";
import { askOpenAI, extractOpenAI, type OpenAIResponseSubset } from "../openai";
import { fakeFetch, hangingFetch, jsonResponse } from "./helpers";

const KEY = "sk-test-key-abcdef123456";
const TEXT = "EVOIX is an AI consultancy in DeLand, Florida.";

// Fixture typed with the SDK's own types (node_modules/openai/resources/responses/responses.d.ts:
// ResponseOutputMessage line 5350, ResponseOutputText line 5396, URLCitation line 5436), so a
// renamed field fails to compile instead of silently yielding no sources.
const message: OpenAI.Responses.ResponseOutputMessage = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  status: "completed",
  content: [
    {
      type: "output_text",
      text: TEXT,
      annotations: [
        { type: "url_citation", url: "https://www.evoix.io/about", title: "About EVOIX", start_index: 0, end_index: 10 },
        { type: "url_citation", url: "https://www.evoix.io/about", title: "About EVOIX again", start_index: 11, end_index: 20 },
        { type: "url_citation", url: "https://blog.example.com/post", title: "", start_index: 21, end_index: 30 },
        { type: "file_citation", file_id: "file_1", filename: "notes.pdf", index: 3 },
      ],
    },
    { type: "refusal", refusal: "not this part" },
  ],
};

const fixture: OpenAIResponseSubset = { model: "gpt-5-mini-2025-08-07", output: [message], output_text: TEXT, error: null };

describe("extractOpenAI", () => {
  it("reads text, url citations (deduped by url, order kept) and the model", () => {
    const extracted = extractOpenAI(fixture);
    expect(extracted.text).toBe(TEXT);
    expect(extracted.model).toBe("gpt-5-mini-2025-08-07");
    expect(extracted.error).toBeNull();
    expect(extracted.sources).toEqual([
      { url: "https://www.evoix.io/about", domain: "evoix.io", title: "About EVOIX" },
      { url: "https://blog.example.com/post", domain: "blog.example.com", title: null },
    ]);
  });

  it("surfaces a response-level error", () => {
    const extracted = extractOpenAI({ ...fixture, error: { code: "server_error", message: "upstream failed" } });
    expect(extracted.error).toBe("server_error: upstream failed");
  });
});

/* The API body the SDK parses (output_text is assembled by the SDK, so it is left out here). */
const apiBody = {
  id: "resp_1",
  object: "response",
  created_at: 1,
  status: "completed",
  error: null,
  incomplete_details: null,
  instructions: SYSTEM_PROMPT,
  metadata: {},
  model: "gpt-5-mini-2025-08-07",
  output: [message],
  parallel_tool_calls: true,
  temperature: 1,
  tool_choice: "auto",
  tools: [{ type: "web_search" }],
  top_p: 1,
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
};

describe("askOpenAI", () => {
  it("sends the user's key, the system prompt and the web search tool, and returns the extracted answer", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(apiBody));
    const answer = await askOpenAI(KEY, "What is evoix.io?", { fetch: fetchImpl, timeoutMs: 5000 });

    const req = fetchImpl.requests[0];
    expect(req.url).toMatch(/\/responses$/);
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(req.body).toMatchObject({
      model: OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
      input: "What is evoix.io?",
      tools: [{ type: "web_search" }],
      reasoning: { effort: "low" },
    });

    expect(answer.error).toBeNull();
    expect(answer.engine).toBe("openai");
    expect(answer.model).toBe("gpt-5-mini-2025-08-07");
    expect(answer.text).toBe(TEXT);
    expect(answer.sources.map((s) => s.domain)).toEqual(["evoix.io", "blog.example.com"]);
    expect(answer.searchResults).toEqual([]);
    expect(answer.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns an error answer on an API failure, without the key", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(
        { error: { message: `Incorrect API key provided: ${KEY}`, type: "invalid_request_error", code: "invalid_api_key" } },
        401
      )
    );
    const answer = await askOpenAI(KEY, "What is evoix.io?", { fetch: fetchImpl });
    expect(answer.text).toBe("");
    expect(answer.sources).toEqual([]);
    expect(answer.error).toMatch(/401/);
    expect(answer.error).not.toContain(KEY);
    expect(answer.error).not.toContain("\n");
  });

  it("returns an error answer when the request times out", async () => {
    const answer = await askOpenAI(KEY, "What is evoix.io?", { fetch: hangingFetch(), timeoutMs: 30 });
    expect(answer.text).toBe("");
    expect(answer.error).toMatch(/timed out|timeout|abort/i);
  });
});
