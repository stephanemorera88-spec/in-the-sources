import { getDashboard } from "@/lib/db";
import { json, jsonNotFound, withLicense } from "../../../_lib/with-license";

type Params = { id: string };

/** GET /api/projects/[id]/dashboard: the Dashboard object (project, latestRun, trend, promptTable, competitorLeaderboard). */
export const GET = withLicense<Params>(async ({ license, params }) => {
  const dashboard = await getDashboard(license.id, params.id);
  if (!dashboard) return jsonNotFound();
  return json(dashboard);
});
