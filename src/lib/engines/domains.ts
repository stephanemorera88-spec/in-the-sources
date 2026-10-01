/**
 * Domain helpers shared by the engines and the analyzer. Pure functions with
 * no secrets, so no server-only guard: the UI may import them one day.
 */

/**
 * Lowercase host of a URL or a bare host: scheme, "www.", port and path
 * removed. Returns "" when the input cannot be parsed as a host.
 */
export function normalizeDomain(urlOrHost: string): string {
  const trimmed = (urlOrHost ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname;
  } catch {
    return "";
  }
  return hostname.replace(/^www\./, "").replace(/\.+$/, "");
}

/**
 * True when `candidate` is `domain` or a subdomain of it (SPEC.md, "Domain
 * matching"). Both sides are normalized first; an empty side never matches.
 */
export function domainMatches(candidate: string, domain: string): boolean {
  const c = normalizeDomain(candidate);
  const d = normalizeDomain(domain);
  if (!c || !d) return false;
  return c === d || c.endsWith(`.${d}`);
}
