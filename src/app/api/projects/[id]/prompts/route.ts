import { addPrompts, getProject, listPrompts } from "@/lib/db";
import { PRODUCT } from "@/lib/product";
import { promptsCreateSchema } from "../../../_lib/schemas";
import { json, jsonError, jsonNotFound, readJson, withLicense } from "../../../_lib/with-license";

type Params = { id: string };

/** GET /api/projects/[id]/prompts (?includeArchived=true to include archived prompts). */
export const GET = withLicense<Params>(async ({ license, request, params }) => {
  const project = await getProject(license.id, params.id);
  if (!project) return jsonNotFound();
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const prompts = await listPrompts(license.id, params.id, { includeArchived });
  return json({ prompts });
});

/**
 * POST /api/projects/[id]/prompts: body { texts: string[] } (1 to 25 per
 * request, each 1 to 300 chars). A project holds at most
 * PRODUCT.maxPromptsPerProject active prompts, the number the landing page
 * promises; archived prompts do not count. Returns the new rows.
 */
export const POST = withLicense<Params>(async ({ license, request, params }) => {
  const { texts } = promptsCreateSchema.parse(await readJson(request));
  const project = await getProject(license.id, params.id);
  if (!project) return jsonNotFound();
  const active = await listPrompts(license.id, params.id);
  const limit = PRODUCT.maxPromptsPerProject;
  if (active.length + texts.length > limit) {
    const room = Math.max(0, limit - active.length);
    return jsonError(
      room === 0
        ? `This project already holds ${limit} active prompts, the maximum. Archive some before adding more.`
        : `A project holds at most ${limit} active prompts and this one has room for ${room} more. Archive some or add fewer.`,
      400
    );
  }
  const prompts = await addPrompts(license.id, params.id, texts);
  return json({ prompts }, 201);
});
