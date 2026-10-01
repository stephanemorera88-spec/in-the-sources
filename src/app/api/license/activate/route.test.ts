import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLicense } from "@/lib/db";
import { TEST_KEY_ENCRYPTION_SECRET, createTestDb } from "@/lib/db/test-db";
import { POST, resetActivateRateLimit } from "./route";
import { POST as LOGOUT } from "../logout/route";

let db: PGlite;
let key = "";
beforeAll(async () => {
  process.env.KEY_ENCRYPTION_SECRET = TEST_KEY_ENCRYPTION_SECRET;
  db = await createTestDb();
  key = (await createLicense({ email: "act@example.com", plan: "founder" })).key;
});
afterAll(async () => {
  await db.close();
});
beforeEach(() => resetActivateRateLimit());

function post(body: unknown, ip = "203.0.113.5"): Request {
  return new Request("http://localhost/api/license/activate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/license/activate", () => {
  it("sets an httpOnly, lax, path / cookie holding the key and returns the plan", async () => {
    const res = await POST(post({ key: `  ${key} ` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, plan: "founder" });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie.startsWith(`its_license=${key};`)).toBe(true);
    expect(cookie).toMatch(/httponly/i);
    expect(cookie).toMatch(/samesite=lax/i);
    expect(cookie).toMatch(/path=\//i);
    expect(cookie).toMatch(/max-age=31536000/i);
    expect(cookie).not.toMatch(/secure/i); // NODE_ENV is "test" here
  });

  it("returns 401 for an unknown key and a revoked key", async () => {
    const res = await POST(post({ key: "its_unknown_key_0000000000000000" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("set-cookie")).toBeNull();

    const revoked = await createLicense({ email: "rev@example.com", plan: "founder" });
    await db.query("UPDATE licenses SET status = 'revoked' WHERE id = $1", [revoked.license.id]);
    expect((await POST(post({ key: revoked.key }))).status).toBe(401);
  });

  it("returns 400 for a bad body or invalid JSON", async () => {
    const short = await POST(post({ key: "abc" }));
    expect(short.status).toBe(400);
    expect((await short.json()).error).toContain("too short");
    const missing = await POST(post({}));
    expect(missing.status).toBe(400);
    const bad = await POST(post("{nope"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "The request body must be JSON." });
  });

  it("rate limits the 11th call in a minute per IP and keeps other IPs open", async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await POST(post({ key: "its_unknown_key_0000000000000000" }, "198.51.100.7"));
      expect(res.status).toBe(401);
    }
    const eleventh = await POST(post({ key }, "198.51.100.7"));
    expect(eleventh.status).toBe(429);
    expect(await eleventh.json()).toEqual({ error: "Too many attempts. Wait a minute and try again." });
    expect(eleventh.headers.get("retry-after")).toBe("60");
    expect(eleventh.headers.get("set-cookie")).toBeNull();

    const other = await POST(post({ key }, "198.51.100.8"));
    expect(other.status).toBe(200);
  });
});

describe("POST /api/license/logout", () => {
  it("expires the cookie on the same path", async () => {
    const res = await LOGOUT();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie.startsWith("its_license=;")).toBe(true);
    expect(cookie).toMatch(/max-age=0/i);
    expect(cookie).toMatch(/path=\//i);
    expect(cookie).toMatch(/httponly/i);
  });
});
