import { deleteProject, getProject, updateProject } from "@/lib/db";
import { projectPatchSchema } from "../../_lib/schemas";
import { json, jsonNotFound, readJson, withLicense } from "../../_lib/with-license";

type Params = { id: string };

/** GET /api/projects/[id] */
export const GET = withLicense<Params>(async ({ license, params }) => {
  const project = await getProject(license.id, params.id);
  if (!project) return jsonNotFound();
  return json({ project });
});

/** PATCH /api/projects/[id]: any subset of the create body; omitted fields stay as they are. */
export const PATCH = withLicense<Params>(async ({ license, request, params }) => {
  const input = projectPatchSchema.parse(await readJson(request));
  const project = await updateProject(license.id, params.id, input);
  if (!project) return jsonNotFound();
  return json({ project });
});

/** DELETE /api/projects/[id]: removes the project and, through the schema's cascades, its prompts, runs and results. */
export const DELETE = withLicense<Params>(async ({ license, params }) => {
  const deleted = await deleteProject(license.id, params.id);
  if (!deleted) return jsonNotFound();
  return json({ ok: true });
});
