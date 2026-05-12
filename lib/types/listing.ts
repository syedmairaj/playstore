export type ToneStyle = "professional" | "friendly" | "bold" | "minimal";

export type ListingOptimizerInput = {
  appName: string;
  category: string;
  targetKeywords: string[];
  appFeatures: string;
  toneStyle: ToneStyle;
  /** When true, model should return Arabic copy for all user-visible strings. */
  targetArabic?: boolean;
};

export type ListingOptimizerOutput = {
  title: string;
  shortDescription: string;
  fullDescription: string;
  keywordSuggestions: string[];
  ctaSuggestions: string[];
};
