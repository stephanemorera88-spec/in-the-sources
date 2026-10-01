import { NextResponse } from "next/server";
import { LICENSE_COOKIE, licenseCookieOptions } from "@/lib/license";

/*
 * POST /api/license/logout: clears the its_license cookie. Always 200.
 * An explicit empty value with maxAge 0 on the same path and attributes is
 * the reliable way to make every browser drop the cookie.
 */
export async function POST(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LICENSE_COOKIE, "", { ...licenseCookieOptions(), maxAge: 0 });
  return res;
}
