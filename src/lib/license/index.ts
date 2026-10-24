import "../server-only";
import { cookies } from "next/headers";
import type { License } from "../contracts";
import { findLicenseByKey } from "../db";
import { InvalidInputError, NotFoundError } from "../db/errors";

export { InvalidInputError, NotFoundError };

/*
 * License session (module B). The plaintext license key lives in an
 * httpOnly cookie; pages call getCurrentLicense() and route handlers wrap
 * themselves in withLicense from src/app/api/_lib/with-license.ts (which
 * calls requireLicense() first and maps UnauthorizedError, zod errors and
 * the data-layer errors to JSON with plain messages). Nothing here ever
 * accepts a license id from the client.
 */

export const LICENSE_COOKIE = "its_license";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** cookies() from next/headers (async in Next 16), then findLicenseByKey. */
export async function getCurrentLicense(): Promise<License | null> {
  const store = await cookies();
  const key = store.get(LICENSE_COOKIE)?.value?.trim();
  if (!key) return null;
  return findLicenseByKey(key);
}

/** Throws UnauthorizedError when there is no active license. */
export async function requireLicense(): Promise<License> {
  const license = await getCurrentLicense();
  if (!license) throw new UnauthorizedError();
  return license;
}

/** secure = NODE_ENV production, maxAge 365 days. */
export function licenseCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}
