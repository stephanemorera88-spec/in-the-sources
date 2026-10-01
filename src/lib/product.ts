/**
 * Product constants. A rename or a price change is a one-file edit here;
 * nothing else in the tree hard-codes the name or the price.
 */
export const PRODUCT = {
  name: "In the Sources",
  shortName: "In the Sources",
  tagline: "See whether ChatGPT, Claude and Gemini cite your site, with your own API keys.",
  founderPriceUsd: 69,
  founderKeys: 100,
  standardPriceUsd: 149,
  /** Active prompts a project may hold; the landing page promises this number and the cron budget is sized to it. */
  maxPromptsPerProject: 25,
  company: "EVOIX LLC",
  companyUrl: "https://evoix.io",
  supportEmail: "stephane@evoix.io",
} as const;
