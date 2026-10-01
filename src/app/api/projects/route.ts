import { createProject, listProjects } from "@/lib/db";
import { projectCreateSchema } from "../_lib/schemas";
import { json, readJson, withLicense } from "../_lib/with-license";

/** GET /api/projects: the license's projects, newest first as the data layer orders them. */
export const GET = withLicense(async ({ license }) => {
  const projects = await listProjects(license.id);
  return json({ projects });
});

/** POST /api/projects: body { brandName, domain, aliases?, competitorDomains?, dailyRun? }. */
export const POST = withLicense(async ({ license, request }) => {
  const input = projectCreateSchema.parse(await readJson(request));
  const project = await createProject(license.id, input);
  return json({ project }, 201);
});
