import type { OptimizationQueueSynthesisPayload } from "@/lib/optimization-queue";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";

export type GenerateOptimizedListingSuccess = {
  ok: true;
  data: ListingGenerationOutput;
  meta?: {
    model?: string;
    promptVersion?: string;
    persisted?: boolean;
    generationId?: string;
    savedAt?: string;
    asoScorePartial?: boolean;
    retried?: boolean;
    shortDescriptionClamped?: boolean;
    quality_status?: "All signals active. Synthesis mode: Maximum.";
    quality_warning?: "Listing generated using partial data. Add Review, Market, or Competitor signals for a more comprehensive strategy.";
  };
};

export type GenerateOptimizedListingError = {
  ok: false;
  status: number;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    remaining?: number;
    required?: number;
  };
};

export type GenerateOptimizedListingResult =
  | GenerateOptimizedListingSuccess
  | GenerateOptimizedListingError;

export type GenerateOptimizedListingInput = {
  workspaceId: string;
  appId?: string;
  appName: string;
  category: string;
  targetKeywords: string;
  appFeatures: string;
  toneStyle: string;
  targetArabic: boolean;
  userInstruction?: string;
  queueSynthesis: OptimizationQueueSynthesisPayload;
};

/**
 * Client service — POST /api/listings/generate.
 * Validation/guardrails run before this is called.
 */
export async function generateOptimizedListing(
  input: GenerateOptimizedListingInput,
): Promise<GenerateOptimizedListingResult> {
  const { queueSynthesis } = input;
  const effectiveInstruction = input.userInstruction?.trim();

  const res = await fetch("/api/listings/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      ...(input.appId ? { appId: input.appId } : {}),
      appName: input.appName,
      category: input.category,
      targetKeywords: input.targetKeywords,
      appFeatures: input.appFeatures,
      toneStyle: input.toneStyle,
      targetArabic: input.targetArabic,
      ...(effectiveInstruction ? { userInstruction: effectiveInstruction } : {}),
      activeContext: queueSynthesis.activeContext,
      ...(queueSynthesis.trackedKeywordSignals.length > 0
        ? { trackedKeywordSignals: queueSynthesis.trackedKeywordSignals }
        : {}),
      strategyMode: queueSynthesis.strategyMode,
      ...(queueSynthesis.topStagedIssues.length > 0
        ? { topStagedIssues: queueSynthesis.topStagedIssues }
        : {}),
      activeSignalTypes: queueSynthesis.activeSignalTypes,
    }),
  });

  const json = (await res.json()) as GenerateOptimizedListingSuccess | {
    ok: false;
    error: GenerateOptimizedListingError["error"];
  };

  if (!res.ok || !json.ok) {
    return {
      ok: false,
      status: res.status,
      error: json.ok === false ? json.error : { message: "Generation failed." },
    };
  }

  return json;
}
