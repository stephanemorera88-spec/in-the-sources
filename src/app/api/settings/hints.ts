import type { EngineId, EngineKeyHint } from "@/lib/contracts";
import { ENGINES } from "@/lib/contracts";

/*
 * Re-projects engine key hints field by field before they are serialized, so
 * an extra field on a data-layer row (ciphertext, apiKey, anything) cannot
 * reach the browser, and the hint itself is capped at its last four
 * characters. Lives beside the route because a route.ts may only export
 * HTTP handlers and segment config.
 */

function projectHint(raw: EngineKeyHint | undefined): EngineKeyHint {
  const set = raw?.set === true;
  const hint = set && typeof raw?.hint === "string" && raw.hint.length > 0 ? raw.hint.slice(-4) : null;
  const updatedAt = set && typeof raw?.updatedAt === "string" ? raw.updatedAt : null;
  return { set, hint, updatedAt };
}

export function projectHints(raw: Partial<Record<EngineId, EngineKeyHint>>): Record<EngineId, EngineKeyHint> {
  const out = {} as Record<EngineId, EngineKeyHint>;
  for (const engine of ENGINES) out[engine] = projectHint(raw[engine]);
  return out;
}
