import "@/lib/server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { listProjectsForDailyRun } from "@/lib/db";
import { executeRun } from "@/lib/runs";

/*
 * GET /api/cron/daily (builder D). Vercel calls it on the schedule in
 * vercel.json and, when CRON_SECRET is set on the project, adds
 * `Authorization: Bearer ${CRON_SECRET}` to the request.
 *
 * Flow: 500 when CRON_SECRET is unset (nothing could ever authenticate), 401
 * on a missing or wrong bearer (constant-time compare), then every project
 * from listProjectsForDailyRun runs sequentially through executeRun(...,
 * "cron") until the 240 s wall budget is spent. Each run is wrapped in
 * try/catch so one bad project never stops the rest. The JSON report counts
 * started, finished and skipped projects and lists errors.
 *
 * Only route exports live here (GET, maxDuration): Next's route type check
 * rejects any other value export from a route file.
 */

/** Seconds. Vercel kills the function at this point, so the loop stops starting runs 60 s earlier. */
export const maxDuration = 300;

/** Wall budget for the sequential loop, in ms, measured with Date.now(). */
const RUN_BUDGET_MS = 240_000;

interface DailyCronReport {
  started: number;
  finished: number;
  skipped: number;
  errors: string[];
}

/** Compares two strings in constant time. Hashing first keeps the buffers equal length; timingSafeEqual throws otherwise. */
function constantTimeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(authorization, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deadline = Date.now() + RUN_BUDGET_MS;

  let projects: Array<{ licenseId: string; projectId: string }>;
  try {
    projects = await listProjectsForDailyRun();
  } catch (err) {
    return NextResponse.json({ error: `listProjectsForDailyRun failed: ${errorMessage(err)}` }, { status: 500 });
  }

  const report: DailyCronReport = { started: 0, finished: 0, skipped: 0, errors: [] };

  for (const { licenseId, projectId } of projects) {
    if (Date.now() >= deadline) {
      report.skipped += 1;
      continue;
    }
    report.started += 1;
    try {
      const run = await executeRun(licenseId, projectId, "cron");
      report.finished += 1;
      // executeRun resolves with a failed run instead of throwing once the run row exists.
      if (run.status === "failed") {
        report.errors.push(`${projectId}: run ${run.id} failed`);
      }
    } catch (err) {
      report.errors.push(`${projectId}: ${errorMessage(err)}`);
    }
  }

  if (process.env.NODE_ENV !== "test") {
    console.info("[cron/daily]", JSON.stringify(report));
  }

  return NextResponse.json(report);
}
