import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLicense } from "../db";
import { TEST_KEY_ENCRYPTION_SECRET, createTestDb } from "../db/test-db";

// Stub next/headers: cookies() is async in Next 16 and needs a request scope outside tests.
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined),
  }),
}));

import { LICENSE_COOKIE, UnauthorizedError, getCurrentLicense, licenseCookieOptions, requireLicense } from "./index";

let db: PGlite;
let key = "";
let licenseId = "";
beforeAll(async () => {
  process.env.KEY_ENCRYPTION_SECRET = TEST_KEY_ENCRYPTION_SECRET;
  db = await createTestDb();
  const created = await createLicense({ email: "cookie@example.com", plan: "founder" });
  key = created.key;
  licenseId = created.license.id;
});
afterAll(async () => {
  await db.close();
});

describe("licenseCookieOptions", () => {
  it("is httpOnly, lax, path /, one year, secure only in production", () => {
    const opts = licenseCookieOptions();
    expect(opts).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 });
    expect(LICENSE_COOKIE).toBe("its_license");
  });
});

describe("getCurrentLicense / requireLicense", () => {
  it("returns null with no cookie and the license with a valid one", async () => {
    cookieJar.clear();
    expect(await getCurrentLicense()).toBeNull();
    await expect(requireLicense()).rejects.toThrow(UnauthorizedError);

    cookieJar.set(LICENSE_COOKIE, "its_bogus_key_000000000000000000");
    expect(await getCurrentLicense()).toBeNull();

    cookieJar.set(LICENSE_COOKIE, key);
    const license = await requireLicense();
    expect(license.id).toBe(licenseId);
    expect(license).not.toHaveProperty("keyHash");
  });

  it("ignores a cookie holding only whitespace", async () => {
    cookieJar.set(LICENSE_COOKIE, "   ");
    expect(await getCurrentLicense()).toBeNull();
  });
});
