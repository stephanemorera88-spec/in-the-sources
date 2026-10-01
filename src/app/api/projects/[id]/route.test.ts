import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/contracts";
import { ctx, denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../_lib/test-support";

const db = vi.hoisted(() => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);

import { DELETE, GET, PATCH } from "./route";

const project: Project = {
  id: "prj_1",
  licenseId: testLicense.id,
  brandName: "Acme Dental",
  domain: "acmedental.com",
  aliases: ["Acme"],
  competitorDomains: ["rival.com"],
  dailyRun: true,
  createdAt: "2026-10-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
});

describe("GET /api/projects/[id]", () => {
  it("returns 404 JSON when the project is not on this license", async () => {
    db.getProject.mockResolvedValue(null);
    const res = await GET(jsonRequest("/api/projects/prj_x", "GET"), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: "not found" });
    expect(db.getProject).toHaveBeenCalledWith(testLicense.id, "prj_x");
  });

  it("returns the project", async () => {
    db.getProject.mockResolvedValue(project);
    const res = await GET(jsonRequest("/api/projects/prj_1", "GET"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ project });
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await GET(jsonRequest("/api/projects/prj_1", "GET"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(401);
    expect(db.getProject).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/projects/[id]", () => {
  it("passes only the fields that were sent, so omitted lists are not wiped", async () => {
    db.updateProject.mockResolvedValue({ ...project, brandName: "Acme Smiles" });
    const res = await PATCH(jsonRequest("/api/projects/prj_1", "PATCH", { brandName: "Acme Smiles" }), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(db.updateProject).toHaveBeenCalledTimes(1);
    const [licenseId, projectId, input] = db.updateProject.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(licenseId).toBe(testLicense.id);
    expect(projectId).toBe("prj_1");
    expect(input).toEqual({ brandName: "Acme Smiles" });
    expect("aliases" in input).toBe(false);
    expect("competitorDomains" in input).toBe(false);
  });

  it("normalizes a new domain and competitor list", async () => {
    db.updateProject.mockResolvedValue(project);
    await PATCH(
      jsonRequest("/api/projects/prj_1", "PATCH", { domain: "WWW.Acme.com", competitorDomains: ["http://Rival.com/x"], dailyRun: false }),
      ctx({ id: "prj_1" })
    );
    expect(db.updateProject).toHaveBeenCalledWith(testLicense.id, "prj_1", {
      domain: "acme.com",
      competitorDomains: ["rival.com"],
      dailyRun: false,
    });
  });

  it("rejects an empty body with 400", async () => {
    const res = await PATCH(jsonRequest("/api/projects/prj_1", "PATCH", {}), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("Nothing to update");
    expect(db.updateProject).not.toHaveBeenCalled();
  });

  it("rejects a bad field with 400", async () => {
    const res = await PATCH(jsonRequest("/api/projects/prj_1", "PATCH", { brandName: "" }), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    expect(db.updateProject).not.toHaveBeenCalled();
  });

  it("returns 404 when the data layer finds no project", async () => {
    db.updateProject.mockResolvedValue(null);
    const res = await PATCH(jsonRequest("/api/projects/prj_x", "PATCH", { brandName: "New" }), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/projects/[id]", () => {
  it("returns 404 when nothing was deleted", async () => {
    db.deleteProject.mockResolvedValue(false);
    const res = await DELETE(jsonRequest("/api/projects/prj_x", "DELETE"), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
  });

  it("returns ok when the project was deleted", async () => {
    db.deleteProject.mockResolvedValue(true);
    const res = await DELETE(jsonRequest("/api/projects/prj_1", "DELETE"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ ok: true });
    expect(db.deleteProject).toHaveBeenCalledWith(testLicense.id, "prj_1");
  });
});
