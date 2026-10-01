import { describe, expect, it } from "vitest";
import { isGroundingRedirect, resolveGroundingSources, resolveRedirect } from "../gemini-redirects";
import { fakeFetch, hangingFetch, tick } from "./helpers";

const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123";
const REDIRECT_2 = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/XyZ789";

function redirectTo(location: string, status = 301): Response {
  return new Response(null, { status, headers: { location } });
}

describe("isGroundingRedirect", () => {
  it("recognizes the Vertex redirect host only", () => {
    expect(isGroundingRedirect(REDIRECT)).toBe(true);
    expect(isGroundingRedirect("https://evoix.io/page")).toBe(false);
    expect(isGroundingRedirect("not a url")).toBe(false);
  });
});

describe("resolveRedirect", () => {
  it("returns the absolute Location of a 301", async () => {
    const fetchImpl = fakeFetch(() => redirectTo("https://www.evoix.io/about"));
    await expect(resolveRedirect(REDIRECT, fetchImpl, 1000)).resolves.toBe("https://www.evoix.io/about");
    expect(fetchImpl.requests[0]?.method).toBe("GET");
  });

  it("resolves a relative Location against the redirect url", async () => {
    const fetchImpl = fakeFetch(() => redirectTo("/final", 302));
    await expect(resolveRedirect(REDIRECT, fetchImpl, 1000)).resolves.toBe("https://vertexaisearch.cloud.google.com/final");
  });

  it("returns null on a non-redirect answer, a missing Location, a network error or a timeout", async () => {
    await expect(resolveRedirect(REDIRECT, fakeFetch(() => new Response("ok", { status: 200 })), 1000)).resolves.toBeNull();
    await expect(resolveRedirect(REDIRECT, fakeFetch(() => new Response(null, { status: 302 })), 1000)).resolves.toBeNull();
    await expect(
      resolveRedirect(
        REDIRECT,
        fakeFetch(() => {
          throw new Error("ECONNRESET");
        }),
        1000
      )
    ).resolves.toBeNull();
    await expect(resolveRedirect(REDIRECT, hangingFetch(), 30)).resolves.toBeNull();
  });
});

describe("resolveGroundingSources", () => {
  it("resolves redirects, leaves direct urls alone, and falls back to the title as domain", async () => {
    const fetchImpl = fakeFetch((req) =>
      req.url === REDIRECT ? redirectTo("https://www.evoix.io/about") : new Response("nope", { status: 200 })
    );
    const sources = await resolveGroundingSources(
      [
        { uri: REDIRECT, title: "evoix.io" },
        { uri: REDIRECT_2, title: "competitor.com" },
        { uri: "https://direct.example.com/page", title: "Direct" },
        { uri: REDIRECT_2, title: "Just A Title" },
      ],
      { fetch: fetchImpl, timeoutMs: 1000 }
    );
    expect(sources).toEqual([
      { url: "https://www.evoix.io/about", domain: "evoix.io", title: "evoix.io" },
      { url: REDIRECT_2, domain: "competitor.com", title: "competitor.com" },
      { url: "https://direct.example.com/page", domain: "direct.example.com", title: "Direct" },
      { url: REDIRECT_2, domain: "", title: "Just A Title" },
    ]);
    expect(fetchImpl.requests.map((r) => r.url)).toEqual([REDIRECT, REDIRECT_2, REDIRECT_2]);
  });

  it("falls back to the title when the lookup times out", async () => {
    const sources = await resolveGroundingSources([{ uri: REDIRECT, title: "www.evoix.io" }], {
      fetch: hangingFetch(),
      timeoutMs: 30,
    });
    expect(sources).toEqual([{ url: REDIRECT, domain: "evoix.io", title: "www.evoix.io" }]);
  });

  it("keeps at most maxParallel lookups in flight", async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = fakeFetch(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(3);
      active -= 1;
      return redirectTo("https://evoix.io/");
    });
    const chunks = Array.from({ length: 40 }, (_, i) => ({ uri: `${REDIRECT}${i}`, title: "evoix.io" }));
    const sources = await resolveGroundingSources(chunks, { fetch: fetchImpl, timeoutMs: 1000, maxParallel: 5 });
    expect(sources).toHaveLength(40);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });
});
