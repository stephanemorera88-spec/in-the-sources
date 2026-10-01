import OpenAI from "openai";
import {
  runPlatformQueries,
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT,
  AUDIT_SYSTEM_PROMPT,
  QUERY_TIMEOUT_MS,
} from "./runner";
import type { QueryParams, PlatformResult, QueryType } from "./types";

export async function queryOpenAI(params: QueryParams, types?: QueryType[]): Promise<PlatformResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

  return runPlatformQueries(
    "openai",
    params,
    async (query) => {
      // Responses API with the web_search tool — answers reflect what
      // ChatGPT-with-search actually says, not parametric memory.
      const response = await client.responses.create(
        {
          model: OPENAI_MODEL,
          instructions: AUDIT_SYSTEM_PROMPT,
          input: query,
          tools: [{ type: "web_search" }],
          reasoning: { effort: OPENAI_REASONING_EFFORT },
        },
        { timeout: QUERY_TIMEOUT_MS }
      );
      return response.output_text ?? "";
    },
    types
  );
}
