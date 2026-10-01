import { describe, expect, it } from "vitest";
import { SITE_TEXT_MAX_CHARS, fetchSiteText, htmlToText, validateScanUrl } from "../site-text";
import { fakeFetch } from "./helpers";

function textResponse(body: string, type = "text/plain; charset=utf-8", status = 200): Response {
  return new Response(body, { status, headers: { "content-type": type } });
}

const LLMS = `# EVOIX\n\n> AI consulting for small businesses.\n\n${"EVOIX does automation, agents and AEO. ".repeat(10)}`;
const HOME =
  "<html><head><title>EVOIX</title><style>.x{color:red}</style><script>var a = 1;</script></head>" +
  "<body><nav><a href='/'>Home</a><a href='/about'>About</a></nav><h1>Business, Evolved.</h1>" +
  "<p>AI &amp; marketing for small&nbsp;businesses.</p><!-- hidden --><footer>&copy; EVOIX</footer></body></html>";

function routes(table: Record<string, () => Response>) {
  return fakeFetch((req) => table[req.url]?.() ?? new Response("not found", { status: 404 }));
}

describe("validateScanUrl", () => {
  it("accepts public hosts and rejects private, local and malformed ones", () => {
    expect(validateScanUrl("evoix.io")).toEqual({ url: "https://evoix.io/" });
    expect(validateScanUrl("http://Sub.Example.com/path")).toEqual({ url: "http://sub.example.com/path" });
    for (const bad of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.1.1", "172.16.0.1", "foo.internal", "nodots", "ftp://evoix.io"]) {
      expect("error" in validateScanUrl(bad)).toBe(true);
    }
    expect("error" in validateScanUrl("not a domain")).toBe(true);
  });
});

describe("htmlToText", () => {
  it("drops scripts, styles, nav, comments and tags, decodes entities and collapses whitespace", () => {
    expect(htmlToText(HOME)).toBe("EVOIX Business, Evolved. AI & marketing for small businesses. © EVOIX");
  });
});

describe("fetchSiteText", () => {
  it("uses llms.txt when it is 200, plain text and long enough", async () => {
    const fetchImpl = routes({ "https://evoix.io/llms.txt": () => textResponse(LLMS) });
    await expect(fetchSiteText("evoix.io", { fetch: fetchImpl })).resolves.toBe(LLMS.trim());
    expect(fetchImpl.requests.map((r) => r.url)).toEqual(["https://evoix.io/llms.txt"]);
  });

  it("accepts text/markdown and strips a scheme or path from the input", async () => {
    const fetchImpl = routes({ "https://evoix.io/llms.txt": () => textResponse(LLMS, "text/markdown") });
    await expect(fetchSiteText("https://www.evoix.io/some/page", { fetch: fetchImpl })).resolves.toBe("");
    await expect(fetchSiteText("https://evoix.io/some/page", { fetch: fetchImpl })).resolves.toBe(LLMS.trim());
  });

  it("falls back to the stripped home page when llms.txt is html, short or missing", async () => {
    const htmlLlms = routes({
      "https://evoix.io/llms.txt": () => textResponse("<html>spa</html>", "text/html"),
      "https://evoix.io/": () => textResponse(HOME, "text/html; charset=utf-8"),
    });
    await expect(fetchSiteText("evoix.io", { fetch: htmlLlms })).resolves.toBe(
      "EVOIX Business, Evolved. AI & marketing for small businesses. © EVOIX"
    );

    const shortLlms = routes({
      "https://evoix.io/llms.txt": () => textResponse("too short"),
      "https://evoix.io/": () => textResponse(HOME, "text/html"),
    });
    await expect(fetchSiteText("evoix.io", { fetch: shortLlms })).resolves.toContain("Business, Evolved.");

    const missing = routes({ "https://evoix.io/": () => textResponse(HOME, "text/html") });
    await expect(fetchSiteText("evoix.io", { fetch: missing })).resolves.toContain("Business, Evolved.");
    expect(missing.requests.map((r) => r.url)).toEqual(["https://evoix.io/llms.txt", "https://evoix.io/"]);
  });

  it("follows a public redirect but stops at a private one", async () => {
    const toPublic = routes({
      "https://evoix.io/": () => new Response(null, { status: 301, headers: { location: "https://www.evoix.io/" } }),
      "https://www.evoix.io/": () => textResponse(HOME, "text/html"),
    });
    await expect(fetchSiteText("evoix.io", { fetch: toPublic })).resolves.toContain("Business, Evolved.");

    const toPrivate = routes({
      "https://evoix.io/": () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/" } }),
    });
    await expect(fetchSiteText("evoix.io", { fetch: toPrivate })).resolves.toBe("");
    expect(toPrivate.requests.map((r) => r.url)).not.toContain("http://127.0.0.1:8080/");
  });

  it("returns an empty string when the site cannot be fetched", async () => {
    const failing = fakeFetch(() => {
      throw new Error("ENOTFOUND");
    });
    await expect(fetchSiteText("evoix.io", { fetch: failing })).resolves.toBe("");
    const serverError = routes({ "https://evoix.io/": () => textResponse("oops", "text/html", 503) });
    await expect(fetchSiteText("evoix.io", { fetch: serverError })).resolves.toBe("");
  });

  it("cuts the text at the limit", async () => {
    const long = routes({ "https://evoix.io/llms.txt": () => textResponse("a".repeat(SITE_TEXT_MAX_CHARS + 500)) });
    const text = await fetchSiteText("evoix.io", { fetch: long });
    expect(text).toHaveLength(SITE_TEXT_MAX_CHARS);
  });

  it("throws for a private or malformed address before any request", async () => {
    const fetchImpl = fakeFetch(() => textResponse(LLMS));
    await expect(fetchSiteText("localhost", { fetch: fetchImpl })).rejects.toThrow(/public website/);
    await expect(fetchSiteText("not a domain", { fetch: fetchImpl })).rejects.toThrow(/valid website/);
    expect(fetchImpl.requests).toHaveLength(0);
  });
});
