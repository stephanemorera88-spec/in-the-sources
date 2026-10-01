import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { runPlatformQueries, GEMINI_MODEL, AUDIT_SYSTEM_PROMPT, QUERY_TIMEOUT_MS } from "./runner";
import type { QueryParams, PlatformResult, QueryType } from "./types";

// Gemini's default safety filters block prompts that ask it to recommend
// or compare businesses (it reads them as commercial endorsement). For
// the AEO audit we genuinely need that output, so we relax to BLOCK_ONLY_HIGH
// across all four categories. This is a backend-only B2B tool, not a
// user-facing content generator, so the relaxed posture is appropriate.
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export async function queryGemini(params: QueryParams, types?: QueryType[]): Promise<PlatformResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "" });

  return runPlatformQueries("gemini", params, async (query) => {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: query,
      config: {
        systemInstruction: AUDIT_SYSTEM_PROMPT,
        // Google Search grounding — same reasoning as the other platforms:
        // measure what Gemini-with-search says, not parametric memory.
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 2048,
        temperature: 0,
        safetySettings,
        httpOptions: { timeout: QUERY_TIMEOUT_MS },
      },
    });

    // Surface block/finish reasons in rawResponse so a blocked query shows
    // WHY it returned no mention instead of silently scoring 0.
    const blockReason = result.promptFeedback?.blockReason;
    const finishReason = result.candidates?.[0]?.finishReason;
    const rawResponse = result.text ?? "";

    if (!rawResponse && (blockReason || finishReason)) {
      return `Gemini returned no content — finishReason: ${finishReason ?? "unknown"}, blockReason: ${blockReason ?? "none"}.`;
    }
    return rawResponse;
  }, types);
}
