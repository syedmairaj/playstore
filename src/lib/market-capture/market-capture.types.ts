/** Market Capture — dual-version listing proposals with human-in-the-loop staging. */

export type MarketCaptureLocale = "en" | "ar";

export type MarketCaptureStrategy = "oppositional" | "growth";

export type MarketCaptureListingField =
  | "title"
  | "shortDescription"
  | "fullDescription"
  | "whatsNew";

export type StagedChangeStatus = "pending" | "approved" | "rejected";

export type MarketCaptureFieldProposal = {
  value: string;
  rationale: string;
  charCount: number;
  /** Estimated keyword density for longDescription (2–3% target). */
  keywordDensityPercent?: number;
};

export type MarketCaptureVersionProposal = {
  strategy: MarketCaptureStrategy;
  label: string;
  title: MarketCaptureFieldProposal;
  shortDescription: MarketCaptureFieldProposal;
  fullDescription: MarketCaptureFieldProposal;
  whatsNew?: MarketCaptureFieldProposal;
};

export type MarketCaptureStagedChange = {
  id: string;
  field: MarketCaptureListingField;
  version: "A" | "B";
  strategy: MarketCaptureStrategy;
  proposedValue: string;
  currentValue?: string;
  rationale: string;
  charCount: number;
  keywordDensityPercent?: number;
  status: StagedChangeStatus;
};

export type MarketCaptureReport = {
  locale: MarketCaptureLocale;
  competitorName: string;
  versionA: MarketCaptureVersionProposal;
  versionB: MarketCaptureVersionProposal;
  stagedChanges: MarketCaptureStagedChange[];
  keywordsToCapture: string[];
  competitorPainPoints: string[];
  generatedAt: string;
};

export type MarketCaptureContext = {
  locale: MarketCaptureLocale;
  competitorName: string;
  appName: string;
  category: string;
  appFeatures: string;
  /** High-intent keywords from Keyword Tracker + Market Intel. */
  growthKeywords: string[];
  /** Review pain points + competitor weaknesses for Version A. */
  oppositionalPainPoints: string[];
  /** Praise + feature requests to mirror or preempt. */
  reviewPraise: string[];
  featureRequests: string[];
  currentListing?: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
  };
};
