import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineKeyHint, Project, Prompt, Run } from "@/lib/contracts";
import { ctx, denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../../_lib/test-support";

const db = vi.hoisted(() => ({
  getProject: vi.fn(),
  listPrompts: vi.fn(),
  getEngineKeyHints: vi.fn(),
  listRuns: vi.fn(),
}));

const runs = vi.hoisted(() => ({
  executeRun: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);
vi.mock("@/lib/runs", () => runs);

import { QUERY_TIMEOUT_MS, RUN_BUDGET_MS } from "@/lib/engines/models";
import { GET, POST, maxDuration } from "./route";

const project: Project = {
  id: "prj_1",
  licenseId: testLicense.id,
  brandName: "Acme",
  domain: "acme.com",
  aliases: [],
  competitorDomains: [],
  dailyRun: true,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const prompt: Prompt = { id: "prm_1", projectId: "prj_1", text: "q", createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null };

const run: Run = {
  id: "run_1",
  projectId: "prj_1",
  trigger: "manual",
  status: "complete",
  startedAt: "2026-10-01T10:00:00.000Z",
  finishedAt: "2026-10-01T10:01:00.000Z",
};

const unset: EngineKeyHint = { set: false, hint: null, updatedAt: null };
const set: EngineKeyHint = { set: true, hint: "abcd", updatedAt: "2026-10-01T00:00:00.000Z" };

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
  db.getProject.mockResolvedValue(project);
  db.listPrompts.mockResolvedValue([prompt]);
  db.getEngineKeyHints.mockResolvedValue({ openai: set, anthropic: unset, gemini: unset });
});

describe("POST /api/projects/[id]/runs", () => {
  it("declares a 300 second budget with room for the run deadline and the closing writes", () => {
    expect(maxDuration).toBe(300);
    // executeRun ends every call by RUN_BUDGET_MS; the margin covers finishRun and the response.
    expect(RUN_BUDGET_MS + 30_000).toBeLessThanOrEqual(maxDuration * 1000);
    expect(QUERY_TIMEOUT_MS).toBeLessThan(RUN_BUDGET_MS);
  });

  it("starts a manual run for the license and project and returns the finished run", async () => {
    runs.executeRun.mockResolvedValue(run);
    const res = await POST(jsonRequest("/api/projects/prj_1/runs", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ run });
    expect(runs.executeRun).toHaveBeenCalledWith(testLicense.id, "prj_1", "manual");
  });

  it("returns 404 for an unknown project without starting a run", async () => {
    db.getProject.mockResolvedValue(null);
    const res = await POST(jsonRequest("/api/projects/prj_x/runs", "POST"), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
    expect(runs.executeRun).not.toHaveBeenCalled();
  });

  it("returns 400 with a plain message when the project has no prompts", async () => {
    db.listPrompts.mockResolvedValue([]);
    const res = await POST(jsonRequest("/api/projects/prj_1/runs", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("prompt");
    expect(runs.executeRun).not.toHaveBeenCalled();
  });

  it("returns 400 with a plain message when no engine key is set", async () => {
    db.getEngineKeyHints.mockResolvedValue({ openai: unset, anthropic: unset, gemini: unset });
    const res = await POST(jsonRequest("/api/projects/prj_1/runs", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("Settings");
    expect(runs.executeRun).not.toHaveBeenCalled();
  });

  it("returns 400 with the error message, with anything key-shaped masked", async () => {
    runs.executeRun.mockRejectedValue(new Error("engine refused key sk-proj-abcdefghijklmnopqrstuvwxyz"));
    const res = await POST(jsonRequest("/api/projects/prj_1/runs", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    const body = await readBody<{ error: string }>(res);
    expect(body.error).toContain("engine refused key");
    expect(body.error).not.toContain("abcdefghijklmnop");
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await POST(jsonRequest("/api/projects/prj_1/runs", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(401);
    expect(runs.executeRun).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/[id]/runs", () => {
  it("lists runs, passing a capped limit from the query string", async () => {
    db.listRuns.mockResolvedValue([run]);

    let res = await GET(jsonRequest("/api/projects/prj_1/runs", "GET"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ runs: [run] });
    expect(db.listRuns).toHaveBeenLastCalledWith(testLicense.id, "prj_1", undefined);

    res = await GET(jsonRequest("/api/projects/prj_1/runs?limit=5", "GET"), ctx({ id: "prj_1" }));
    expect(db.listRuns).toHaveBeenLastCalledWith(testLicense.id, "prj_1", 5);

    res = await GET(jsonRequest("/api/projects/prj_1/runs?limit=5000", "GET"), ctx({ id: "prj_1" }));
    expect(db.listRuns).toHaveBeenLastCalledWith(testLicense.id, "prj_1", 100);
  });

  it("returns 404 for an unknown project", async () => {
    db.getProject.mockResolvedValue(null);
    const res = await GET(jsonRequest("/api/projects/prj_x/runs", "GET"), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
    expect(db.listRuns).not.toHaveBeenCalled();
  });
});
