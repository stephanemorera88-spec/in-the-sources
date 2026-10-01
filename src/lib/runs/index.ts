import "../server-only";
import type { Run } from "../contracts";

/*
 * Run orchestration (builder A). Phase 1 stub.
 * executeRun: createRun, runProjectPrompts with insertResult, finishRun.
 * Never throws after the run row exists (marks failed or partial instead).
 */

export async function executeRun(licenseId: string, projectId: string, trigger: "manual" | "cron"): Promise<Run> {
  void licenseId;
  void projectId;
  void trigger;
  throw new Error("not implemented: executeRun");
}
