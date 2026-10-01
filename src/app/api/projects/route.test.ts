import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/contracts";
import { denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../_lib/test-support";

const db = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);

import { GET, POST } from "./route";

const project: Project = {
  id: "prj_1",
  licenseId: testLicense.id,
  brandName: "Acme Dental",
  domain: "acmedental.com",
  aliases: [],
  competitorDomains: [],
  dailyRun: true,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const noParams = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/projects", () => {
  it("returns 401 JSON when there is no license", async () => {
    denyLicense();
    const res = await GET(jsonRequest("/api/projects", "GET"), noParams);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await readBody(res)).toEqual({ error: "unauthorized" });
    expect(db.listProjects).not.toHaveBeenCalled();
  });

  it("lists the license's projects", async () => {
    db.listProjects.mockResolvedValue([project]);
    const res = await GET(jsonRequest("/api/projects", "GET"), noParams);
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ projects: [project] });
    expect(db.listProjects).toHaveBeenCalledWith(testLicense.id);
  });

  it("maps the data layer's NotFoundError to 404 and InvalidInputError to 400", async () => {
    db.listProjects.mockRejectedValue(Object.assign(new Error("project not found"), { name: "NotFoundError" }));
    let res = await GET(jsonRequest("/api/projects", "GET"), noParams);
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: "not found" });

    db.createProject.mockRejectedValue(Object.assign(new Error('"x" is not a domain name like example.com'), { name: "InvalidInputError" }));
    res = await POST(jsonRequest("/api/projects", "POST", { brandName: "Acme", domain: "acme.com" }), noParams);
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("not a domain name");
  });

  it("maps an unexpected error to a 500 JSON body without the internal message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    db.listProjects.mockRejectedValue(new Error("connection refused at 10.0.0.1"));
    const res = await GET(jsonRequest("/api/projects", "GET"), noParams);
    expect(res.status).toBe(500);
    const body = await readBody<{ error: string }>(res);
    expect(body.error).not.toContain("10.0.0.1");
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("POST /api/projects", () => {
  it("creates a project with a normalized domain and default lists", async () => {
    db.createProject.mockResolvedValue(project);
    const res = await POST(
      jsonRequest("/api/projects", "POST", { brandName: "  Acme Dental ", domain: "https://www.AcmeDental.com/about?x=1" }),
      noParams
    );
    expect(res.status).toBe(201);
    expect(await readBody(res)).toEqual({ project });
    expect(db.createProject).toHaveBeenCalledWith(testLicense.id, {
      brandName: "Acme Dental",
      domain: "acmedental.com",
      aliases: [],
      competitorDomains: [],
    });
  });

  it("normalizes and dedupes competitor domains and drops empty aliases", async () => {
    db.createProject.mockResolvedValue(project);
    await POST(
      jsonRequest("/api/projects", "POST", {
        brandName: "Acme",
        domain: "acme.com",
        aliases: ["Acme Dental", "", "  ", "Acme Dental"],
        competitorDomains: ["https://www.Rival.com/", "rival.com", "other.io"],
        dailyRun: false,
      }),
      noParams
    );
    expect(db.createProject).toHaveBeenCalledWith(testLicense.id, {
      brandName: "Acme",
      domain: "acme.com",
      aliases: ["Acme Dental"],
      competitorDomains: ["rival.com", "other.io"],
      dailyRun: false,
    });
  });

  it("returns 400 with a plain message when the brand name is missing", async () => {
    const res = await POST(jsonRequest("/api/projects", "POST", { domain: "acme.com" }), noParams);
    expect(res.status).toBe(400);
    const body = await readBody<{ error: string }>(res);
    expect(body.error).toContain("brandName");
    expect(db.createProject).not.toHaveBeenCalled();
  });

  it("returns 400 when the domain has no dot or is not a hostname", async () => {
    for (const domain of ["localhost", "not a domain.com", ""]) {
      const res = await POST(jsonRequest("/api/projects", "POST", { brandName: "Acme", domain }), noParams);
      expect(res.status).toBe(400);
    }
    expect(db.createProject).not.toHaveBeenCalled();
  });

  it("returns 400 when there are more than 10 aliases", async () => {
    const aliases = Array.from({ length: 11 }, (_, i) => `alias ${i}`);
    const res = await POST(jsonRequest("/api/projects", "POST", { brandName: "Acme", domain: "acme.com", aliases }), noParams);
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("10");
  });

  it("returns 400 when the body is not JSON", async () => {
    const res = await POST(jsonRequest("/api/projects", "POST", "{not json"), noParams);
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("JSON");
  });

  it("returns 401 before touching the body when there is no license", async () => {
    denyLicense();
    const res = await POST(jsonRequest("/api/projects", "POST", { brandName: "Acme", domain: "acme.com" }), noParams);
    expect(res.status).toBe(401);
    expect(db.createProject).not.toHaveBeenCalled();
  });
});
