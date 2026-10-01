/**
 * Answer analysis (SPEC.md, "Mention matching" and "Domain matching").
 * Pure: no network, no secrets, no server-only guard.
 *
 * The mention parser and the DONT_KNOW list come from the site's audit
 * parser (the copied queries.ts), kept as the spec asks.
 */
import type { AnswerAnalysis, EngineAnswer, Project, Source } from "../contracts";
import { domainMatches, normalizeDomain } from "./domains";

/* "I don't have information about X" used to score as mentioned=true because
   the name echo substring-matched. Any of these phrases within
   DONT_KNOW_RADIUS characters of a mention zeroes that mention out. */
export const DONT_KNOW_PHRASES: readonly string[] = [
  "don't have information",
  "do not have information",
  "don't have specific information",
  "no information about",
  "no specific information",
  "couldn't find",
  "could not find",
  "wasn't able to find",
  "was not able to find",
  "unable to find",
  "unable to verify",
  "cannot verify",
  "can't verify",
  "not familiar with",
  "not aware of",
  "no search results",
  "no results for",
  "does not appear in",
  "doesn't appear in",
];
export const DONT_KNOW_RADIUS = 200;

export interface MentionMatch {
  mentioned: boolean;
  /** Only from a numbered-list entry whose line starts with the name. */
  position: number | null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary, case-insensitive match of one name in `text`. Every
 * occurrence is checked against the don't-know radius; one clean occurrence
 * is enough to count as a mention.
 */
export function findMention(name: string, text: string): MentionMatch {
  const lowerName = name.trim().toLowerCase();
  if (!lowerName || !text) return { mentioned: false, position: null };
  const lowerText = text.toLowerCase();
  const escaped = escapeRegex(lowerName);

  // Boundary on both sides: "A1 Dental" must not match inside "1A1 Dentalcare".
  const nameRegex = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "g");
  let mentioned = false;
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(lowerText)) !== null) {
    const start = match.index + match[1].length;
    const windowStart = Math.max(0, start - DONT_KNOW_RADIUS);
    const windowEnd = Math.min(lowerText.length, start + lowerName.length + DONT_KNOW_RADIUS);
    const window = lowerText.slice(windowStart, windowEnd);
    if (!DONT_KNOW_PHRASES.some((phrase) => window.includes(phrase))) {
      mentioned = true;
      break;
    }
  }
  if (!mentioned) return { mentioned: false, position: null };

  /* Position only from a genuine numbered-list entry: a line that starts with
     "N." or "N)", optional markdown emphasis or link bracket, then the name.
     A prose mention never gets a position (the old fallback assigned 1 to
     any mention and inflated every score). */
  const listRegex = new RegExp(`^[ \\t]*(\\d{1,3})[.)][ \\t]*(?:[*_#\\[]+[ \\t]*)?${escaped}(?=$|[^a-z0-9])`, "im");
  const listMatch = listRegex.exec(text);
  return { mentioned: true, position: listMatch ? parseInt(listMatch[1], 10) : null };
}

function sourceDomain(source: Source): string {
  return normalizeDomain(source.domain) || normalizeDomain(source.url);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function analyzeAnswer(
  answer: EngineAnswer,
  project: Pick<Project, "brandName" | "domain" | "aliases" | "competitorDomains">
): AnswerAnalysis {
  const text = answer.text ?? "";
  const names = unique(
    [project.brandName, ...(project.aliases ?? [])].map((name) => (name ?? "").trim()).filter(Boolean)
  );

  let mentioned = false;
  let position: number | null = null;
  for (const name of names) {
    const found = findMention(name, text);
    if (!found.mentioned) continue;
    mentioned = true;
    if (found.position !== null && (position === null || found.position < position)) {
      position = found.position;
    }
  }

  const sourceDomains = (answer.sources ?? []).map(sourceDomain).filter(Boolean);
  const cited = sourceDomains.some((domain) => domainMatches(domain, project.domain));
  const competitors = unique((project.competitorDomains ?? []).map(normalizeDomain).filter(Boolean));
  const competitorDomainsCited = competitors.filter((competitor) =>
    sourceDomains.some((domain) => domainMatches(domain, competitor))
  );

  return { mentioned, position, cited, competitorDomainsCited };
}
