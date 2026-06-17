/** Market Intelligence signal taxonomy — SSOT for ingestion + UI routing. */

export const MARKET_INTEL_SIGNAL_TYPES = [
  "growth_keyword",
  "competitor_threat",
  "ux_sentiment_insight",
] as const;

export type MarketIntelSignalType = (typeof MARKET_INTEL_SIGNAL_TYPES)[number];

export type UxSentimentInsightKind =
  | "category_narrative"
  | "aso_recommendation"
  | "sentiment_theme";

export type GrowthKeywordSignal = {
  type: "growth_keyword";
  id: string;
  term: string;
  /** Estimated relative search volume (0–100). */
  searchVolumeScore: number;
  /** Estimated CVR / install intent impact (0–100). */
  conversionImpactScore: number;
  /** Weighted blend used for default list ordering. */
  priorityScore: number;
  frequencyRank: number;
};

export type CompetitorThreatSignal = {
  type: "competitor_threat";
  id: string;
  term: string;
  competitorAppId: string | null;
  competitorTitle: string;
  chartRank: number | null;
  threatScore: number;
  searchVolumeScore: number;
  conversionImpactScore: number;
  priorityScore: number;
};

export type UxSentimentInsightSignal = {
  type: "ux_sentiment_insight";
  id: string;
  headline: string;
  body: string;
  insightKind: UxSentimentInsightKind;
  category: string;
  country: string;
  capturedAt: string;
};

export type MarketIntelligenceReport = {
  version: 2;
  growthKeywords: GrowthKeywordSignal[];
  competitorThreats: CompetitorThreatSignal[];
  uxSentimentInsights: UxSentimentInsightSignal[];
};

/** Legacy v1 spotlight shape (pre-categorization). */
export type LegacyKeywordSpotlightResult = {
  trendingKeywords: string[];
  narrative: string;
  asoTip: string;
};

export type MarketIntelContext = {
  category: string;
  country: string;
  ownAppId?: string | null;
};

export type ChartAppForThreats = {
  appId: string;
  title: string;
  summary?: string | null;
  rank: number;
};
