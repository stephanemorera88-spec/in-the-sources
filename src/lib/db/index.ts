import "../server-only";
import type {
  Dashboard,
  EngineId,
  EngineKeyHint,
  EngineKeys,
  License,
  Project,
  ProjectInput,
  Prompt,
  ResultInput,
  ResultRow,
  Run,
  RunStatus,
} from "../contracts";

export { applySchema, closeDb, getDb, setDbForTests } from "./client";
export type { Queryable } from "./client";

/*
 * Data layer (builder B). Phase 1 stubs: every function throws so the tree
 * type-checks from minute one. Every read and write of projects, prompts,
 * runs and results is scoped by licenseId (projects join); no function ever
 * trusts a license id that came from the client.
 */

export async function createLicense(input: {
  email: string;
  plan: License["plan"];
  stripeSessionId?: string | null;
}): Promise<{ license: License; key: string }> {
  void input;
  throw new Error("not implemented: createLicense");
}

/** Active licenses only; bumps last_seen_at. */
export async function findLicenseByKey(key: string): Promise<License | null> {
  void key;
  throw new Error("not implemented: findLicenseByKey");
}

export async function licenseExistsForStripeSession(sessionId: string): Promise<boolean> {
  void sessionId;
  throw new Error("not implemented: licenseExistsForStripeSession");
}

export async function setEngineKey(licenseId: string, engine: EngineId, apiKey: string): Promise<void> {
  void licenseId;
  void engine;
  void apiKey;
  throw new Error("not implemented: setEngineKey");
}

export async function deleteEngineKey(licenseId: string, engine: EngineId): Promise<void> {
  void licenseId;
  void engine;
  throw new Error("not implemented: deleteEngineKey");
}

/** Decrypted; server only; never serialized to a response. */
export async function getEngineKeys(licenseId: string): Promise<EngineKeys> {
  void licenseId;
  throw new Error("not implemented: getEngineKeys");
}

export async function getEngineKeyHints(licenseId: string): Promise<Record<EngineId, EngineKeyHint>> {
  void licenseId;
  throw new Error("not implemented: getEngineKeyHints");
}

export async function createProject(licenseId: string, input: ProjectInput): Promise<Project> {
  void licenseId;
  void input;
  throw new Error("not implemented: createProject");
}

export async function listProjects(licenseId: string): Promise<Project[]> {
  void licenseId;
  throw new Error("not implemented: listProjects");
}

export async function getProject(licenseId: string, projectId: string): Promise<Project | null> {
  void licenseId;
  void projectId;
  throw new Error("not implemented: getProject");
}

export async function updateProject(
  licenseId: string,
  projectId: string,
  input: Partial<ProjectInput>
): Promise<Project | null> {
  void licenseId;
  void projectId;
  void input;
  throw new Error("not implemented: updateProject");
}

export async function deleteProject(licenseId: string, projectId: string): Promise<boolean> {
  void licenseId;
  void projectId;
  throw new Error("not implemented: deleteProject");
}

export async function addPrompts(licenseId: string, projectId: string, texts: string[]): Promise<Prompt[]> {
  void licenseId;
  void projectId;
  void texts;
  throw new Error("not implemented: addPrompts");
}

export async function listPrompts(
  licenseId: string,
  projectId: string,
  opts?: { includeArchived?: boolean }
): Promise<Prompt[]> {
  void licenseId;
  void projectId;
  void opts;
  throw new Error("not implemented: listPrompts");
}

export async function archivePrompt(licenseId: string, projectId: string, promptId: string): Promise<boolean> {
  void licenseId;
  void projectId;
  void promptId;
  throw new Error("not implemented: archivePrompt");
}

export async function createRun(licenseId: string, projectId: string, trigger: Run["trigger"]): Promise<Run> {
  void licenseId;
  void projectId;
  void trigger;
  throw new Error("not implemented: createRun");
}

export async function insertResult(runId: string, result: ResultInput): Promise<void> {
  void runId;
  void result;
  throw new Error("not implemented: insertResult");
}

export async function finishRun(runId: string, status: RunStatus): Promise<void> {
  void runId;
  void status;
  throw new Error("not implemented: finishRun");
}

export async function listRuns(licenseId: string, projectId: string, limit?: number): Promise<Run[]> {
  void licenseId;
  void projectId;
  void limit;
  throw new Error("not implemented: listRuns");
}

export async function getRun(licenseId: string, projectId: string, runId: string): Promise<Run | null> {
  void licenseId;
  void projectId;
  void runId;
  throw new Error("not implemented: getRun");
}

export async function listResults(licenseId: string, projectId: string, runId: string): Promise<ResultRow[]> {
  void licenseId;
  void projectId;
  void runId;
  throw new Error("not implemented: listResults");
}

export async function getDashboard(licenseId: string, projectId: string): Promise<Dashboard | null> {
  void licenseId;
  void projectId;
  throw new Error("not implemented: getDashboard");
}

/** Active licenses, daily_run true, at least one engine key and one active prompt. */
export async function listProjectsForDailyRun(): Promise<Array<{ licenseId: string; projectId: string }>> {
  throw new Error("not implemented: listProjectsForDailyRun");
}
