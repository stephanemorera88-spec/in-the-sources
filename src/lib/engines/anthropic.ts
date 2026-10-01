import "../server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { EngineAnswer, Source } from "../contracts";
import { dedupeSources, describeError, failedAnswer, type EngineOpts } from "./common";
import { normalizeDomain } from "./domains";
import { ANTHROPIC_MODEL, QUERY_TIMEOUT_MS, SYSTEM_PROMPT } from "./models";

/**
 * The parts of a Message this module reads
 * (node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts line 1921).
 */
export type AnthropicMessageSubset = Pick<Anthropic.Messages.Message, "content" | "model">;

export interface AnthropicExtract {
  text: string;
  sources: Source[];
  searchResults: Source[];
  model: string;
}

/** Pure extraction: text, cited sources, search results seen, model. */
export function extractAnthropic(message: AnthropicMessageSubset): AnthropicExtract {
  const textParts: string[] = [];
  const sources: Source[] = [];
  const searchResults: Source[] = [];
  // message.content: messages.d.ts line 1968 (`Array<ContentBlock>`, union at line 1759).
  for (const block of message.content) {
    if (block.type === "text") {
      // TextBlock lines 2346 (`citations: Array<TextCitation> | null`), 2347 (`text`), 2348 (`type: 'text'`).
      textParts.push(block.text);
      for (const citation of block.citations ?? []) {
        // CitationsWebSearchResultLocation lines 1165-1171: cited_text, encrypted_index,
        // title (string | null), type 'web_search_result_location', url.
        if (citation.type !== "web_search_result_location") continue;
        sources.push({ url: citation.url, domain: normalizeDomain(citation.url), title: citation.title || null });
      }
    } else if (block.type === "web_search_tool_result") {
      // WebSearchToolResultBlock line 3460; its `content` (line 3462) is
      // WebSearchToolResultError | Array<WebSearchResultBlock> (line 3466). An object
      // means the search itself failed (line 3478), so only an array carries results.
      if (!Array.isArray(block.content)) continue;
      for (const result of block.content) {
        // WebSearchResultBlock lines 3293-3299: encrypted_content, page_age, title, type 'web_search_result', url.
        searchResults.push({ url: result.url, domain: normalizeDomain(result.url), title: result.title || null });
      }
    }
  }
  return {
    text: textParts.join(""),
    sources: dedupeSources(sources),
    searchResults: dedupeSources(searchResults),
    model: message.model || ANTHROPIC_MODEL, // Message.model line 1980
  };
}

/** One prompt through Claude Haiku 4.5 with the web search tool. Never throws: failures come back as `error`. */
export async function askAnthropic(apiKey: string, prompt: string, opts: EngineOpts = {}): Promise<EngineAnswer> {
  const started = Date.now();
  const timeout = opts.timeoutMs ?? QUERY_TIMEOUT_MS;
  try {
    // BYOK: client built per call with the user's key; process.env is never read.
    // ClientOptions: node_modules/@anthropic-ai/sdk/client.d.ts lines 42 (apiKey), 126 (maxRetries), 108 (fetch, test seam).
    const client = new Anthropic({ apiKey, maxRetries: 1, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
    const message = await client.messages.create(
      {
        model: ANTHROPIC_MODEL, // messages.d.ts line 3582
        max_tokens: 2048, // line 3506
        system: SYSTEM_PROMPT, // line 3651
        // tools line 3754; WebSearchTool20250305 lines 3313 (name), 3314 (type), 3338 (max_uses).
        // The 20250305 variant is the one Haiku 4.5 supports (SPEC.md).
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: prompt }], // line 3575
      },
      { timeout } // milliseconds, node_modules/@anthropic-ai/sdk/internal/request-options.d.ts line 82
    );
    const extracted = extractAnthropic(message);
    const latencyMs = Date.now() - started;
    if (!extracted.text) return failedAnswer("anthropic", extracted.model, latencyMs, "Anthropic returned no text");
    return {
      engine: "anthropic",
      model: extracted.model,
      text: extracted.text,
      sources: extracted.sources,
      searchResults: extracted.searchResults,
      latencyMs,
      error: null,
    };
  } catch (err) {
    return failedAnswer("anthropic", ANTHROPIC_MODEL, Date.now() - started, describeError(err, apiKey));
  }
}
