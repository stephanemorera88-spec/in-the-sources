import { getRun, listResults } from "@/lib/db";
import { json, jsonNotFound, withLicense } from "../../../../_lib/with-license";

type Params = { id: string; runId: string };

/** GET /api/projects/[id]/runs/[runId]: { run, results } with raw answers, sources and search results. */
export const GET = withLicense<Params>(async ({ license, params }) => {
  const run = await getRun(license.id, params.id, params.runId);
  if (!run) return jsonNotFound();
  const results = await listResults(license.id, params.id, params.runId);
  return json({ run, results });
});
