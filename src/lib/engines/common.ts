import type { EngineAnswer, EngineId, Source } from "../contracts";

/**
 * Options every engine call accepts. `fetch` is a test seam: all three SDKs
 * accept a custom fetch, which lets the tests assert the request shape and
 * the error path without the network. Production code leaves it unset.
 */
export interface EngineOpts {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Dedupe by url, first occurrence wins, order preserved. Entries without a url are dropped. */
export function dedupeSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const source of list) {
    const url = (source.url ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, domain: source.domain, title: source.title });
  }
  return out;
}

/* Provider key shapes, in case an SDK echoes one back in an error message.
   "*" is in the class because OpenAI returns a rejected key partly masked
   ("Incorrect API key provided: sk-test-****7890"); the prefix is still key
   material, so the whole token goes. */
const KEY_PATTERNS: readonly RegExp[] = [/\bsk-[A-Za-z0-9_*-]{6,}/g, /\bAIza[0-9A-Za-z_*-]{10,}/g];

/** Plain one-line message for a failed call: no stack, no key material, at most 500 chars. */
export function describeError(err: unknown, apiKey?: string): string {
  let message: string;
  if (err instanceof Error) {
    const name = err.name && err.name !== "Error" ? `${err.name}: ` : "";
    message = `${name}${err.message}`;
  } else if (typeof err === "string") {
    message = err;
  } else {
    message = "Unknown error";
  }
  if (apiKey && apiKey.length >= 8) message = message.split(apiKey).join("[redacted]");
  for (const pattern of KEY_PATTERNS) message = message.replace(pattern, "[redacted]");
  message = message.replace(/\s+/g, " ").trim();
  if (!message) message = "Unknown error";
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

/** The answer shape for a call that did not produce text. Never thrown, always returned. */
export function failedAnswer(engine: EngineId, model: string, latencyMs: number, error: string): EngineAnswer {
  return { engine, model, text: "", sources: [], searchResults: [], latencyMs, error };
}
