import "../server-only";
import { Resend } from "resend";
import { activatePath } from "../activate-link";
import { PRODUCT } from "../product";

/*
 * Transactional email (builder B). The Resend client is built at call time
 * so a missing RESEND_API_KEY fails on the first send, not at import.
 * Resend class: node_modules/resend/dist/index.d.mts line 2818, constructor(key?) line 2844,
 * `emails` line 2835; Emails.send(payload) line 1990 returns Response<{ id }>
 * = { data, error: null } | { data: null, error: ErrorResponse } (lines 126-139).
 * CreateEmailOptions needs from, to, subject (lines 562, 592, 580) plus html or text (line 508).
 */

const DEFAULT_FROM = `${PRODUCT.name} <noreply@evoix.io>`;

/** `${NEXT_PUBLIC_BASE_URL}/activate#k=${key}`. The key sits in the fragment so it never reaches a server log or a third-party script (review fix, 2026-10-01). */
export function activateUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${activatePath(key)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain HTML and text bodies. Exported for the email test. */
export function licenseKeyEmailBody(params: { to: string; key: string }): { subject: string; html: string; text: string } {
  const url = activateUrl(params.key);
  const name = PRODUCT.name;
  const subject = `Your ${name} license key`;
  const text = [
    `Thanks for buying ${name}.`,
    "",
    "Your license key:",
    params.key,
    "",
    `Open ${url} to activate it, or paste the key on the activate page.`,
    "",
    `This key is a lifetime license tied to ${params.to}. Keep it somewhere safe.`,
    "",
    `Questions? Reply to this email or write to ${PRODUCT.supportEmail}.`,
    `${PRODUCT.company}`,
  ].join("\n");
  const html = [
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #111110; max-width: 560px;">`,
    `<p>Thanks for buying ${escapeHtml(name)}.</p>`,
    `<p>Your license key:</p>`,
    `<pre style="font-family: 'Geist Mono', Menlo, Consolas, monospace; font-size: 15px; background: #f5f4f0; padding: 12px 16px; border-radius: 8px; overflow-x: auto;">${escapeHtml(params.key)}</pre>`,
    `<p><a href="${escapeHtml(url)}" style="color: #2856ff;">Activate your license</a>, or paste the key on the activate page.</p>`,
    `<p>This key is a lifetime license tied to ${escapeHtml(params.to)}. Keep it somewhere safe.</p>`,
    `<p style="color: #6f6d68; font-size: 14px;">Questions? Reply to this email or write to ${escapeHtml(PRODUCT.supportEmail)}.<br>${escapeHtml(PRODUCT.company)}</p>`,
    `</div>`,
  ].join("\n");
  return { subject, html, text };
}

/** Resend, from EMAIL_FROM, link from activateUrl (key in the fragment). */
export async function sendLicenseKeyEmail(params: { to: string; key: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not set; the license email cannot be sent.");
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const { subject, html, text } = licenseKeyEmailBody(params);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to: params.to, subject, html, text });
  if (error) {
    // ErrorResponse: { message, statusCode, name } (index.d.mts lines 134-138). Never include the key.
    throw new Error(`Resend ${error.name}${error.statusCode ? ` (${error.statusCode})` : ""}: ${error.message}`);
  }
}
