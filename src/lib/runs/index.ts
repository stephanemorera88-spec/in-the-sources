import "../server-only";
import { ENGINES, type Run, type RunStatus } from "../contracts";
import { createRun, finishRun, getEngineKeys, getProject, getRun, insertResult, listPrompts } from "../db";
import { runProjectPrompts } from "../engines";
import { RUN_BUDGET_MS } from "../engines/models";

/*
 * Run orchestration (module A). Everything that can refuse a run happens
 * before the run row exists (unknown project, no keys, no prompts). Once
 * createRun has returned, nothing throws: the run ends "complete",
 * "partial" or "failed" and the final row is returned.
 *
 * Every run has a deadline (review fix, 2026-10-01): the caller's, or
 * RUN_BUDGET_MS from now. Calls that cannot start before it become errored
 * rows, so the run closes inside the route's maxDuration instead of being
 * killed with its row left at "running".
 */

export async function executeRun(
  licenseId: string,
  projectId: string,
  trigger: "manual" | "cron",
  opts: { deadline?: number } = {}
): Promise<Run> {
  const project = await getProject(licenseId, projectId);
  if (!project) throw new Error("project not found");

  const prompts = (await listPrompts(licenseId, projectId)).filter((prompt) => !prompt.archivedAt);
  const keys = await getEngineKeys(licenseId);
  const hasKey = ENGINES.some((engine) => (keys[engine] ?? "").trim().length > 0);
  if (!hasKey) throw new Error("Add at least one engine API key in Settings before running this project.");
  if (prompts.length === 0) throw new Error("Add at least one prompt before running this project.");

  const run = await createRun(licenseId, projectId, trigger);
  const deadline = opts.deadline ?? Date.now() + RUN_BUDGET_MS;

  let status: RunStatus = "failed";
  try {
    const { total, errored } = await runProjectPrompts({
      keys,
      project,
      prompts,
      deadline,
      onResult: (result) => insertResult(run.id, result),
    });
    status = errored === 0 ? "complete" : errored < total ? "partial" : "failed";
  } catch {
    status = "failed";
  }

  try {
    await finishRun(run.id, status);
  } catch {
    /* the row keeps its "running" status; the returned run still carries the outcome */
  }

  try {
    const fresh = await getRun(licenseId, projectId, run.id);
    if (fresh) return fresh;
  } catch {
    /* fall through to the local copy */
  }
  return { ...run, status, finishedAt: new Date().toISOString() };
}
