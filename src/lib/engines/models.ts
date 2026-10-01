/**
 * Engine model ids and run limits. Env-overridable so a deprecated model id
 * is a Vercel env change, not a deploy. No server-only guard here: these are
 * plain constants and the env vars are server-side anyway (on the client the
 * defaults apply).
 */

function fromEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

export const OPENAI_MODEL = fromEnv("ENGINE_OPENAI_MODEL", "gpt-5-mini");
export const ANTHROPIC_MODEL = fromEnv("ENGINE_ANTHROPIC_MODEL", "claude-haiku-4-5");
export const GEMINI_MODEL = fromEnv("ENGINE_GEMINI_MODEL", "gemini-2.5-flash");

/** Per-call timeout. OpenAI with web search can take 50 s. */
export const QUERY_TIMEOUT_MS = 90_000;

/** Calls in flight per run. */
export const RUN_CONCURRENCY = 8;

/** Identical for all three engines. We measure what the engine says; we do not steer it. */
export const SYSTEM_PROMPT = "Answer the question using web search. Use current information and cite your sources.";
