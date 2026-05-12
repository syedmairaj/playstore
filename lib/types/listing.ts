export type ToneStyle = "professional" | "friendly" | "bold" | "minimal";

export type ListingOptimizerInput = {
  appName: string;
  category: string;
  targetKeywords: string[];
  appFeatures: string;
  toneStyle: ToneStyle;
  /** When true, model should return Arabic copy for all user-visible strings. */
  targetArabic?: boolean;
  /** Optional refinement appended to the user prompt (e.g. regenerate with a new angle). */
  userInstruction?: string;
};

export type ListingOptimizerOutput = {
  title: string;
  shortDescription: string;
  fullDescription: string;
  keywordSuggestions: string[];
  ctaSuggestions: string[];
};
