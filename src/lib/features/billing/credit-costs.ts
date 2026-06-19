/**
 * Workspace-wide AI credit costs (see docs/architecture.md — Advanced Tenancy & Wallet).
 * Listing optimizer is one generation unit; bundle SKUs (e.g. ASO Growth Pack = 5) can map here later.
 *
 * Brand Assets pricing (current):
 *   App Icon batch (4 variants)       → 15 credits
 *   Feature Graphic batch (4 variants) → 15 credits
 *   Brand Kit (icon + banner together) → 30 credits (15 + 15)
 *   Screenshot batch (6 slides)        → 20 credits render + 3 credits captions = 23 total
 */
export const AI_CREDIT_COSTS = {
  /** AI suggestion for a single add-app form field (app name or short description) */
  add_app_field_suggest: 3,
  /** Single-field AI autofill on the listing optimizer (keywords or features) */
  listing_optimizer_autofill: 3,
  /** Full listing draft + certified ASO score (title / short / long / CTAs + rubric) via Gemini */
  listing_generation: 5,
  /** Modular listing per-block regenerate after trial quota (3 free per workspace). */
  modular_listing_regenerate: 1,
  /**
   * Add AI listing keyword suggestions to Keyword Tracker: each keyword beyond the free
   * per-generation allowance costs this many credits (see `keyword_track_ai_free_per_generation`).
   */
  keyword_track_ai_per_keyword: 2,
  /** AI app icon batch (4 variants) via Runware FLUX.1 [dev] — basic generation */
  listing_logo_generation: 15,
  /** AI app icon batch with user-supplied custom prompt — paid plan only */
  listing_logo_generation_custom: 17,
  /** Google Play feature graphic banner (1024×500, 4 variants) via Runware */
  banner_generation: 15,
  /** Brand Kit batch: icon batch + banner batch in one click (30 = 15 + 15) */
  brand_kit_batch: 30,
  /** Reserved for bundled ASO workflows */
  aso_growth_pack: 5,
  ad_copy: 1,
  push_hooks: 1,
  localization: 2,
  /** Live Serper Google preview per market (Keyword Tracker / Competitor Spy); 1 credit × country count. */
  serper_preview_per_country: 1,
  /** AI draft reply for a single Play Store review (Reviews dashboard). */
  reviews_ai_reply: 1,
  /**
   * Gemini-powered Common Issues analysis: clusters ≤2★ reviews into labelled
   * pain-point cards with severity + impact metrics.  Billed once per
   * (workspace × package_name × lang_code) analysis run; cached result is served
   * free on subsequent reads until the cache expires or is invalidated.
   */
  reviews_issue_analysis: 3,
  /** On-demand marketplace ecosystem scan: re-crawls tracked keywords + competitor listings and writes fresh alerts. */
  marketplace_scan: 1,
  /**
   * AI Keyword Spotlight for Market Intelligence: analyses the top-10 chart titles/descriptions
   * and surfaces trending keywords, a category narrative, and an ASO tip via Gemini.
   * Top Charts (the ranked list) is always free; the AI layer costs this many credits.
   */
  market_keyword_spotlight: 3,
  /**
   * Screenshot Studio — Gemini caption generation.
   * Produces 3 caption variation sets (feature-led, benefit-led, emotional-led),
   * each covering the first 3 hero slides. Billed once per generation run.
   */
  screenshot_captions: 3,
  /**
   * Screenshot Studio — Runware image render batch.
   * Generates 3 portrait screenshot backgrounds (1080×1920) via Runware FLUX.1 [dev].
   * Phone frame + text are composited client-side at export time.
   * Total screenshot cost: screenshot_captions (3) + screenshot_render (20) = 23 credits.
   */
  screenshot_render: 20,
} as const;

/** First N tracked keywords from a given listing generation are free (AI credits). */
export const KEYWORD_TRACK_AI_FREE_PER_GENERATION = 5;

export type AiCreditToolKey = keyof typeof AI_CREDIT_COSTS;
