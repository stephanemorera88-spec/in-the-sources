import { archivePrompt } from "@/lib/db";
import { json, jsonNotFound, withLicense } from "../../../../_lib/with-license";

type Params = { id: string; promptId: string };

/** DELETE /api/projects/[id]/prompts/[promptId]: archives the prompt (past results keep it). */
export const DELETE = withLicense<Params>(async ({ license, params }) => {
  const archived = await archivePrompt(license.id, params.id, params.promptId);
  if (!archived) return jsonNotFound();
  return json({ ok: true });
});
