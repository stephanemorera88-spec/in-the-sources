import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateLicenseKey, hashLicenseKey } from "./index";

const SECRET = "0123456789abcdef".repeat(4);

describe("crypto", () => {
  const original = process.env.KEY_ENCRYPTION_SECRET;
  beforeEach(() => {
    process.env.KEY_ENCRYPTION_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.KEY_ENCRYPTION_SECRET;
    else process.env.KEY_ENCRYPTION_SECRET = original;
  });

  it("round-trips a secret and never stores it in the clear", () => {
    const plain = "sk-test-1234567890abcdef";
    const blob = encryptSecret(plain);
    expect(blob).not.toContain(plain);
    expect(decryptSecret(blob)).toBe(plain);
    // iv(12) + tag(16) + ciphertext(len(plain)) bytes, base64.
    expect(Buffer.from(blob, "base64").length).toBe(12 + 16 + Buffer.byteLength(plain));
  });

  it("uses a fresh iv per call", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws when a byte of the blob is flipped", () => {
    const blob = encryptSecret("tamper-me");
    const buf = Buffer.from(blob, "base64");
    buf[buf.length - 1] ^= 0x01; // flip a ciphertext bit
    expect(() => decryptSecret(buf.toString("base64"))).toThrow();
    const buf2 = Buffer.from(blob, "base64");
    buf2[14] ^= 0x01; // flip a tag bit
    expect(() => decryptSecret(buf2.toString("base64"))).toThrow();
  });

  it("fails loudly when the secret is missing or malformed", () => {
    delete process.env.KEY_ENCRYPTION_SECRET;
    expect(() => encryptSecret("x")).toThrow(/KEY_ENCRYPTION_SECRET/);
    process.env.KEY_ENCRYPTION_SECRET = "abc";
    expect(() => encryptSecret("x")).toThrow(/64 hex/);
  });

  it("hashes license keys deterministically as sha256 hex", () => {
    const h = hashLicenseKey("its_abc");
    expect(h).toBe(hashLicenseKey("its_abc"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(hashLicenseKey("its_abd"));
    // Known vector so a changed algorithm shows up.
    expect(hashLicenseKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("generates its_ keys of 32 alphanumerics", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateLicenseKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(/^its_[A-Za-z0-9]{32}$/);
  });
});
