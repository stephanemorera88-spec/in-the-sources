import "../server-only";
import type {
  AnswerAnalysis,
  EngineAnswer,
  EngineId,
  EngineKeys,
  Project,
  ProjectInput,
  Prompt,
  ResultInput,
} from "../contracts";

export {
  ANTHROPIC_MODEL,
  GEMINI_MODEL,
  OPENAI_MODEL,
  QUERY_TIMEOUT_MS,
  RUN_CONCURRENCY,
  SYSTEM_PROMPT,
} from "./models";

/*
 * Engines (builder A). Phase 1 stubs. The five audit files beside this one
 * (openai.ts, anthropic.ts, gemini.ts, runner.ts, queries.ts, types.ts) are
 * copied from the site's audit for reference; builder A replaces them and
 * keeps the mention parser logic from queries.ts.
 */

export async function askEngine(
  engine: EngineId,
  apiKey: string,
  prompt: string,
  opts?: { timeoutMs?: number }
): Promise<EngineAnswer> {
  void engine;
  void apiKey;
  void prompt;
  void opts;
  throw new Error("not implemented: askEngine");
}

export function analyzeAnswer(
  answer: EngineAnswer,
  project: Pick<Project, "brandName" | "domain" | "aliases" | "competitorDomains">
): AnswerAnalysis {
  void answer;
  void project;
  throw new Error("not implemented: analyzeAnswer");
}

/** SSRF-guarded, tries /llms.txt then /, at most 8000 chars. */
export async function fetchSiteText(domain: string): Promise<string> {
  void domain;
  throw new Error("not implemented: fetchSiteText");
}

/** 10 prompts, 8 unbranded + 2 branded. */
export async function suggestPrompts(keys: EngineKeys, project: ProjectInput, siteText: string): Promise<string[]> {
  void keys;
  void project;
  void siteText;
  throw new Error("not implemented: suggestPrompts");
}

export async function runProjectPrompts(params: {
  keys: EngineKeys;
  project: Project;
  prompts: Prompt[];
  onResult: (r: ResultInput) => Promise<void>;
  concurrency?: number;
}): Promise<{ total: number; errored: number }> {
  void params;
  throw new Error("not implemented: runProjectPrompts");
}
