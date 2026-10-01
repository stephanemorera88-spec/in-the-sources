import "../server-only";
import OpenAI from "openai";
import type { EngineAnswer, Source } from "../contracts";
import { dedupeSources, describeError, failedAnswer, type EngineOpts } from "./common";
import { normalizeDomain } from "./domains";
import { OPENAI_MODEL, QUERY_TIMEOUT_MS, SYSTEM_PROMPT } from "./models";

/**
 * The parts of the Responses API result this module reads. Every member comes
 * from the SDK's Response type (node_modules/openai/resources/responses/responses.d.ts
 * line 787), so a fixture typed with this fails to compile on a wrong field name.
 */
export type OpenAIResponseSubset = Pick<OpenAI.Responses.Response, "output" | "output_text" | "model" | "error">;

export interface OpenAIExtract {
  text: string;
  sources: Source[];
  model: string;
  error: string | null;
}

/** Pure extraction: text, cited sources (deduped by url), model, and a response-level error when the API reported one. */
export function extractOpenAI(response: OpenAIResponseSubset): OpenAIExtract {
  // Text: responses.d.ts line 797 (`output_text: string`, assembled by the SDK).
  const text = response.output_text ?? "";
  const sources: Source[] = [];
  // Citations: responses.d.ts line 844 (`output: Array<ResponseOutputItem>`);
  // message items line 5371 (`type: 'message'`) with `content` line 5358;
  // output_text parts line 5408 with `annotations` line 5400;
  // url_citation entries lines 5452 (type), 5456 (url) and 5448 (title).
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== "url_citation") continue;
        sources.push({ url: annotation.url, domain: normalizeDomain(annotation.url), title: annotation.title || null });
      }
    }
  }
  // Response-level failure: responses.d.ts line 801 (`error: ResponseError | null`);
  // ResponseError line 2410 carries `code` and `message`.
  const error = response.error ? `${response.error.code}: ${response.error.message}` : null;
  return { text, sources: dedupeSources(sources), model: response.model || OPENAI_MODEL, error };
}

/** One prompt through gpt-5-mini with web search on. Never throws: failures come back as `error`. */
export async function askOpenAI(apiKey: string, prompt: string, opts: EngineOpts = {}): Promise<EngineAnswer> {
  const started = Date.now();
  const timeout = opts.timeoutMs ?? QUERY_TIMEOUT_MS;
  try {
    // BYOK: the client is built per call with the user's key; process.env is never read.
    // ClientOptions: node_modules/openai/client.d.ts lines 62 (apiKey), 136 (maxRetries), 129 (fetch, test seam).
    const client = new OpenAI({ apiKey, maxRetries: 1, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
    const response = await client.responses.create(
      {
        model: OPENAI_MODEL, // responses.d.ts line 8912
        instructions: SYSTEM_PROMPT, // line 8889
        input: prompt, // line 8881
        tools: [{ type: "web_search" }], // line 9076; WebSearchTool.type line 8758
        reasoning: { effort: "low" }, // line 8975; Reasoning.effort in resources/shared.d.ts line 188
      },
      { timeout } // milliseconds, node_modules/openai/internal/request-options.d.ts line 47
    );
    const extracted = extractOpenAI(response);
    const latencyMs = Date.now() - started;
    if (extracted.error) return failedAnswer("openai", extracted.model, latencyMs, extracted.error);
    if (!extracted.text) return failedAnswer("openai", extracted.model, latencyMs, "OpenAI returned no text");
    return {
      engine: "openai",
      model: extracted.model,
      text: extracted.text,
      sources: extracted.sources,
      searchResults: [],
      latencyMs,
      error: null,
    };
  } catch (err) {
    return failedAnswer("openai", OPENAI_MODEL, Date.now() - started, describeError(err, apiKey));
  }
}
