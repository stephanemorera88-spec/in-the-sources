import { NextResponse } from "next/server";
import { z } from "zod";
import { findLicenseByKey } from "@/lib/db";
import { LICENSE_COOKIE, licenseCookieOptions } from "@/lib/license";
import { errorToResponse, jsonError, jsonUnauthorized, readJson } from "@/app/api/_lib/with-license";

/*
 * POST /api/license/activate  body { key }
 * 200 { ok: true, plan } and sets the its_license cookie (httpOnly, lax, path /, 1 year).
 * 400 on a bad body, 401 on an unknown or revoked key, 429 after 10 calls per minute per IP.
 * Error bodies are { error: <plain sentence> }, the same shape every other
 * route returns, because the activate form shows the message as-is.
 */

const bodySchema = z.object({
  key: z.string("Paste your license key.").trim().min(8, "That key looks too short.").max(128, "That key looks too long."),
});

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/** Client IP: first value of x-forwarded-for (Vercel sets it), else "unknown". */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/** True when this call is still within the limit; records the hit. */
function allow(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map small on a long-lived instance.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  return true;
}

/** Tests call this between cases. */
export function resetActivateRateLimit(): void {
  hits.clear();
}

export async function POST(req: Request): Promise<Response> {
  if (!allow(clientIp(req))) {
    const res = jsonError("Too many attempts. Wait a minute and try again.", 429);
    res.headers.set("retry-after", "60");
    return res;
  }
  try {
    const body = bodySchema.parse(await readJson(req));
    const license = await findLicenseByKey(body.key);
    if (!license) return jsonUnauthorized();

    const res = NextResponse.json({ ok: true, plan: license.plan });
    // response.cookies.set(name, value, options) on NextResponse (task text, Next 16).
    res.cookies.set(LICENSE_COOKIE, body.key, licenseCookieOptions());
    return res;
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}
