import "server-only";

import type { ListingOptimizerInput } from "@/lib/types/listing";
import { logGenerationPipelineError } from "@/lib/monitoring/error-monitor";
import { buildBestEffortListing } from "@/lib/listing/best-effort-listing";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import {
  partialModelOutputWarning,
  finalizeWarningsPayload,
} from "@/lib/listing/listing-generation-heuristics";
import type { ListingGenerationWarning } from "@/lib/listing/listing-generation-warnings";

export type SynthesisFailSafeResult<T> =
  | { ok: true; data: T; warnings?: ReturnType<typeof finalizeWarningsPayload> }
  | { ok: false; data: ListingGenerationOutput; warnings: ReturnType<typeof finalizeWarningsPayload> };

function minimalBestEffortListing(input: ListingOptimizerInput): ListingGenerationOutput {
  const appName = (input.appName ?? "App").trim() || "App";
  const category = (input.category ?? "productivity").trim() || "productivity";
  return {
    title: appName.slice(0, 30),
    shortDescription: `${appName} — ${category} essentials`.slice(0, 80),
    fullDescription:
      `${appName} helps you get more from ${category}. ` +
      "Download today and refine this draft before publishing to Google Play.",
    keywordSuggestions: (input.targetKeywords ?? []).slice(0, 12),
    ctaSuggestions: ["Download now", "Get started free"],
    improvementTips: [
      "AI synthesis failed — this is a minimal template you can edit before publishing.",
    ],
  };
}

function resolveBestEffortListing(
  input: ListingOptimizerInput,
  lockedKeywords: string[],
  workspaceId: string,
  step: string,
): ListingGenerationOutput {
  try {
    return buildBestEffortListing(input, lockedKeywords);
  } catch (fallbackError) {
    logGenerationPipelineError(fallbackError, {
      route: "synthesis-fail-safe",
      workspaceId,
      step,
      pipeline: "legacy",
      code: "best_effort_fallback_failed",
    });
    return minimalBestEffortListing(input);
  }
}

/**
 * Fail-safe wrapper — logs synthesis failures and returns a best-effort listing instead of HTTP 500.
 */
export async function runSynthesisWithFailSafe<T extends ListingGenerationOutput>(args: {
  route: string;
  workspaceId: string;
  userId: string;
  step: string;
  pipeline: "optimized" | "legacy" | "draft";
  input: ListingOptimizerInput;
  lockedKeywords: string[];
  warnings: ListingGenerationWarning[];
  execute: () => Promise<T>;
}): Promise<SynthesisFailSafeResult<T>> {
  try {
    const data = await args.execute();
    let warnings: ReturnType<typeof finalizeWarningsPayload> | undefined;
    try {
      warnings = finalizeWarningsPayload(args.warnings);
    } catch {
      warnings = undefined;
    }
    return {
      ok: true,
      data,
      warnings,
    };
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "synthesis_fail_safe_triggered",
        workspaceId: args.workspaceId,
        step: args.step,
        message: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : undefined,
      }),
    );

    logGenerationPipelineError(error, {
      route: args.route,
      workspaceId: args.workspaceId,
      userId: args.userId,
      step: args.step,
      pipeline: args.pipeline,
      code: "synthesis_failed",
    });

    args.warnings.push(partialModelOutputWarning(args.step));
    args.warnings.push({
      code: "category_best_practices",
      severity: "warning",
      message:
        "AI synthesis failed — delivered a best-effort Core ASO template you can edit before publishing.",
    });

    return {
      ok: false,
      data: resolveBestEffortListing(
        args.input,
        args.lockedKeywords,
        args.workspaceId,
        args.step,
      ),
      warnings: finalizeWarningsPayload(args.warnings),
    };
  }
}
