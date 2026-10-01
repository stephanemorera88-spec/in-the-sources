import { describe, expect, it, vi } from "vitest";
import type { ProjectInput } from "../../contracts";
import { SUGGEST_COUNT, SUGGEST_SYSTEM_PROMPT, buildSuggestPrompt, parseSuggestions, suggestPrompts } from "../suggest";

const project: ProjectInput = {
  brandName: "In the Sources",
  domain: "evoix.io",
  aliases: ["ITS"],
  competitorDomains: ["competitor.com"],
};

const TEN = Array.from({ length: 10 }, (_, i) => `Question ${i + 1}?`);

describe("parseSuggestions", () => {
  it("reads the array out of surrounding prose and out of an object wrapper", () => {
    expect(parseSuggestions('Sure, here you go:\n["a?", "b?"]\nAnything else?')).toEqual(["a?", "b?"]);
    expect(parseSuggestions('{"prompts": ["a?"]}')).toEqual(["a?"]);
    expect(parseSuggestions('```json\n["a?"]\n```')).toEqual(["a?"]);
  });

  it("trims, dedupes case-insensitively and caps at ten", () => {
    expect(parseSuggestions('["a?", " a? ", "A?", "b?"]')).toEqual(["a?", "b?"]);
    expect(parseSuggestions(JSON.stringify([...TEN, "extra one?", "extra two?"]))).toEqual(TEN);
  });

  it("returns null for anything that is not a list of 1 to 12 non-empty strings", () => {
    expect(parseSuggestions("no json here")).toBeNull();
    expect(parseSuggestions("[]")).toBeNull();
    expect(parseSuggestions("[1, 2]")).toBeNull();
    expect(parseSuggestions('["", "x"]')).toBeNull();
    expect(parseSuggestions('["a"')).toBeNull();
    expect(parseSuggestions(JSON.stringify(Array.from({ length: 13 }, (_, i) => `q${i}`)))).toBeNull();
  });
});

describe("buildSuggestPrompt", () => {
  it("names the brand, domain, aliases, competitors, the site text and the 8 + 2 split", () => {
    const prompt = buildSuggestPrompt(project, "EVOIX does AEO.");
    expect(prompt).toContain("Brand: In the Sources");
    expect(prompt).toContain("Website: evoix.io");
    expect(prompt).toContain("Also known as: ITS");
    expect(prompt).toContain("Competitors: competitor.com");
    expect(prompt).toContain("EVOIX does AEO.");
    expect(prompt).toContain(`exactly ${SUGGEST_COUNT} questions`);
    expect(prompt).toContain(`Exactly ${SUGGEST_COUNT - 2} of them must not contain the brand name`);
    expect(prompt).toContain('Exactly 2 of them must contain the brand name "In the Sources"');
    expect(prompt).toContain("under 120 characters");
    expect(buildSuggestPrompt(project, "   ")).toContain("No website text was available");
  });
});

describe("suggestPrompts", () => {
  it("throws a plain error when no key is set", async () => {
    await expect(suggestPrompts({}, project, "")).rejects.toThrow(/API key/);
    await expect(suggestPrompts({ openai: "  " }, project, "")).rejects.toThrow(/API key/);
  });

  it("prefers openai, then anthropic, then gemini, and passes the trimmed key", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(TEN));
    await suggestPrompts({ gemini: "g", anthropic: "a", openai: " o " }, project, "site", { complete });
    expect(complete).toHaveBeenCalledWith("openai", "o", SUGGEST_SYSTEM_PROMPT, expect.stringContaining("Brand: In the Sources"));
    await suggestPrompts({ gemini: "g", anthropic: "a" }, project, "site", { complete });
    expect(complete).toHaveBeenLastCalledWith("anthropic", "a", SUGGEST_SYSTEM_PROMPT, expect.any(String));
    await suggestPrompts({ gemini: "g" }, project, "site", { complete });
    expect(complete).toHaveBeenLastCalledWith("gemini", "g", SUGGEST_SYSTEM_PROMPT, expect.any(String));
  });

  it("returns the parsed list", async () => {
    const complete = vi.fn().mockResolvedValue(`Here:\n${JSON.stringify(TEN)}`);
    await expect(suggestPrompts({ openai: "o" }, project, "site", { complete })).resolves.toEqual(TEN);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("retries once with a reminder when the reply is unparsable, then throws", async () => {
    const complete = vi.fn().mockResolvedValueOnce("garbage").mockResolvedValueOnce('["q1?"]');
    await expect(suggestPrompts({ openai: "o" }, project, "", { complete })).resolves.toEqual(["q1?"]);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]?.[3]).toContain("previous reply was not a JSON array");

    const stubborn = vi.fn().mockResolvedValue("still garbage");
    await expect(suggestPrompts({ openai: "o" }, project, "", { complete: stubborn })).rejects.toThrow(/two attempts/);
    expect(stubborn).toHaveBeenCalledTimes(2);
  });

  it("wraps an engine failure in a plain message without the key", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("401 bad key sk-secret-key-123456"));
    const error = await suggestPrompts({ openai: "sk-secret-key-123456" }, project, "", { complete }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Could not get suggestions from openai/);
    expect((error as Error).message).not.toContain("sk-secret");
  });
});
