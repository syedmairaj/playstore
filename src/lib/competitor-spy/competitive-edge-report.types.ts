/** Structured Competitor Spy Report — input for AI Listing Optimizer (EN/AR). */

export type CompetitiveEdgeListingSnapshot = {
  title?: string;
  shortDescription?: string;
  longDescriptionExcerpt?: string;
};

export type CompetitiveEdgeActionItem = {
  /** Human-readable insight (praise, bug, request, keyword, asset gap). */
  signal: string;
  /** Actionable pivot for our listing metadata — never raw data dump. */
  strategy: string;
};

export type CompetitiveEdgeCounterFeature = {
  painPoint: string;
  counterFeature: string;
  /** Where to emphasize: title | shortDescription | fullDescription | whatsNew */
  listingPlacement: "title" | "shortDescription" | "fullDescription" | "whatsNew";
  strategy: string;
};

export type CompetitiveEdgeKeywordCapture = {
  keyword: string;
  ourRank: number | null;
  theirRank: number | null;
  /** They rank worse than typical / we lead / gap term — drives strategy tone. */
  vulnerability: "they_trail" | "we_trail" | "gap" | "tie";
  strategy: string;
};

export type CompetitiveEdgeAssetOpportunity = {
  gap: string;
  ourAction: string;
  priority: "high" | "medium";
};

export type CompetitiveEdgeReport = {
  locale: "en" | "ar";
  competitorName: string;
  competitorPackageId: string;
  listingSnapshot?: CompetitiveEdgeListingSnapshot;
  reviewIntelligence: {
    /** Market-dominating strengths (strategic, high-CVR). */
    praise: CompetitiveEdgeActionItem[];
    /** User-appreciated baseline features — informational only. */
    praiseBaseline?: CompetitiveEdgeActionItem[];
    bugs: CompetitiveEdgeCounterFeature[];
    featureRequests: CompetitiveEdgeActionItem[];
  };
  keywordsToCapture: CompetitiveEdgeKeywordCapture[];
  competitorWeaknessesToExploit: CompetitiveEdgeCounterFeature[];
  assetOpportunities: CompetitiveEdgeAssetOpportunity[];
  /** Optimizer-ready prose block (locale-aware). */
  optimizerBrief: string;
};
