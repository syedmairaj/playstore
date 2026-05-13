/**
 * Workspace-wide AI credit costs (see docs/architecture.md — Advanced Tenancy & Wallet).
 * Listing optimizer is one generation unit; bundle SKUs (e.g. ASO Growth Pack = 5) can map here later.
 */
export const AI_CREDIT_COSTS = {
  /** AI suggestion for a single add-app form field (app name or short description) */
  add_app_field_suggest: 3,
  /** Single-field AI autofill on the listing optimizer (keywords or features) */
  listing_optimizer_autofill: 3,
  /** Single listing draft (title / short / long / CTAs) via Gemini */
  listing_generation: 5,
  /**
   * Add AI listing keyword suggestions to Keyword Tracker: each keyword beyond the free
   * per-generation allowance costs this many credits (see `keyword_track_ai_free_per_generation`).
   */
  keyword_track_ai_per_keyword: 2,
  /** AI app icon batch (4 variants) via Runware image inference */
  listing_logo_generation: 8,
  /** Reserved for bundled ASO workflows */
  aso_growth_pack: 5,
  ad_copy: 1,
  push_hooks: 1,
  localization: 2,
  /** Live Serper Google preview per market (Keyword Tracker / Competitor Spy); 1 credit × country count. */
  serper_preview_per_country: 1,
} as const;

/** First N tracked keywords from a given listing generation are free (AI credits). */
export const KEYWORD_TRACK_AI_FREE_PER_GENERATION = 5;

export type AiCreditToolKey = keyof typeof AI_CREDIT_COSTS;
