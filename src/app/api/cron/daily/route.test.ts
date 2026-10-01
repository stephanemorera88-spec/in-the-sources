import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "@/lib/contracts";

/* The route imports the data layer and the run orchestrator; both are
   mocked so no database or engine is touched. vi.mock is hoisted above the
   imports below. */
vi.mock("@/lib/db", () => ({ listProjectsForDailyRun: vi.fn(), sweepStaleRuns: vi.fn() }));
vi.mock("@/lib/runs", () => ({ executeRun: vi.fn() }));

import { listProjectsForDailyRun, sweepStaleRuns } from "@/lib/db";
import { executeRun } from "@/lib/runs";
import { GET } from "./route";

const SECRET = "test-cron-secret-0123456789";
const ROUTE_URL = "http://localhost:3000/api/cron/daily";

/** Mirrors RUN_BUDGET_MS (src/lib/engines/models.ts), the loop budget and every run's deadline. */
const BUDGET_MS = 240_000;

const listMock = vi.mocked(listProjectsForDailyRun);
const runMock = vi.mocked(executeRun);
const sweepMock = vi.mocked(sweepStaleRuns);

/** executeRun receives the trigger plus a deadline from the cron's budget. */
const cronCall = (licenseId: string, projectId: string) => [licenseId, projectId, "cron", { deadline: expect.any(Number) }];

function request(authorization?: string): Request {
  return new Request(ROUTE_URL, { headers: authorization ? { authorization } : {} });
}

function fakeRun(projectId: string, status: Run["status"] = "complete"): Run {
  return {
    id: `run_${projectId}`,
    projectId,
    trigger: "cron",
    status,
    startedAt: "2026-10-01T11:00:00.000Z",
    finishedAt: "2026-10-01T11:01:00.000Z",
  };
}

function projects(count: number): Array<{ licenseId: string; projectId: string }> {
  return Array.from({ length: count }, (_, i) => ({ licenseId: `lic_${i + 1}`, projectId: `proj_${i + 1}` }));
}

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  listMock.mockReset();
  runMock.mockReset();
  sweepMock.mockReset();
  listMock.mockResolvedValue([]);
  sweepMock.mockResolvedValue(0);
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalSecret;
  }
  vi.restoreAllMocks();
});

describe("GET /api/cron/daily", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(listMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong bearer token", async () => {
    const res = await GET(request("Bearer not-the-secret"));
    expect(res.status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret is sent without the Bearer prefix", async () => {
    const res = await GET(request(SECRET));
    expect(res.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET is unset, even with a header", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "CRON_SECRET not set" });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("runs every listed project in order and counts started and finished", async () => {
    listMock.mockResolvedValue(projects(2));
    runMock.mockImplementation(async (_licenseId, projectId) => fakeRun(projectId));

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ started: 2, finished: 2, skipped: 0, swept: 0, errors: [] });
    expect(runMock.mock.calls).toEqual([cronCall("lic_1", "proj_1"), cronCall("lic_2", "proj_2")]);
  });

  it("closes stale runs before starting new ones and reports the count", async () => {
    sweepMock.mockResolvedValue(2);
    listMock.mockResolvedValue(projects(1));
    runMock.mockImplementation(async (_licenseId, projectId) => fakeRun(projectId));

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(await res.json()).toEqual({ started: 1, finished: 1, skipped: 0, swept: 2, errors: [] });
    expect(sweepMock).toHaveBeenCalledTimes(1);
    expect(sweepMock.mock.invocationCallOrder[0]).toBeLessThan(runMock.mock.invocationCallOrder[0]);
  });

  it("reports a failed sweep and still runs the projects", async () => {
    sweepMock.mockRejectedValue(new Error("db down"));
    listMock.mockResolvedValue(projects(1));
    runMock.mockImplementation(async (_licenseId, projectId) => fakeRun(projectId));

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ started: 1, finished: 1, skipped: 0, swept: 0, errors: ["sweep: db down"] });
  });

  it("hands every run the end of the cron budget as its deadline, so no run outlives the function", async () => {
    listMock.mockResolvedValue(projects(2));
    let clock = 5_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    runMock.mockImplementation(async (_licenseId, projectId) => {
      clock += 100_000;
      return fakeRun(projectId);
    });

    await GET(request(`Bearer ${SECRET}`));

    expect(runMock.mock.calls.map((call) => call[3]?.deadline)).toEqual([5_000_000 + BUDGET_MS, 5_000_000 + BUDGET_MS]);
  });

  it("returns an empty report when nothing is due", async () => {
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ started: 0, finished: 0, skipped: 0, swept: 0, errors: [] });
  });

  it("keeps going when executeRun throws and reports the error", async () => {
    listMock.mockResolvedValue(projects(2));
    runMock.mockImplementation(async (_licenseId, projectId) => {
      if (projectId === "proj_1") throw new Error("engine exploded");
      return fakeRun(projectId);
    });

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      started: 2,
      finished: 1,
      skipped: 0,
      swept: 0,
      errors: ["proj_1: engine exploded"],
    });
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it("counts a run that resolved with status failed as finished and lists it", async () => {
    listMock.mockResolvedValue(projects(1));
    runMock.mockResolvedValue(fakeRun("proj_1", "failed"));

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(await res.json()).toEqual({
      started: 1,
      finished: 1,
      skipped: 0,
      swept: 0,
      errors: ["proj_1: run run_proj_1 failed"],
    });
  });

  it("returns 500 when listing the projects fails", async () => {
    listMock.mockRejectedValue(new Error("db down"));
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "listProjectsForDailyRun failed: db down" });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("stops starting runs once the 240 s budget is spent and counts the rest as skipped", async () => {
    listMock.mockResolvedValue(projects(4));

    // Mocked wall clock: each run takes 100 s, so the third run ends past the budget.
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    runMock.mockImplementation(async (_licenseId, projectId) => {
      clock += 100_000;
      return fakeRun(projectId);
    });

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ started: 3, finished: 3, skipped: 1, swept: 0, errors: [] });
    expect(runMock).toHaveBeenCalledTimes(3);
    expect(clock - 1_000_000).toBeGreaterThanOrEqual(BUDGET_MS);
  });

  it("still starts a run that begins just inside the budget", async () => {
    listMock.mockResolvedValue(projects(2));

    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    runMock.mockImplementation(async (_licenseId, projectId) => {
      clock += BUDGET_MS - 1;
      return fakeRun(projectId);
    });

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(await res.json()).toEqual({ started: 2, finished: 2, skipped: 0, swept: 0, errors: [] });
  });
});
