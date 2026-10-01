import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Placement guard. The pixel sends the page URL to Meta on every PageView,
 * and the activation link once carried the license key in the query string
 * (review finding, 2026-10-01). Two independent fences: the pixel stays on
 * the marketing pages, and nothing under /activate or /app renders it.
 */

const APP_DIR = fileURLToPath(new URL("../app/", import.meta.url));

function read(rel: string): string {
  return readFileSync(join(APP_DIR, rel), "utf8");
}

function sourcesUnder(rel: string): Array<[string, string]> {
  const dir = join(APP_DIR, rel);
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => [join(rel, file), readFileSync(join(dir, file), "utf8")]);
}

describe("MetaPixel placement", () => {
  it("is rendered by the marketing pages and never by the root layout", () => {
    expect(read("layout.tsx")).not.toContain("MetaPixel");
    expect(read("page.tsx")).toContain("<MetaPixel />");
    expect(read("thanks/page.tsx")).toContain("<MetaPixel />");
  });

  it("never reaches /activate or /app, and the activate page reads nothing from the query string", () => {
    const files = [...sourcesUnder("activate"), ...sourcesUnder("app")];
    expect(files.length).toBeGreaterThan(3);
    for (const [name, source] of files) {
      expect(source, name).not.toContain("MetaPixel");
    }
    expect(read("activate/page.tsx")).not.toContain("searchParams");
  });
});

describe("MetaPixel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("renders nothing without a numeric pixel id", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "not-a-number");
    vi.resetModules();
    const { MetaPixel } = await import("./MetaPixel");
    expect(MetaPixel()).toBeNull();
  });

  it("emits one init and one PageView for a valid id", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456789");
    vi.resetModules();
    const { MetaPixel } = await import("./MetaPixel");
    const tree = JSON.stringify(MetaPixel());
    expect(tree).toContain("fbq('init', '123456789')");
    expect(tree).toContain("fbq('track', 'PageView')");
    expect(tree).toContain("id=123456789&ev=PageView&noscript=1");
  });
});
