import { ENGINES } from "@/lib/contracts";
import { getEngineKeyHints, getProject, listPrompts, listRuns } from "@/lib/db";
import { executeRun } from "@/lib/runs";
import { errorMessage, json, jsonError, jsonNotFound, scrubSecrets, withLicense } from "../../../_lib/with-license";

/* A manual run waits for every prompt on every engine (90 s per call, 8 in flight). */
export const maxDuration = 300;

type Params = { id: string };

/** GET /api/projects/[id]/runs (?limit=N, at most 100). */
export const GET = withLicense<Params>(async ({ license, request, params }) => {
  const project = await getProject(license.id, params.id);
  if (!project) return jsonNotFound();
  const raw = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : undefined;
  const runs = await listRuns(license.id, params.id, limit);
  return json({ runs });
});

/** POST /api/projects/[id]/runs: runs every active prompt on every engine with a key and returns the finished run. */
export const POST = withLicense<Params>(async ({ license, params }) => {
  const project = await getProject(license.id, params.id);
  if (!project) return jsonNotFound();

  const [prompts, hints] = await Promise.all([listPrompts(license.id, params.id), getEngineKeyHints(license.id)]);
  if (prompts.length === 0) return jsonError("Add at least one prompt before running.", 400);
  if (!ENGINES.some((engine) => hints[engine]?.set)) {
    return jsonError("Add at least one engine API key in Settings before running.", 400);
  }

  try {
    const run = await executeRun(license.id, params.id, "manual");
    return json({ run });
  } catch (err) {
    return jsonError(scrubSecrets(errorMessage(err)), 400);
  }
});
