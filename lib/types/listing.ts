import type { ListingGenerationOutput } from "@/lib/validation/listing-output";

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
  /**
   * Competitor pain-point targets staged from the Active Optimization Queue.
   * When present the prompt builder injects a strategic displacement campaign block
   * that positions the app against each identified competitor weakness.
   */
  exploitTargets?: string[];
};

/** Gemini listing JSON shape (includes optional Certified ASO Score metadata). */
export type ListingOptimizerOutput = ListingGenerationOutput;
