import "../server-only";

/**
 * Site text for prompt suggestions (SPEC.md, fetchSiteText). Tries
 * https://domain/llms.txt first, then the home page with markup stripped,
 * at most SITE_TEXT_MAX_CHARS characters.
 *
 * A private or malformed address throws (the caller shows the message).
 * A site that cannot be fetched returns "" so suggestions still run on the
 * brand name and domain alone.
 */

export const SITE_FETCH_TIMEOUT_MS = 10_000;
export const SITE_TEXT_MAX_CHARS = 8000;
const LLMS_MIN_CHARS = 200;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2_000_000;
const USER_AGENT = "InTheSourcesBot/0.1 (+https://evoix.io)";

export type FetchLike = typeof fetch;

/* SSRF guard, copied from the site (evoix-website src/lib/audit/request-guards.ts,
   validateScanUrl): the server fetches this URL, so reject non-http schemes,
   localhost, and private or link-local ranges. */
export function validateScanUrl(raw: string): { url: string } | { error: string } {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: "That doesn't look like a valid website address." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Website must be an http(s) address." };
  }
  const host = parsed.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^\[?(f[cd][0-9a-f]{2}:|fe80:)/i.test(host);
  if (privateHost || !host.includes(".")) {
    return { error: "Please enter a public website address." };
  }
  return { url: parsed.toString() };
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* nothing to release */
  }
}

/** Follows up to MAX_REDIRECTS hops by hand so every hop goes through the guard. */
async function guardedFetch(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const check = validateScanUrl(current);
    if ("error" in check) return null;
    const res = await fetchImpl(check.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/plain, text/markdown, text/html;q=0.9, */*;q=0.1",
      },
    });
    if (res.status >= 300 && res.status <= 399) {
      const location = res.headers.get("location");
      await discard(res);
      if (!location) return null;
      current = new URL(location, check.url).toString();
      continue;
    }
    return res;
  }
  return null;
}

/** Reads at most `maxBytes` of the body, then cancels the rest. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (total >= maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* already closed */
      }
      break;
    }
  }
  return out + decoder.decode();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  hellip: "\u2026",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

function codePoint(code: number): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_whole, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_whole, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

/** Visible text of an HTML document: scripts, styles, nav and every tag removed, whitespace collapsed. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|nav)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function cut(text: string): string {
  return text.length > SITE_TEXT_MAX_CHARS ? text.slice(0, SITE_TEXT_MAX_CHARS) : text;
}

export async function fetchSiteText(
  domain: string,
  deps: { fetch?: FetchLike; timeoutMs?: number } = {}
): Promise<string> {
  const check = validateScanUrl(domain);
  if ("error" in check) throw new Error(check.error);
  const origin = new URL(check.url).origin;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? SITE_FETCH_TIMEOUT_MS;

  try {
    const res = await guardedFetch(`${origin}/llms.txt`, fetchImpl, timeoutMs);
    if (res) {
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (res.status === 200 && (type.startsWith("text/plain") || type.startsWith("text/markdown"))) {
        const body = (await readCapped(res, MAX_BODY_BYTES)).trim();
        if (body.length > LLMS_MIN_CHARS) return cut(body);
      } else {
        await discard(res);
      }
    }
  } catch {
    /* fall through to the home page */
  }

  try {
    const res = await guardedFetch(`${origin}/`, fetchImpl, timeoutMs);
    if (!res) return "";
    if (!res.ok) {
      await discard(res);
      return "";
    }
    const html = await readCapped(res, MAX_BODY_BYTES);
    return cut(htmlToText(html));
  } catch {
    return "";
  }
}
