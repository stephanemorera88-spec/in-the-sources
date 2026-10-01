import "../server-only";

/*
 * Secrets at rest (builder B). Phase 1 stubs.
 * encryptSecret / decryptSecret: AES-256-GCM, key = KEY_ENCRYPTION_SECRET
 * (64 hex chars), blob = base64(iv | tag | ciphertext).
 */

export function encryptSecret(plain: string): string {
  void plain;
  throw new Error("not implemented: encryptSecret");
}

export function decryptSecret(blob: string): string {
  void blob;
  throw new Error("not implemented: decryptSecret");
}

/** sha256 hex of the plaintext license key. */
export function hashLicenseKey(key: string): string {
  void key;
  throw new Error("not implemented: hashLicenseKey");
}

/** "its_" + 32 chars from [A-Za-z0-9] via nanoid customAlphabet. */
export function generateLicenseKey(): string {
  throw new Error("not implemented: generateLicenseKey");
}
