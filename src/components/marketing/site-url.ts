/**
 * Public origin of the deployment, from NEXT_PUBLIC_BASE_URL. Falls back to
 * localhost when the variable is unset or not a URL, the same rule the root
 * layout applies to metadataBase. `.origin` drops any path or trailing slash
 * so callers can append "/sitemap.xml" or "/activate" safely.
 */
export function siteOrigin(): string {
  const fallback = "http://localhost:3000";
  const raw = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!raw) return fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}
