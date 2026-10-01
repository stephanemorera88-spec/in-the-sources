import { z } from "zod";
import { ENGINES } from "@/lib/contracts";
import { PRODUCT } from "@/lib/product";

/*
 * Request body schemas for builder C's routes. zod 4.6.5; the API used here is
 * checked against node_modules/zod/v4/classic/schemas.d.ts: string() line 173,
 * min/max/trim lines 98 to 104, boolean() line 395, array() line 481,
 * object() line 530, enum line 610. Every message is a plain sentence shown
 * to the user as-is.
 */

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lowercase, no scheme, no credentials, no port, no www., no path, no trailing dot. */
export function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.replace(/^\/\//, "");
  d = d.split(/[/?#]/, 1)[0] ?? "";
  d = d.replace(/^[^@]*@/, "");
  d = d.replace(/:\d+$/, "");
  d = d.replace(/^www\./, "");
  d = d.replace(/\.+$/, "");
  return d;
}

/** 1 to 253 chars, ASCII labels, at least one dot (the schema column is the normalized form). */
export function isValidDomain(domain: string): boolean {
  return domain.length >= 1 && domain.length <= 253 && HOSTNAME_RE.test(domain);
}

function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export const brandNameSchema = z
  .string("Brand name must be text.")
  .trim()
  .min(1, "Brand name is required.")
  .max(120, "Brand name is at most 120 characters.");

export const domainSchema = z
  .string("Domain must be text.")
  .trim()
  .min(1, "Domain is required.")
  .max(2048, "Domain is too long.")
  .transform(normalizeDomain)
  .refine(isValidDomain, "Enter a domain like example.com (1 to 253 characters, no spaces).");

export const aliasesSchema = z
  .array(z.string("Each alias must be text.").trim().max(80, "Each alias is at most 80 characters."), "Aliases must be a list.")
  .max(10, "At most 10 aliases.")
  .transform(cleanList);

export const competitorDomainsSchema = z
  .array(
    z.string("Each competitor domain must be text.").trim().max(2048, "A competitor domain is too long.").transform(normalizeDomain),
    "Competitor domains must be a list."
  )
  .max(20, "At most 20 competitor domains.")
  .transform(cleanList)
  .refine((list) => list.every(isValidDomain), "Each competitor domain must look like example.com.");

/** POST /api/projects. Output matches ProjectInput. */
export const projectCreateSchema = z.object({
  brandName: brandNameSchema,
  domain: domainSchema,
  aliases: aliasesSchema.default([]),
  competitorDomains: competitorDomainsSchema.default([]),
  dailyRun: z.boolean("dailyRun must be true or false.").optional(),
});

/** PATCH /api/projects/[id]. Omitted fields stay untouched; an empty body is rejected. */
export const projectPatchSchema = z
  .object({
    brandName: brandNameSchema.optional(),
    domain: domainSchema.optional(),
    aliases: aliasesSchema.optional(),
    competitorDomains: competitorDomainsSchema.optional(),
    dailyRun: z.boolean("dailyRun must be true or false.").optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), "Nothing to update.");

/** POST /api/projects/[id]/prompts. Blank lines and duplicates are dropped; the route also caps active prompts per project. */
export const promptsCreateSchema = z.object({
  texts: z
    .array(z.string("Each prompt must be text.").trim().max(300, "Each prompt is at most 300 characters."), "Prompts must be a list.")
    .max(PRODUCT.maxPromptsPerProject, `Add at most ${PRODUCT.maxPromptsPerProject} prompts at a time.`)
    .transform(cleanList)
    .refine((list) => list.length >= 1, "Add at least one prompt."),
});

export const engineSchema = z.enum(ENGINES, "Engine must be openai, anthropic or gemini.");

/** PUT /api/settings/keys. The key is trimmed and never echoed back. */
export const keyPutSchema = z.object({
  engine: engineSchema,
  apiKey: z.string("The API key must be text.").trim().min(10, "That key looks too short.").max(400, "That key looks too long."),
});

/** DELETE /api/settings/keys. */
export const keyDeleteSchema = z.object({
  engine: engineSchema,
});
