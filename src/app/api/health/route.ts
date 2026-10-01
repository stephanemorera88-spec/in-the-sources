import { getDb } from "@/lib/db";

/** GET /api/health -> { ok: true, db: boolean }; 503 when the database does not answer SELECT 1. */
export async function GET(): Promise<Response> {
  let db = false;
  try {
    const { rows } = await getDb().query("SELECT 1 AS one");
    db = rows.length === 1;
  } catch (err: unknown) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : err);
  }
  return Response.json({ ok: true, db }, { status: db ? 200 : 503 });
}
