export interface QueryParams {
  businessName: string;
  businessCategory: string;
  city: string;
  state: string;
  primaryService: string;
  address: string;
}

export type QueryType =
  | "brand"
  | "category"
  | "service"
  | "comparison"
  | "recommendation";

export interface QueryResult {
  queryType: QueryType;
  query: string;
  mentioned: boolean;
  recommended: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  rawResponse: string;
  /* True when the API call itself failed. Errored queries are excluded from
     score denominators so an outage reads as "unavailable", not "invisible". */
  errored?: boolean;
}

export interface PlatformResult {
  platform: "openai" | "gemini" | "anthropic";
  results: QueryResult[];
  error: string | null;
}

export interface TechnicalSignal {
  name: string;
  score: number;
  maxScore: number;
  details: string;
}

export interface TechnicalAudit {
  signals: TechnicalSignal[];
  totalScore: number;
  maxPossibleScore: number;
  normalizedScore: number;
}

export interface CompetitorMention {
  name: string;
  platform: string;
  queryType: QueryType;
  position: number | null;
  recommended: boolean;
}

export interface ScanScores {
  aiVisibilityScore: number;
  technicalAeoScore: number;
  entityAuthorityScore: number;
  competitivePositionScore: number;
  overallScore: number;
}

/* Two-stage funnel: a "teaser" scan is created from a bare domain with no
   contact info (cheap: technical audit + 1 query per engine). Email unlock
   upgrades it to a "full" scan (all 5 query types per engine). Legacy rows
   predate the stage column and default to 'full'. */
export type ScanStage = "teaser" | "full";

export type ScanStatus =
  | "pending"
  | "scanning"
  | "teaser_complete"
  | "upgrading"
  | "complete"
  | "error";

export interface DetectedIdentity {
  businessName: string;
  city: string;
  state: string;
  category: string;
}

export interface ScanRow {
  id: string;
  url: string;
  stage: ScanStage;
  business_name: string | null;
  business_category: string | null;
  city: string | null;
  state: string | null;
  status: ScanStatus;
  ai_visibility_score: number | null;
  technical_aeo_score: number | null;
  entity_authority_score: number | null;
  competitive_position_score: number | null;
  overall_score: number | null;
  platform_results: PlatformResult[] | null;
  technical_results: TechnicalAudit | null;
  competitor_data: CompetitorMention[] | null;
  contact_name: string | null;
  email: string | null;
  industry: string | null;
  team_size: string | null;
  pain_points: string | null;
  goals: string | null;
  created_at: string;
  updated_at: string;
}
