/**
 * Shared contracts for "In the Sources" (see SPEC.md, "Contracts").
 * Written in phase 1. Additive changes only after that: every builder codes
 * against these names, so a renamed or removed field breaks another builder.
 */

export type EngineId = "openai" | "anthropic" | "gemini";

export const ENGINES: readonly EngineId[] = ["openai", "anthropic", "gemini"];

export interface EngineKeys {
  openai?: string;
  anthropic?: string;
  gemini?: string;
}

export interface Source {
  url: string;
  domain: string;
  title: string | null;
}

export interface EngineAnswer {
  engine: EngineId;
  model: string;
  text: string;
  sources: Source[];
  searchResults: Source[];
  latencyMs: number;
  error: string | null;
}

export interface AnswerAnalysis {
  mentioned: boolean;
  position: number | null;
  cited: boolean;
  competitorDomainsCited: string[];
}

export interface ProjectInput {
  brandName: string;
  domain: string;
  aliases: string[];
  competitorDomains: string[];
  dailyRun?: boolean;
}

export interface Project {
  id: string;
  licenseId: string;
  brandName: string;
  domain: string;
  aliases: string[];
  competitorDomains: string[];
  dailyRun: boolean;
  createdAt: string;
}

export interface Prompt {
  id: string;
  projectId: string;
  text: string;
  createdAt: string;
  archivedAt: string | null;
}

export type RunStatus = "running" | "complete" | "partial" | "failed";

export interface Run {
  id: string;
  projectId: string;
  trigger: "manual" | "cron";
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
}

export interface ResultInput {
  promptId: string;
  engine: EngineId;
  model: string | null;
  mentioned: boolean;
  position: number | null;
  cited: boolean;
  sources: Source[];
  searchResults: Source[];
  competitorDomainsCited: string[];
  rawText: string;
  error: string | null;
  latencyMs: number | null;
}

export interface ResultRow extends ResultInput {
  id: string;
  runId: string;
  createdAt: string;
}

export interface License {
  id: string;
  email: string;
  plan: "founder" | "standard" | "dev";
  status: "active" | "revoked";
  createdAt: string;
}

export interface EngineKeyHint {
  set: boolean;
  hint: string | null;
  updatedAt: string | null;
}

export interface EngineRate {
  engine: EngineId;
  /** Result rows for this engine in the run, errored or not. 0 means the engine had no key when the run started. Added 2026-10-01 (review fix). */
  attempted: number;
  answered: number;
  mentioned: number;
  cited: number;
  mentionRate: number | null;
  citationRate: number | null;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  status: RunStatus;
  perEngine: EngineRate[];
  overall: { answered: number; mentioned: number; cited: number };
}

export interface PromptCell {
  mentioned: boolean;
  position: number | null;
  cited: boolean;
  error: string | null;
}

export interface PromptRow {
  promptId: string;
  text: string;
  perEngine: Partial<Record<EngineId, PromptCell>>;
}

export interface CompetitorRow {
  domain: string;
  citations: number;
  isUs: boolean;
  isNamedCompetitor: boolean;
}

export interface Dashboard {
  project: Project;
  latestRun: RunSummary | null;
  trend: RunSummary[];
  promptTable: PromptRow[];
  competitorLeaderboard: CompetitorRow[];
}
