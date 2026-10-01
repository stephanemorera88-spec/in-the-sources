import { describe, expect, it } from "vitest";
import { createLimiter } from "../limiter";
import { tick } from "./helpers";

describe("createLimiter", () => {
  it("never runs more than the cap at once and preserves results", async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        limit(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await tick(3 + (i % 3) * 3);
          active -= 1;
          return i;
        })
      )
    );
    expect(peak).toBe(3);
    expect(results).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("releases the slot when a task throws", async () => {
    const limit = createLimiter(1);
    await expect(
      limit(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(limit(async () => "ok")).resolves.toBe("ok");
  });

  it("rejects a cap below one", () => {
    expect(() => createLimiter(0)).toThrow();
    expect(() => createLimiter(1.5)).toThrow();
  });
});
