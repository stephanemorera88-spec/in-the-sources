import Anthropic from "@anthropic-ai/sdk";
import { runPlatformQueries, ANTHROPIC_MODEL, AUDIT_SYSTEM_PROMPT, QUERY_TIMEOUT_MS } from "./runner";
import type { QueryParams, PlatformResult, QueryType } from "./types";

export async function queryAnthropic(params: QueryParams, types?: QueryType[]): Promise<PlatformResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

  return runPlatformQueries("anthropic", params, async (query) => {
    const message = await client.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: AUDIT_SYSTEM_PROMPT,
        // web_search_20250305 is the variant Haiku supports; user_location
        // biases results to the audited business's own market.
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3,
            user_location: {
              type: "approximate",
              city: params.city,
              region: params.state,
              country: "US",
            },
          },
        ],
        messages: [{ role: "user", content: query }],
      },
      { timeout: QUERY_TIMEOUT_MS }
    );

    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }, types);
}
