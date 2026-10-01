import { describe, expect, it } from "vitest";
import { ENGINES } from "./contracts";

describe("contracts", () => {
  it("lists the three engines in a stable order", () => {
    expect(ENGINES).toHaveLength(3);
    expect(ENGINES).toEqual(["openai", "anthropic", "gemini"]);
  });
});
