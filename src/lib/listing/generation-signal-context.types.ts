/**
 * Structured signal context carrying all five workspace intelligence sources
 * into every Gemini generation call.  Built server-side in the executor before
 * the LLM is invoked and threaded through the whole orchestration pipeline.
 */

export type BrandKitSignal = {
  /** Primary hex color, e.g. "#1A73E8" */
  primaryColor: string | null;
  /** Visual / tone style descriptor, e.g. "Modern", "Minimal", "Bold" */
  style: string | null;
  /** Comma-separated secondary palette, e.g. "#FF4081, #212121" */
  colorPalette: string | null;
  /** Free-text tone guidelines extracted from brand asset meta */
  toneGuidelines: string | null;
};

export type MarketIntelSignal = {
  /** Market gaps identified from active-context market signals */
  gaps: string[];
  /** Trending themes / category opportunities */
  trends: string[];
};

export type ReviewInsightsSignal = {
  /** Top user pain points from review analysis */
  topPainPoints: string[];
  /** Positive themes to amplify in copy */
  positiveHighlights: string[];
};

export type CompetitorSignal = {
  /** Competitor weaknesses to position against */
  weaknesses: string[];
  /** Differentiation angles / exploit targets */
  differentiators: string[];
};

export type KeywordTrackerSignal = {
  /** High-confidence tracked keywords (≥70 % confidence) */
  highConfidenceKeywords: string[];
  /** Lower-confidence keywords with ranking opportunity (<70 %) */
  opportunityKeywords: string[];
};

/**
 * Unified context object passed to every Gemini prompt builder.
 *
 * - `brandKit`           — fetched from `brand_assets` table (NEW data source)
 * - `marketIntel`        — derived from `activeContext.market` signals
 * - `reviews`            — derived from `topStagedIssues`
 * - `keywordTracker`     — derived from `trackedKeywordSignals`
 * - `competitorSignals`  — derived from `activeContext.offensive` + `exploitTargets`
 */
export type GenerationSignalContext = {
  brandKit: BrandKitSignal;
  marketIntel: MarketIntelSignal;
  reviews: ReviewInsightsSignal;
  keywordTracker: KeywordTrackerSignal;
  competitorSignals: CompetitorSignal;
};

export const EMPTY_BRAND_KIT_SIGNAL: BrandKitSignal = {
  primaryColor: null,
  style: null,
  colorPalette: null,
  toneGuidelines: null,
};

export const EMPTY_GENERATION_SIGNAL_CONTEXT: GenerationSignalContext = {
  brandKit: EMPTY_BRAND_KIT_SIGNAL,
  marketIntel: { gaps: [], trends: [] },
  reviews: { topPainPoints: [], positiveHighlights: [] },
  keywordTracker: { highConfidenceKeywords: [], opportunityKeywords: [] },
  competitorSignals: { weaknesses: [], differentiators: [] },
};
