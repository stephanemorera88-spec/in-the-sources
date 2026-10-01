/*
 * The activation link. The license key travels in the URL fragment, never
 * in the query string: a fragment is not sent to the server, so it stays out
 * of Vercel request logs and off any analytics script, and the form drops it
 * from the address bar as soon as it has read it. Pure helpers, safe in both
 * the server (email) and the client (ActivateForm) bundles.
 */

export const ACTIVATE_FRAGMENT_PARAM = "k";

/** Path and fragment of the activation link: /activate#k=<key>. */
export function activatePath(key: string): string {
  return `/activate#${ACTIVATE_FRAGMENT_PARAM}=${encodeURIComponent(key)}`;
}

/** The key carried by a location hash ("#k=its_..."), or "" when there is none. */
export function keyFromFragment(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return "";
  const value = new URLSearchParams(raw).get(ACTIVATE_FRAGMENT_PARAM);
  return value ? value.trim() : "";
}
