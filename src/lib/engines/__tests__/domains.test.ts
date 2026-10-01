import { describe, expect, it } from "vitest";
import { domainMatches, normalizeDomain } from "../domains";

describe("normalizeDomain", () => {
  it.each([
    ["https://www.EVOIX.io/path?x=1#frag", "evoix.io"],
    ["http://evoix.io:8443/", "evoix.io"],
    ["EVOIX.IO", "evoix.io"],
    ["www.evoix.io.", "evoix.io"],
    ["  blog.evoix.io/post  ", "blog.evoix.io"],
    ["evoix.io:443", "evoix.io"],
    ["vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "vertexaisearch.cloud.google.com"],
    ["", ""],
    ["   ", ""],
    ["Some Page Title", ""],
    ["not a url", ""],
    ["https://", ""],
  ])("%j becomes %j", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
});

describe("domainMatches", () => {
  it("matches the domain itself and its subdomains", () => {
    expect(domainMatches("evoix.io", "evoix.io")).toBe(true);
    expect(domainMatches("blog.evoix.io", "evoix.io")).toBe(true);
    expect(domainMatches("https://www.evoix.io/x", "EVOIX.io")).toBe(true);
  });

  it("rejects lookalikes, parents and empty sides", () => {
    expect(domainMatches("notevoix.io", "evoix.io")).toBe(false);
    expect(domainMatches("evoix.io", "blog.evoix.io")).toBe(false);
    expect(domainMatches("evoix.io", "")).toBe(false);
    expect(domainMatches("", "evoix.io")).toBe(false);
  });
});
