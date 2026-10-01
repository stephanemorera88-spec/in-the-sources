import { generateQueries, parseResponse } from "./queries";
import type { QueryParams, PlatformResult, QueryResult, QueryType } from "./types";

/* Model IDs live here (env-overridable) so a deprecated ID is a one-line fix,
   not a three-file hunt. All three calls run with live web search/grounding —
   parametric-only answers hallucinate local businesses and made the AI
   Visibility score fictional (2026-07-02 review). */
export const OPENAI_MODEL = process.env.AUDIT_OPENAI_MODEL ?? "gpt-5-mini";
export const GEMINI_MODEL = process.env.AUDIT_GEMINI_MODEL ?? "gemini-2.5-flash";
export const ANTHROPIC_MODEL = process.env.AUDIT_ANTHROPIC_MODEL ?? "claude-haiku-4-5";

// One hung call must not eat the whole function budget (route maxDuration).
// 90s: gpt-5-mini with web_search takes ~50s at default reasoning (2026-09-15
// Appture scan: 4/5 OpenAI queries timed out at the old 45s cap).
export const QUERY_TIMEOUT_MS = 90_000;

/* Low reasoning effort on the OpenAI audit calls: ~13s per query instead of
   ~50s, same web-grounded answer shape. Env-overridable like the model IDs. */
export const OPENAI_REASONING_EFFORT = (process.env.AUDIT_OPENAI_REASONING ?? "low") as
  | "minimal"
  | "low"
  | "medium"
  | "high";

/* No "include specific business names when possible" — with search attached
   that instruction is unnecessary, and without results it asks the model to
   fabricate. Grounding honesty beats coverage. */
export const AUDIT_SYSTEM_PROMPT =
  "You help consumers research local businesses. Use web search to answer with current, real information. Name only businesses you can verify from search results, and cite what you found. If you cannot find relevant businesses, say so plainly instead of guessing.";

export async function runPlatformQueries(
  platform: PlatformResult["platform"],
  params: QueryParams,
  callModel: (query: string) => Promise<string>,
  /* When set, only these query types run — the teaser stage asks a single
     "recommendation" question per engine; the unlock stage runs the rest. */
  types?: QueryType[]
): Promise<PlatformResult> {
  const queries = types
    ? generateQueries(params).filter((q) => types.includes(q.type))
    : generateQueries(params);

  const results: QueryResult[] = await Promise.all(
    queries.map(async ({ type, query }) => {
      try {
        const rawResponse = await callModel(query);
        return {
          queryType: type,
          query,
          rawResponse,
          ...parseResponse(params.businessName, rawResponse),
        };
      } catch (err) {
        return {
          queryType: type,
          query,
          mentioned: false,
          recommended: false,
          position: null,
          sentiment: null,
          errored: true,
          rawResponse: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        };
      }
    })
  );

  const erroredCount = results.filter((r) => r.errored).length;
  return {
    platform,
    results,
    // A fully-failed platform must surface as an error, not as 0 visibility.
    error:
      erroredCount === results.length && results.length > 0
        ? `All ${platform} queries failed: ${results[0].rawResponse.slice(0, 200)}`
        : null,
  };
}
