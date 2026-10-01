import { describe, expect, it } from "vitest";
import { activatePath, keyFromFragment } from "./activate-link";

describe("activate link", () => {
  it("puts the key in the fragment and reads it back", () => {
    expect(activatePath("its_abc")).toBe("/activate#k=its_abc");
    expect(activatePath("its_abc")).not.toContain("?");
    expect(keyFromFragment("#k=its_abc")).toBe("its_abc");
    expect(keyFromFragment("k=its_abc")).toBe("its_abc");
    expect(keyFromFragment("#k=%20its_abc%20&x=1")).toBe("its_abc");
  });

  it("returns an empty string when there is no key", () => {
    expect(keyFromFragment("")).toBe("");
    expect(keyFromFragment("#")).toBe("");
    expect(keyFromFragment("#other=1")).toBe("");
    expect(keyFromFragment("#k=")).toBe("");
  });
});
