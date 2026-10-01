import "../server-only";
import {
  ENGINES,
  type AnswerAnalysis,
  type EngineAnswer,
  type EngineId,
  type EngineKeys,
  type Project,
  type Prompt,
  type ResultInput,
} from "../contracts";
import { analyzeAnswer } from "./analyze";
import { askAnthropic } from "./anthropic";
import { describeError, failedAnswer, type EngineOpts } from "./common";
import { askGemini } from "./gemini";
import { createLimiter } from "./limiter";
import { MIN_CALL_BUDGET_MS, QUERY_TIMEOUT_MS, RUN_CONCURRENCY } from "./models";
import { askOpenAI } from "./openai";

export {
  ANTHROPIC_MODEL,
  GEMINI_MODEL,
  MIN_CALL_BUDGET_MS,
  OPENAI_MODEL,
  QUERY_TIMEOUT_MS,
  RUN_BUDGET_MS,
  RUN_CONCURRENCY,
  SYSTEM_PROMPT,
} from "./models";
export { analyzeAnswer } from "./analyze";
export { fetchSiteText } from "./site-text";
export { suggestPrompts } from "./suggest";
export { domainMatches, normalizeDomain } from "./domains";
export { createLimiter } from "./limiter";
export type { EngineOpts } from "./common";

/*
 * Engines (builder A). askEngine dispatches to one provider with the user's
 * own key; runProjectPrompts fans every active prompt out to every engine
 * that has a key, under a concurrency cap, and hands each ResultInput to the
 * caller. Neither ever throws for a failed call: the failure is the result.
 */

/** One prompt on one engine. Always resolves; a failure is an EngineAnswer with `error` set and empty text. */
export async function askEngine(engine: EngineId, apiKey: string, prompt: string, opts?: EngineOpts): Promise<EngineAnswer> {
  const started = Date.now();
  try {
    if (engine === "openai") return await askOpenAI(apiKey, prompt, opts);
    if (engine === "anthropic") return await askAnthropic(apiKey, prompt, opts);
    if (engine === "gemini") return await askGemini(apiKey, prompt, opts);
    return failedAnswer(engine, "", 0, `Unknown engine: ${String(engine)}`);
  } catch (err) {
    return failedAnswer(engine, "", Date.now() - started, describeError(err, apiKey));
  }
}

const EMPTY_ANALYSIS: AnswerAnalysis = { mentioned: false, position: null, cited: false, competitorDomainsCited: [] };

export type AskFn = (engine: EngineId, apiKey: string, prompt: string, opts?: EngineOpts) => Promise<EngineAnswer>;

/** Error text of a result row written when the run's deadline left no room for the call. */
export const RUN_BUDGET_EXHAUSTED = "Run budget exhausted before this call started.";

export async function runProjectPrompts(params: {
  keys: EngineKeys;
  project: Project;
  prompts: Prompt[];
  onResult: (r: ResultInput) => Promise<void>;
  concurrency?: number;
  /**
   * Absolute time (Date.now() ms) by which the run must be over. A call that
   * cannot start with at least MIN_CALL_BUDGET_MS left is written as an
   * errored row (RUN_BUDGET_EXHAUSTED) without touching the engine; a call
   * that does start gets a timeout capped at what remains. Unset means the
   * plain per-call timeout.
   */
  deadline?: number;
  /** Test seam: replaces askEngine. */
  ask?: AskFn;
}): Promise<{ total: number; errored: number }> {
  const ask = params.ask ?? askEngine;
  const engines = ENGINES.filter((engine) => (params.keys[engine] ?? "").trim().length > 0);
  const prompts = params.prompts.filter((prompt) => !prompt.archivedAt);
  const tasks: Array<{ prompt: Prompt; engine: EngineId }> = [];
  for (const prompt of prompts) {
    for (const engine of engines) tasks.push({ prompt, engine });
  }

  const limit = createLimiter(params.concurrency ?? RUN_CONCURRENCY);
  let errored = 0;

  await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        const apiKey = (params.keys[task.engine] ?? "").trim();
        const remaining = params.deadline === undefined ? QUERY_TIMEOUT_MS : params.deadline - Date.now();
        const skipped = remaining < MIN_CALL_BUDGET_MS;
        let answer: EngineAnswer;
        let analysis: AnswerAnalysis = EMPTY_ANALYSIS;
        if (skipped) {
          answer = failedAnswer(task.engine, "", 0, RUN_BUDGET_EXHAUSTED);
        } else {
          try {
            answer = await ask(task.engine, apiKey, task.prompt.text, { timeoutMs: Math.min(QUERY_TIMEOUT_MS, remaining) });
            analysis = answer.error ? EMPTY_ANALYSIS : analyzeAnswer(answer, params.project);
          } catch (err) {
            answer = failedAnswer(task.engine, "", 0, describeError(err, apiKey));
          }
        }
        const result: ResultInput = {
          promptId: task.prompt.id,
          engine: task.engine,
          model: answer.model || null,
          mentioned: analysis.mentioned,
          position: analysis.position,
          cited: analysis.cited,
          sources: answer.sources,
          searchResults: answer.searchResults,
          competitorDomainsCited: analysis.competitorDomainsCited,
          rawText: answer.text,
          error: answer.error,
          latencyMs: !skipped && Number.isFinite(answer.latencyMs) ? Math.round(answer.latencyMs) : null,
        };
        let failed = answer.error !== null;
        try {
          await params.onResult(result);
        } catch {
          failed = true;
        }
        if (failed) errored += 1;
      })
    )
  );

  return { total: tasks.length, errored };
}
