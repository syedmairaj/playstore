/**
 * Workspace-wide AI credit costs (see docs/architecture.md — Advanced Tenancy & Wallet).
 * Listing optimizer is one generation unit; bundle SKUs (e.g. ASO Growth Pack = 5) can map here later.
 */
export const AI_CREDIT_COSTS = {
  /** Single listing draft (title / short / long / CTAs) via Gemini */
  listing_generation: 1,
  /** Reserved for bundled ASO workflows */
  aso_growth_pack: 5,
  ad_copy: 1,
  push_hooks: 1,
  localization: 2,
} as const;

export type AiCreditToolKey = keyof typeof AI_CREDIT_COSTS;
