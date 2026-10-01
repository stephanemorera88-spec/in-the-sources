import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx, denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../../../_lib/test-support";

const db = vi.hoisted(() => ({
  archivePrompt: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);

import { DELETE } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
});

describe("DELETE /api/projects/[id]/prompts/[promptId]", () => {
  it("archives the prompt through the license-scoped data function", async () => {
    db.archivePrompt.mockResolvedValue(true);
    const res = await DELETE(jsonRequest("/api/projects/prj_1/prompts/prm_1", "DELETE"), ctx({ id: "prj_1", promptId: "prm_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ ok: true });
    expect(db.archivePrompt).toHaveBeenCalledWith(testLicense.id, "prj_1", "prm_1");
  });

  it("returns 404 when the prompt is not on this license or project", async () => {
    db.archivePrompt.mockResolvedValue(false);
    const res = await DELETE(jsonRequest("/api/projects/prj_1/prompts/prm_x", "DELETE"), ctx({ id: "prj_1", promptId: "prm_x" }));
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: "not found" });
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await DELETE(jsonRequest("/api/projects/prj_1/prompts/prm_1", "DELETE"), ctx({ id: "prj_1", promptId: "prm_1" }));
    expect(res.status).toBe(401);
    expect(db.archivePrompt).not.toHaveBeenCalled();
  });
});
