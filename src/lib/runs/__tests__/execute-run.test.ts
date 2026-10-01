import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineKeys, Project, Prompt, ResultInput, Run } from "../../contracts";

vi.mock("../../db", () => ({
  getProject: vi.fn(),
  listPrompts: vi.fn(),
  getEngineKeys: vi.fn(),
  createRun: vi.fn(),
  insertResult: vi.fn(),
  finishRun: vi.fn(),
  getRun: vi.fn(),
}));
vi.mock("../../engines", () => ({
  runProjectPrompts: vi.fn(),
}));

import * as db from "../../db";
import { runProjectPrompts } from "../../engines";
import { RUN_BUDGET_MS } from "../../engines/models";
import { executeRun } from "../index";

const project: Project = {
  id: "p1",
  licenseId: "l1",
  brandName: "In the Sources",
  domain: "evoix.io",
  aliases: [],
  competitorDomains: [],
  dailyRun: true,
  createdAt: "2026-10-01T00:00:00.000Z",
};
const active: Prompt = { id: "q1", projectId: "p1", text: "best AEO tracker", createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null };
const archived: Prompt = { ...active, id: "q2", archivedAt: "2026-10-01T01:00:00.000Z" };
const run: Run = { id: "r1", projectId: "p1", trigger: "manual", status: "running", startedAt: "2026-10-01T02:00:00.000Z", finishedAt: null };
const keys: EngineKeys = { openai: "sk-o" };

const mocked = {
  getProject: vi.mocked(db.getProject),
  listPrompts: vi.mocked(db.listPrompts),
  getEngineKeys: vi.mocked(db.getEngineKeys),
  createRun: vi.mocked(db.createRun),
  insertResult: vi.mocked(db.insertResult),
  finishRun: vi.mocked(db.finishRun),
  getRun: vi.mocked(db.getRun),
  runProjectPrompts: vi.mocked(runProjectPrompts),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getProject.mockResolvedValue(project);
  mocked.listPrompts.mockResolvedValue([active, archived]);
  mocked.getEngineKeys.mockResolvedValue(keys);
  mocked.createRun.mockResolvedValue(run);
  mocked.insertResult.mockResolvedValue();
  mocked.finishRun.mockResolvedValue();
  mocked.getRun.mockImplementation(async (_l, _p, runId) => ({ ...run, id: runId, status: "complete", finishedAt: "2026-10-01T02:05:00.000Z" }));
  mocked.runProjectPrompts.mockResolvedValue({ total: 3, errored: 0 });
});

describe("executeRun", () => {
  it("throws before creating a run when the project is unknown to this license", async () => {
    mocked.getProject.mockResolvedValue(null);
    await expect(executeRun("l1", "p1", "manual")).rejects.toThrow("project not found");
    expect(mocked.createRun).not.toHaveBeenCalled();
  });

  it("throws before creating a run when there is no engine key or no active prompt", async () => {
    mocked.getEngineKeys.mockResolvedValue({ openai: "  " });
    await expect(executeRun("l1", "p1", "manual")).rejects.toThrow(/API key/);
    mocked.getEngineKeys.mockResolvedValue(keys);
    mocked.listPrompts.mockResolvedValue([archived]);
    await expect(executeRun("l1", "p1", "cron")).rejects.toThrow(/prompt/);
    expect(mocked.createRun).not.toHaveBeenCalled();
  });

  it("creates the run, feeds only active prompts to the engines, inserts each result, and finishes complete", async () => {
    const sample: ResultInput = {
      promptId: "q1",
      engine: "openai",
      model: "gpt-5-mini",
      mentioned: true,
      position: null,
      cited: true,
      sources: [],
      searchResults: [],
      competitorDomainsCited: [],
      rawText: "answer",
      error: null,
      latencyMs: 10,
    };
    mocked.runProjectPrompts.mockImplementation(async (params) => {
      await params.onResult(sample);
      return { total: 1, errored: 0 };
    });

    const result = await executeRun("l1", "p1", "manual");

    expect(mocked.createRun).toHaveBeenCalledWith("l1", "p1", "manual");
    const params = mocked.runProjectPrompts.mock.calls[0]?.[0];
    expect(params?.keys).toBe(keys);
    expect(params?.project).toBe(project);
    expect(params?.prompts).toEqual([active]);
    expect(mocked.insertResult).toHaveBeenCalledWith("r1", sample);
    expect(mocked.finishRun).toHaveBeenCalledWith("r1", "complete");
    expect(mocked.getRun).toHaveBeenCalledWith("l1", "p1", "r1");
    expect(result.status).toBe("complete");
    expect(result.id).toBe("r1");
  });

  it("gives every run a deadline: the caller's, or RUN_BUDGET_MS from now", async () => {
    const before = Date.now();
    await executeRun("l1", "p1", "manual");
    const own = mocked.runProjectPrompts.mock.calls[0]?.[0]?.deadline;
    expect(own).toBeGreaterThanOrEqual(before + RUN_BUDGET_MS);
    expect(own).toBeLessThanOrEqual(Date.now() + RUN_BUDGET_MS);

    await executeRun("l1", "p1", "cron", { deadline: 1_234_567 });
    expect(mocked.runProjectPrompts.mock.calls[1]?.[0]?.deadline).toBe(1_234_567);
  });

  it("marks partial when some calls failed and failed when all did", async () => {
    mocked.runProjectPrompts.mockResolvedValue({ total: 3, errored: 1 });
    await executeRun("l1", "p1", "manual");
    expect(mocked.finishRun).toHaveBeenLastCalledWith("r1", "partial");

    mocked.runProjectPrompts.mockResolvedValue({ total: 3, errored: 3 });
    await executeRun("l1", "p1", "manual");
    expect(mocked.finishRun).toHaveBeenLastCalledWith("r1", "failed");
  });

  it("never throws once the run row exists", async () => {
    mocked.runProjectPrompts.mockRejectedValue(new Error("orchestration exploded"));
    mocked.finishRun.mockRejectedValue(new Error("db down"));
    mocked.getRun.mockRejectedValue(new Error("db down"));

    const result = await executeRun("l1", "p1", "cron");

    expect(mocked.finishRun).toHaveBeenCalledWith("r1", "failed");
    expect(result.id).toBe("r1");
    expect(result.status).toBe("failed");
    expect(result.finishedAt).not.toBeNull();
  });

  it("falls back to the local copy when the run cannot be re-read", async () => {
    mocked.getRun.mockResolvedValue(null);
    const result = await executeRun("l1", "p1", "manual");
    expect(result).toMatchObject({ id: "r1", status: "complete", trigger: "manual" });
    expect(result.finishedAt).not.toBeNull();
  });
});
