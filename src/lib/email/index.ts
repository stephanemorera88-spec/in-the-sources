import "../server-only";

/*
 * Transactional email (builder B). Phase 1 stub.
 * Resend, from EMAIL_FROM, link to `${NEXT_PUBLIC_BASE_URL}/activate?k=${key}`.
 */

export async function sendLicenseKeyEmail(params: { to: string; key: string }): Promise<void> {
  void params;
  throw new Error("not implemented: sendLicenseKeyEmail");
}
