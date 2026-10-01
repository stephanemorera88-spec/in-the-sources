import type { EngineId, License, RunStatus } from "@/lib/contracts";

/*
 * Display helpers shared by the app pages and components. Plain functions,
 * safe in Server and Client Components. Times are shown in UTC with the
 * zone named, so a server render and a client render never disagree.
 */

export const ENGINE_LABELS: Record<EngineId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

export const PLAN_LABELS: Record<License["plan"], string> = {
  founder: "Founder",
  standard: "Standard",
  dev: "Dev",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: "Running",
  complete: "Complete",
  partial: "Partial, some answers failed",
  failed: "Failed",
};

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateShortFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 1, 2026, 14:03 UTC" */
export function formatDateTime(iso: string): string {
  const date = parseDate(iso);
  return date ? `${dateTimeFormat.format(date)} UTC` : iso;
}

/** "Oct 1, 2026" */
export function formatDate(iso: string): string {
  const date = parseDate(iso);
  return date ? dateFormat.format(date) : iso;
}

/** "Oct 1" */
export function formatDateShort(iso: string): string {
  const date = parseDate(iso);
  return date ? dateShortFormat.format(date) : iso;
}

/** 0.6667 -> "67%"; null (no answers) -> "n/a". */
export function formatPercent(rate: number | null): string {
  return rate === null ? "n/a" : `${Math.round(rate * 100)}%`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Masks anything shaped like a provider API key in text that came from an
 * engine error (OpenAI and Anthropic keys start with "sk-", Gemini keys with
 * "AIza"). The engines are expected to scrub already; this is the display
 * side's backstop. Same patterns as scrubSecrets in src/app/api/_lib.
 */
export function scrubKeyLike(text: string): string {
  return text.replace(/\bsk-[A-Za-z0-9_*-]{6,}/g, "sk-[hidden]").replace(/\bAIza[A-Za-z0-9_*-]{8,}/g, "AIza[hidden]");
}
