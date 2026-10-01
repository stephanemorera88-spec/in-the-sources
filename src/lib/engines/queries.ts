import type { QueryParams, QueryType } from "./types";

export function generateQueries(params: QueryParams): Array<{ type: QueryType; query: string }> {
  return [
    {
      type: "brand",
      query: `Tell me about ${params.businessName} in ${params.city}, ${params.state}`,
    },
    {
      type: "category",
      query: `What are the best ${params.businessCategory} in ${params.city}?`,
    },
    {
      type: "service",
      query: `Who should I hire for ${params.primaryService} in ${params.city}?`,
    },
    {
      type: "comparison",
      query: `Compare ${params.businessName} to other ${params.businessCategory} in ${params.city}`,
    },
    {
      type: "recommendation",
      query: `I need a ${params.businessCategory} near ${params.address}. Who do you recommend?`,
    },
  ];
}

/* "I don't have information about X" used to score as mentioned=true,
   position 1 (4/6 points) because the name echo substring-matched. These
   phrases within DONT_KNOW_RADIUS chars of the mention zero it out. */
const DONT_KNOW_PHRASES = [
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
const DONT_KNOW_RADIUS = 200;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseResponse(
  businessName: string,
  rawResponse: string
): {
  mentioned: boolean;
  recommended: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
} {
  const lowerResponse = rawResponse.toLowerCase();
  const lowerName = businessName.toLowerCase().trim();
  const escapedName = escapeRegex(lowerName);

  // Word-boundary match: "A1 Dental" must not match inside "1A1 Dentalcare".
  const nameRegex = new RegExp(`(^|[^a-z0-9])${escapedName}($|[^a-z0-9])`, "i");
  const nameMatch = nameRegex.exec(lowerResponse);
  let mentioned = nameMatch !== null;
  const nameIndex = nameMatch ? nameMatch.index + nameMatch[1].length : -1;

  if (mentioned) {
    const windowStart = Math.max(0, nameIndex - DONT_KNOW_RADIUS);
    const windowEnd = Math.min(
      lowerResponse.length,
      nameIndex + lowerName.length + DONT_KNOW_RADIUS
    );
    const window = lowerResponse.substring(windowStart, windowEnd);
    if (DONT_KNOW_PHRASES.some((p) => window.includes(p))) {
      mentioned = false;
    }
  }

  const recommendKeywords = [
    "recommend", "top choice", "best option", "highly rated",
    "excellent choice", "great choice", "standout", "top-rated",
    "first choice", "go-to",
  ];
  const recommended = mentioned && recommendKeywords.some((kw) => lowerResponse.includes(kw));

  /* Position only from a genuine numbered-list entry. The old fallback
     assigned position 1 to any prose mention, which inflated every score. */
  let position: number | null = null;
  if (mentioned) {
    const numberedPattern = new RegExp(`(\\d+)\\.\\s*\\**\\s*${escapedName}`, "i");
    const match = rawResponse.match(numberedPattern);
    if (match) {
      position = parseInt(match[1], 10);
    }
  }

  let sentiment: "positive" | "neutral" | "negative" | null = null;
  if (mentioned) {
    const positiveWords = [
      "excellent", "great", "outstanding", "highly", "best", "top",
      "recommended", "trusted", "reliable", "quality", "professional",
    ];
    const negativeWords = [
      "poor", "bad", "avoid", "complaints", "issues", "problems",
      "negative", "worst", "unreliable",
    ];

    const contextStart = Math.max(0, nameIndex - 200);
    const contextEnd = Math.min(lowerResponse.length, nameIndex + lowerName.length + 200);
    const context = lowerResponse.substring(contextStart, contextEnd);

    const posCount = positiveWords.filter((w) => context.includes(w)).length;
    const negCount = negativeWords.filter((w) => context.includes(w)).length;

    if (posCount > negCount) sentiment = "positive";
    else if (negCount > posCount) sentiment = "negative";
    else sentiment = "neutral";
  }

  return { mentioned, recommended, position, sentiment };
}
