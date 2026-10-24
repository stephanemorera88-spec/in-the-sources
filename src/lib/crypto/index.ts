import "../server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { customAlphabet } from "nanoid";

/*
 * Secrets at rest (module B).
 * encryptSecret / decryptSecret: AES-256-GCM with a 12-byte random iv and a
 * 16-byte auth tag, key = KEY_ENCRYPTION_SECRET (64 hex chars = 32 bytes),
 * blob = base64(iv | tag | ciphertext). The secret is read at call time so a
 * missing or malformed value fails loudly on first use, not at import.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET must be 64 hex characters (32 bytes). Generate one with `openssl rand -hex 32` and set it in the environment."
    );
  }
  return Buffer.from(secret, "hex");
}

export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes for GCM by default
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const key = encryptionKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error("decryptSecret: blob is too short to hold an iv and an auth tag");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // final() throws "Unsupported state or unable to authenticate data" on tamper.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** sha256 hex of the plaintext license key. */
export function hashLicenseKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// customAlphabet(alphabet, defaultSize) returns (size?) => string:
// node_modules/nanoid/index.d.ts lines 47-50.
const keyBody = customAlphabet(KEY_ALPHABET, 32);

/** "its_" + 32 chars from [A-Za-z0-9] via nanoid customAlphabet. */
export function generateLicenseKey(): string {
  return `its_${keyBody()}`;
}
