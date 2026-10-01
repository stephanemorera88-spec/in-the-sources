import "../server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { z } from "zod";
import { ENGINES, type EngineId, type EngineKeys, type ProjectInput } from "../contracts";
import { describeError } from "./common";
import { ANTHROPIC_MODEL, GEMINI_MODEL, OPENAI_MODEL } from "./models";

/**
 * Prompt suggestions (SPEC.md, suggestPrompts): ten questions a real buyer
 * would type into an AI assistant before choosing a provider in the brand's
 * category, eight without the brand name and two with it. Uses the first
 * engine the user has a key for, in the order openai, anthropic, gemini. No
 * web search here; the site text is the grounding.
 */
export const SUGGEST_COUNT = 10;
export const SUGGEST_TIMEOUT_MS = 60_000;
const SITE_TEXT_LIMIT = 8000;

export const SUGGEST_SYSTEM_PROMPT =
  "You write the questions real buyers type into AI assistants such as ChatGPT, Claude and Gemini. You reply with a JSON array of strings and nothing else.";

/** A plain completion: system prompt plus one user message, text back. Injectable for tests. */
export type CompleteFn = (engine: EngineId, apiKey: string, system: string, user: string) => Promise<string>;

export function buildSuggestPrompt(project: ProjectInput, siteText: string): string {
  const aliases = project.aliases.filter(Boolean);
  const competitors = project.competitorDomains.filter(Boolean);
  const site = siteText.trim().slice(0, SITE_TEXT_LIMIT);
  const lines = [
    `Brand: ${project.brandName}`,
    `Website: ${project.domain}`,
    aliases.length ? `Also known as: ${aliases.join(", ")}` : "",
    competitors.length ? `Competitors: ${competitors.join(", ")}` : "",
    "",
    site ? `Text from the brand's website:\n"""\n${site}\n"""` : "No website text was available. Work from the brand name and domain.",
    "",
    `Write exactly ${SUGGEST_COUNT} questions a real buyer would type into an AI assistant before choosing a provider in this brand's category.`,
    `Exactly ${SUGGEST_COUNT - 2} of them must not contain the brand name or any alias; they ask about the category, the problem, comparisons or recommendations.`,
    `Exactly 2 of them must contain the brand name "${project.brandName}".`,
    "Each question is under 120 characters, specific, and sounds like a person typing, not a marketer.",
    `Output: a JSON array of ${SUGGEST_COUNT} strings. No prose, no numbering, no markdown fences.`,
  ];
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n");
}

export const suggestionSchema = z.array(z.string().trim().min(1)).min(1).max(12);

/** Lenient parse: first "[" to last "]", JSON, zod, then trim, dedupe and cap at SUGGEST_COUNT. Null when unusable. */
export function parseSuggestions(raw: string): string[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const result = suggestionSchema.safeParse(parsed);
  if (!result.success) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of result.data) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length === SUGGEST_COUNT) break;
  }
  return out.length ? out : null;
}

async function completeWithEngine(engine: EngineId, apiKey: string, system: string, user: string): Promise<string> {
  if (engine === "openai") {
    // node_modules/openai/client.d.ts line 62 (apiKey); responses.d.ts lines 8912 (model), 8889 (instructions), 8881 (input), 8975 (reasoning).
    const client = new OpenAI({ apiKey, maxRetries: 1 });
    const response = await client.responses.create(
      { model: OPENAI_MODEL, instructions: system, input: user, reasoning: { effort: "low" } },
      { timeout: SUGGEST_TIMEOUT_MS }
    );
    return response.output_text ?? ""; // responses.d.ts line 797
  }
  if (engine === "anthropic") {
    // node_modules/@anthropic-ai/sdk/client.d.ts line 42 (apiKey); messages.d.ts lines 3582 (model), 3506 (max_tokens), 3651 (system), 3575 (messages).
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const message = await client.messages.create(
      { model: ANTHROPIC_MODEL, max_tokens: 1500, system, messages: [{ role: "user", content: user }] },
      { timeout: SUGGEST_TIMEOUT_MS }
    );
    // TextBlock lines 2347 (text), 2348 (type).
    return message.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }
  // node_modules/@google/genai/dist/genai.d.ts lines 7457 (apiKey), 11908 (generateContent), 6116 (systemInstruction), 8438 (timeout).
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: user,
    config: { systemInstruction: system, httpOptions: { timeout: SUGGEST_TIMEOUT_MS, retryOptions: { attempts: 2 } } },
  });
  return response.text ?? ""; // GenerateContentResponse.text getter, line 6320
}

/**
 * 10 prompts, 8 unbranded + 2 branded. Throws a plain Error when no key is
 * set, when the engine call fails, or when the reply is unparsable twice.
 */
export async function suggestPrompts(
  keys: EngineKeys,
  project: ProjectInput,
  siteText: string,
  deps: { complete?: CompleteFn } = {}
): Promise<string[]> {
  const engine = ENGINES.find((id) => (keys[id] ?? "").trim().length > 0);
  if (!engine) throw new Error("Add at least one engine API key in Settings before asking for suggestions.");
  const apiKey = (keys[engine] ?? "").trim();
  const complete = deps.complete ?? completeWithEngine;
  const user = buildSuggestPrompt(project, siteText);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const input =
      attempt === 0 ? user : `${user}\n\nYour previous reply was not a JSON array of strings. Reply with the JSON array only.`;
    let raw: string;
    try {
      raw = await complete(engine, apiKey, SUGGEST_SYSTEM_PROMPT, input);
    } catch (err) {
      throw new Error(`Could not get suggestions from ${engine}. ${describeError(err, apiKey)}`);
    }
    const parsed = parseSuggestions(raw);
    if (parsed) return parsed;
  }
  throw new Error(`The ${engine} engine did not return a usable list of prompts after two attempts. Try again.`);
}
