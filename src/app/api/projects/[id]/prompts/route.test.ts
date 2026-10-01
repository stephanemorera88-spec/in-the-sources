import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Prompt } from "@/lib/contracts";
import { ctx, denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../../_lib/test-support";

const db = vi.hoisted(() => ({
  getProject: vi.fn(),
  listPrompts: vi.fn(),
  addPrompts: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);

import { GET, POST } from "./route";

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

const prompt: Prompt = {
  id: "prm_1",
  projectId: "prj_1",
  text: "best dentist in DeLand",
  createdAt: "2026-10-01T00:00:00.000Z",
  archivedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
});

describe("GET /api/projects/[id]/prompts", () => {
  it("returns 404 for an unknown project", async () => {
    db.getProject.mockResolvedValue(null);
    const res = await GET(jsonRequest("/api/projects/prj_x/prompts", "GET"), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
    expect(db.listPrompts).not.toHaveBeenCalled();
  });

  it("lists active prompts by default and archived ones on request", async () => {
    db.getProject.mockResolvedValue(project);
    db.listPrompts.mockResolvedValue([prompt]);

    const res = await GET(jsonRequest("/api/projects/prj_1/prompts", "GET"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ prompts: [prompt] });
    expect(db.listPrompts).toHaveBeenLastCalledWith(testLicense.id, "prj_1", { includeArchived: false });

    await GET(jsonRequest("/api/projects/prj_1/prompts?includeArchived=true", "GET"), ctx({ id: "prj_1" }));
    expect(db.listPrompts).toHaveBeenLastCalledWith(testLicense.id, "prj_1", { includeArchived: true });
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await GET(jsonRequest("/api/projects/prj_1/prompts", "GET"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/projects/[id]/prompts", () => {
  beforeEach(() => {
    db.listPrompts.mockResolvedValue([]);
  });

  it("adds trimmed, deduped prompts and returns the new rows with 201", async () => {
    db.getProject.mockResolvedValue(project);
    db.addPrompts.mockResolvedValue([prompt]);
    const res = await POST(
      jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: ["  best dentist in DeLand ", "", "best dentist in DeLand"] }),
      ctx({ id: "prj_1" })
    );
    expect(res.status).toBe(201);
    expect(await readBody(res)).toEqual({ prompts: [prompt] });
    expect(db.addPrompts).toHaveBeenCalledWith(testLicense.id, "prj_1", ["best dentist in DeLand"]);
  });

  it("returns 400 when every line is blank", async () => {
    const res = await POST(jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: ["", "   "] }), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("at least one prompt");
    expect(db.addPrompts).not.toHaveBeenCalled();
  });

  it("returns 400 for more than 25 prompts or a prompt over 300 characters", async () => {
    const many = Array.from({ length: 26 }, (_, i) => `prompt ${i}`);
    expect((await POST(jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: many }), ctx({ id: "prj_1" }))).status).toBe(400);
    const long = ["x".repeat(301)];
    expect((await POST(jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: long }), ctx({ id: "prj_1" }))).status).toBe(400);
    expect((await POST(jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: "not a list" }), ctx({ id: "prj_1" }))).status).toBe(400);
    expect(db.addPrompts).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown project with a valid body", async () => {
    db.getProject.mockResolvedValue(null);
    const res = await POST(jsonRequest("/api/projects/prj_x/prompts", "POST", { texts: ["hello"] }), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
    expect(db.addPrompts).not.toHaveBeenCalled();
  });

  it("caps a project at 25 active prompts, counting only unarchived ones", async () => {
    db.getProject.mockResolvedValue(project);
    const active = Array.from({ length: 24 }, (_, i) => ({ ...prompt, id: `prm_${i}`, text: `prompt ${i}` }));
    db.listPrompts.mockResolvedValue(active);

    const over = await POST(jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: ["a", "b"] }), ctx({ id: "prj_1" }));
    expect(over.status).toBe(400);
    expect((await readBody<{ error: string }>(over)).error).toContain("room for 1 more");
    expect(db.addPrompts).not.toHaveBeenCalled();

    db.addPrompts.mockResolvedValue([{ ...prompt, id: "prm_24", text: "a" }]);
    const fits = await POST(jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: ["a"] }), ctx({ id: "prj_1" }));
    expect(fits.status).toBe(201);
    expect(db.listPrompts).toHaveBeenLastCalledWith(testLicense.id, "prj_1");

    db.listPrompts.mockResolvedValue([...active, { ...prompt, id: "prm_24", text: "a" }]);
    const full = await POST(jsonRequest("/api/projects/prj_1/prompts", "POST", { texts: ["c"] }), ctx({ id: "prj_1" }));
    expect(full.status).toBe(400);
    expect((await readBody<{ error: string }>(full)).error).toContain("already holds 25");
  });
});
