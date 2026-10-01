import "../server-only";
import type { License } from "../contracts";

/*
 * License session (builder B). Phase 1 stubs. The license key lives in an
 * httpOnly cookie; routes and pages call requireLicense() first and never
 * accept a license id from the client.
 */

export const LICENSE_COOKIE = "its_license";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** cookies() from next/headers, then findLicenseByKey. */
export async function getCurrentLicense(): Promise<License | null> {
  throw new Error("not implemented: getCurrentLicense");
}

/** Throws UnauthorizedError when there is no active license. */
export async function requireLicense(): Promise<License> {
  throw new Error("not implemented: requireLicense");
}

/** secure = NODE_ENV production, maxAge 365 days. */
export function licenseCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  throw new Error("not implemented: licenseCookieOptions");
}
