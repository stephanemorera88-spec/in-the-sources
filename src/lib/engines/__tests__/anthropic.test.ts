import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { askAnthropic, extractAnthropic, type AnthropicMessageSubset } from "../anthropic";
import { ANTHROPIC_MODEL, SYSTEM_PROMPT } from "../models";
import { fakeFetch, hangingFetch, jsonResponse } from "./helpers";

const KEY = "sk-ant-test-key-abcdef123456";

// Fixture typed with the SDK's own types (node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:
// TextBlock line 2338, CitationsWebSearchResultLocation line 1165, WebSearchToolResultBlock line 3460,
// WebSearchResultBlock line 3293, WebSearchToolResultError line 3478).
const intro: Anthropic.Messages.TextBlock = { type: "text", text: "EVOIX is an AI consultancy ", citations: null };
const cited: Anthropic.Messages.TextBlock = {
  type: "text",
  text: "based in DeLand, Florida.",
  citations: [
    {
      type: "web_search_result_location",
      url: "https://www.evoix.io/about",
      title: "About EVOIX",
      cited_text: "EVOIX is based in DeLand",
      encrypted_index: "abc",
    },
    {
      type: "web_search_result_location",
      url: "https://www.evoix.io/about",
      title: "About EVOIX",
      cited_text: "duplicate url",
      encrypted_index: "def",
    },
    { type: "web_search_result_location", url: "https://news.example.com/evoix", title: null, cited_text: "x", encrypted_index: "ghi" },
    { type: "char_location", cited_text: "doc", document_index: 0, document_title: null, end_char_index: 1, start_char_index: 0, file_id: null },
  ],
};
const searched: Anthropic.Messages.WebSearchToolResultBlock = {
  type: "web_search_tool_result",
  tool_use_id: "srvtoolu_1",
  caller: { type: "direct" },
  content: [
    { type: "web_search_result", url: "https://www.evoix.io/about", title: "About EVOIX", page_age: "2 weeks ago", encrypted_content: "enc1" },
    { type: "web_search_result", url: "https://directory.example.com/evoix", title: "EVOIX listing", page_age: null, encrypted_content: "enc2" },
  ],
};
const searchFailed: Anthropic.Messages.WebSearchToolResultBlock = {
  type: "web_search_tool_result",
  tool_use_id: "srvtoolu_2",
  caller: { type: "direct" },
  content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
};

const fixture: AnthropicMessageSubset = { model: "claude-haiku-4-5-20251001", content: [searched, intro, searchFailed, cited] };

describe("extractAnthropic", () => {
  it("joins text blocks, keeps web citations (deduped) and the search results seen", () => {
    const extracted = extractAnthropic(fixture);
    expect(extracted.text).toBe("EVOIX is an AI consultancy based in DeLand, Florida.");
    expect(extracted.model).toBe("claude-haiku-4-5-20251001");
    expect(extracted.sources).toEqual([
      { url: "https://www.evoix.io/about", domain: "evoix.io", title: "About EVOIX" },
      { url: "https://news.example.com/evoix", domain: "news.example.com", title: null },
    ]);
    expect(extracted.searchResults).toEqual([
      { url: "https://www.evoix.io/about", domain: "evoix.io", title: "About EVOIX" },
      { url: "https://directory.example.com/evoix", domain: "directory.example.com", title: "EVOIX listing" },
    ]);
  });

  it("treats an object web_search_tool_result content as an errored search, not a crash", () => {
    const extracted = extractAnthropic({ model: "claude-haiku-4-5", content: [searchFailed, intro] });
    expect(extracted.searchResults).toEqual([]);
    expect(extracted.sources).toEqual([]);
    expect(extracted.text).toBe("EVOIX is an AI consultancy ");
  });
});

const apiBody = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-haiku-4-5-20251001",
  content: [searched, intro, searchFailed, cited],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 20 },
};

describe("askAnthropic", () => {
  it("sends the user's key, the system prompt and the 20250305 web search tool, and returns the extracted answer", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(apiBody));
    const answer = await askAnthropic(KEY, "What is evoix.io?", { fetch: fetchImpl, timeoutMs: 5000 });

    const req = fetchImpl.requests[0];
    expect(req.url).toMatch(/\/v1\/messages$/);
    expect(req.headers.get("x-api-key")).toBe(KEY);
    expect(req.body).toMatchObject({
      model: ANTHROPIC_MODEL,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: "What is evoix.io?" }],
    });

    expect(answer.error).toBeNull();
    expect(answer.engine).toBe("anthropic");
    expect(answer.text).toBe("EVOIX is an AI consultancy based in DeLand, Florida.");
    expect(answer.sources.map((s) => s.domain)).toEqual(["evoix.io", "news.example.com"]);
    expect(answer.searchResults.map((s) => s.domain)).toEqual(["evoix.io", "directory.example.com"]);
  });

  it("returns an error answer on an API failure", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401)
    );
    const answer = await askAnthropic(KEY, "What is evoix.io?", { fetch: fetchImpl });
    expect(answer.text).toBe("");
    expect(answer.error).toMatch(/401/);
    expect(answer.error).not.toContain(KEY);
  });

  it("returns an error answer when the request times out", async () => {
    const answer = await askAnthropic(KEY, "What is evoix.io?", { fetch: hangingFetch(), timeoutMs: 30 });
    expect(answer.text).toBe("");
    expect(answer.error).toMatch(/timed out|timeout|abort/i);
  });
});
