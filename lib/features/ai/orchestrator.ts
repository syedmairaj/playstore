import { competitorHijackPrompt } from "@/lib/prompts/competitor-hijack";
import { listingOptimizerPrompt } from "@/lib/prompts/listing-optimizer";
import { reviewInsightsPrompt } from "@/lib/prompts/review-insights";

export type AIToolType = "listing" | "competitor" | "reviews";

export type ListingPromptContext = {
  appName: string;
  category: string;
  keywords: string[] | string;
  tone?: string;
  targetArabic?: boolean;
};

export type CompetitorPromptContext = {
  appName: string;
  competitors: string[];
};

export type ReviewsPromptContext = {
  appName: string;
  reviewsSummary: string;
};

function normalizeKeywords(keywords: string[] | string): string[] {
  if (Array.isArray(keywords)) {
    return keywords.map((k) => k.trim()).filter(Boolean);
  }
  return keywords
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function getAIPrompt(toolType: "listing", context: ListingPromptContext): string;
export function getAIPrompt(toolType: "competitor", context: CompetitorPromptContext): string;
export function getAIPrompt(toolType: "reviews", context: ReviewsPromptContext): string;
export function getAIPrompt(toolType: AIToolType, context: unknown): string {
  switch (toolType) {
    case "listing": {
      const ctx = context as ListingPromptContext;
      return listingOptimizerPrompt(
        ctx.appName,
        ctx.category,
        normalizeKeywords(ctx.keywords),
        ctx.tone ?? "Clear & Benefit-focused",
        ctx.targetArabic ?? false,
      );
    }
    case "competitor": {
      const ctx = context as CompetitorPromptContext;
      return competitorHijackPrompt(ctx.appName, ctx.competitors);
    }
    case "reviews": {
      const ctx = context as ReviewsPromptContext;
      return reviewInsightsPrompt(ctx.appName, ctx.reviewsSummary);
    }
    default: {
      const _exhaustive: never = toolType;
      throw new Error(`Unknown AI tool: ${_exhaustive}`);
    }
  }
}
