import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultRow, Run } from "@/lib/contracts";
import { ctx, denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../../../_lib/test-support";

const db = vi.hoisted(() => ({
  getRun: vi.fn(),
  listResults: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);

import { GET } from "./route";

const run: Run = {
  id: "run_1",
  projectId: "prj_1",
  trigger: "cron",
  status: "partial",
  startedAt: "2026-10-01T11:00:00.000Z",
  finishedAt: "2026-10-01T11:02:00.000Z",
};

const result: ResultRow = {
  id: "res_1",
  runId: "run_1",
  createdAt: "2026-10-01T11:01:00.000Z",
  promptId: "prm_1",
  engine: "openai",
  model: "gpt-5-mini",
  mentioned: true,
  position: 2,
  cited: true,
  sources: [{ url: "https://acme.com/p", domain: "acme.com", title: "Acme" }],
  searchResults: [],
  competitorDomainsCited: [],
  rawText: "1. Other\n2. Acme",
  error: null,
  latencyMs: 1234,
};

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
});

describe("GET /api/projects/[id]/runs/[runId]", () => {
  it("returns the run and its results", async () => {
    db.getRun.mockResolvedValue(run);
    db.listResults.mockResolvedValue([result]);
    const res = await GET(jsonRequest("/api/projects/prj_1/runs/run_1", "GET"), ctx({ id: "prj_1", runId: "run_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ run, results: [result] });
    expect(db.getRun).toHaveBeenCalledWith(testLicense.id, "prj_1", "run_1");
    expect(db.listResults).toHaveBeenCalledWith(testLicense.id, "prj_1", "run_1");
  });

  it("returns 404 when the run is not on this license or project", async () => {
    db.getRun.mockResolvedValue(null);
    const res = await GET(jsonRequest("/api/projects/prj_1/runs/run_x", "GET"), ctx({ id: "prj_1", runId: "run_x" }));
    expect(res.status).toBe(404);
    expect(db.listResults).not.toHaveBeenCalled();
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await GET(jsonRequest("/api/projects/prj_1/runs/run_1", "GET"), ctx({ id: "prj_1", runId: "run_1" }));
    expect(res.status).toBe(401);
  });
});
