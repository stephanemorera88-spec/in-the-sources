import "../server-only";
import type { Source } from "../contracts";
import { normalizeDomain } from "./domains";
import { createLimiter } from "./limiter";

/**
 * On the Gemini API a grounding chunk's `web.uri` is usually a
 * vertexaisearch.cloud.google.com/grounding-api-redirect/... link, not the
 * page, and `web.domain` is empty (SPEC.md, "Engines", Gemini gotcha). Each
 * redirect is resolved with a manual-redirect fetch (Node returns the 3xx
 * with its Location header readable; verified 2026-10-01 against a local
 * server). When resolution fails, the chunk title (Gemini sets it to the
 * source hostname) becomes the domain and the url stays the redirect.
 */
export const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
export const REDIRECT_LOOKUP_TIMEOUT_MS = 5_000;
export const REDIRECT_LOOKUP_PARALLEL = 20;

export type FetchLike = typeof fetch;

export interface GroundingChunkInput {
  uri: string;
  title: string | null;
}

export interface ResolveOptions {
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: FetchLike;
  timeoutMs?: number;
  maxParallel?: number;
}

export function isGroundingRedirect(uri: string): boolean {
  try {
    return new URL(uri).hostname.toLowerCase() === GROUNDING_REDIRECT_HOST;
  } catch {
    return false;
  }
}

/** One lookup: the absolute Location of a 3xx answer, or null on anything else (timeouts included). */
export async function resolveRedirect(uri: string, fetchImpl: FetchLike, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetchImpl(uri, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    try {
      await res.body?.cancel();
    } catch {
      /* nothing to release */
    }
    if (res.status < 300 || res.status > 399) return null;
    const location = res.headers.get("location");
    if (!location) return null;
    return new URL(location, uri).toString();
  } catch {
    return null;
  }
}

/** Resolves every chunk into a Source, at most `maxParallel` lookups in flight. Order is preserved. */
export async function resolveGroundingSources(chunks: GroundingChunkInput[], opts: ResolveOptions = {}): Promise<Source[]> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? REDIRECT_LOOKUP_TIMEOUT_MS;
  const limit = createLimiter(opts.maxParallel ?? REDIRECT_LOOKUP_PARALLEL);
  return Promise.all(
    chunks.map((chunk) =>
      limit(async (): Promise<Source> => {
        const title = chunk.title?.trim() || null;
        if (!isGroundingRedirect(chunk.uri)) {
          return { url: chunk.uri, domain: normalizeDomain(chunk.uri), title };
        }
        const target = await resolveRedirect(chunk.uri, fetchImpl, timeoutMs);
        if (target) return { url: target, domain: normalizeDomain(target), title };
        const titleIsHost = title !== null && title.includes(".") && !/\s/.test(title);
        return { url: chunk.uri, domain: titleIsHost && title ? normalizeDomain(title) : "", title };
      })
    )
  );
}
