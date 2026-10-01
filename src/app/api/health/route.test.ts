import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { setDbForTests } from "@/lib/db";
import { createTestDb } from "@/lib/db/test-db";
import { GET } from "./route";

let db: PGlite;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("GET /api/health", () => {
  it("reports db: true when SELECT 1 answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });

  it("reports db: false with a 503 when the database throws", async () => {
    setDbForTests({ query: async () => { throw new Error("connection refused"); } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: true, db: false });
    errorSpy.mockRestore();
    setDbForTests(db);
  });
});
