import "../server-only";
import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import type { EngineAnswer, Source } from "../contracts";
import { dedupeSources, describeError, failedAnswer, type EngineOpts } from "./common";
import { resolveGroundingSources, type GroundingChunkInput, type ResolveOptions } from "./gemini-redirects";
import { GEMINI_MODEL, QUERY_TIMEOUT_MS, SYSTEM_PROMPT } from "./models";

/**
 * The parts of a GenerateContentResponse this module reads
 * (node_modules/@google/genai/dist/genai.d.ts line 6276).
 */
export type GeminiResponseSubset = Pick<GenerateContentResponse, "candidates" | "modelVersion" | "promptFeedback">;

export interface GeminiCollected {
  text: string;
  chunks: GroundingChunkInput[];
  model: string;
  error: string | null;
}

/** Pure part: answer text, grounding chunks, model, and a diagnosis when there is no text. No network. */
export function collectGemini(response: GeminiResponseSubset): GeminiCollected {
  // candidates: genai.d.ts line 6281; Candidate.content line 1696; Content.parts line 2195;
  // Part.text line 12828 and Part.thought line 12830 (thought parts are not answer text).
  const candidate = response.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");

  // Grounding: Candidate.groundingMetadata line 1713; GroundingMetadata.groundingChunks line 8014;
  // GroundingChunk.web line 7868; GroundingChunkWeb.uri line 8005 and .title line 8003
  // (.domain, line 8001, is not populated on the Gemini API, hence the redirect resolver).
  const chunks: GroundingChunkInput[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri) continue;
    chunks.push({ uri, title: chunk.web?.title ?? null });
  }

  // No text: say why. promptFeedback.blockReason line 6430, Candidate.finishReason line 1709.
  let error: string | null = null;
  if (!text) {
    const blockReason = response.promptFeedback?.blockReason;
    const finishReason = candidate?.finishReason;
    error = `Gemini returned no text (finishReason: ${finishReason ?? "unknown"}, blockReason: ${blockReason ?? "none"})`;
  }

  // modelVersion line 6289.
  return { text, chunks, model: response.modelVersion || GEMINI_MODEL, error };
}

export interface GeminiExtract {
  text: string;
  sources: Source[];
  searchResults: Source[];
  model: string;
  error: string | null;
}

/**
 * Extraction with the redirects resolved. Gemini exposes one list (the
 * grounding chunks), so it fills both `sources` and `searchResults`.
 */
export async function extractGemini(response: GeminiResponseSubset, resolve: ResolveOptions = {}): Promise<GeminiExtract> {
  const collected = collectGemini(response);
  const resolved = dedupeSources(await resolveGroundingSources(collected.chunks, resolve));
  return {
    text: collected.text,
    sources: resolved,
    searchResults: resolved.map((source) => ({ ...source })),
    model: collected.model,
    error: collected.error,
  };
}

/** One prompt through gemini-2.5-flash with Google Search grounding. Never throws: failures come back as `error`. */
export async function askGemini(apiKey: string, prompt: string, opts: EngineOpts = {}): Promise<EngineAnswer> {
  const started = Date.now();
  const timeout = opts.timeoutMs ?? QUERY_TIMEOUT_MS;
  try {
    // BYOK: GoogleGenAIOptions.apiKey, genai.d.ts line 7457; process.env is never read.
    const ai = new GoogleGenAI({ apiKey });
    // Models.generateContent line 11908; GenerateContentParameters.model 6266, .contents 6269, .config 6272.
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT, // GenerateContentConfig.systemInstruction line 6116
        tools: [{ googleSearch: {} }], // .tools line 6216; Tool.googleSearch line 16043; GoogleSearch line 7685
        httpOptions: {
          // .httpOptions line 6102; HttpOptions.timeout (milliseconds) line 8438
          timeout,
          // HttpRetryOptions.attempts line 8515 counts the first try; the SDK default is 5
          retryOptions: { attempts: 2 },
          // HttpOptions.fetch line 8447, test seam
          ...(opts.fetch ? { fetch: opts.fetch } : {}),
        },
      },
    });
    const extracted = await extractGemini(response, { fetch: opts.fetch });
    const latencyMs = Date.now() - started;
    if (extracted.error) return failedAnswer("gemini", extracted.model, latencyMs, extracted.error);
    return {
      engine: "gemini",
      model: extracted.model,
      text: extracted.text,
      sources: extracted.sources,
      searchResults: extracted.searchResults,
      latencyMs,
      error: null,
    };
  } catch (err) {
    return failedAnswer("gemini", GEMINI_MODEL, Date.now() - started, describeError(err, apiKey));
  }
}
