import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import type { ContextPackageV1 } from "@/lib/listing/context-package.types";
import { readContextPackage } from "@/lib/listing/context-package-store";
import { useOptimizedPipeline } from "@/lib/listing/listing-generation-adapter";
import { scheduleSignalCompression } from "@/lib/listing/signal-compressor";
import type { OptimizedContextResult } from "@/lib/optimizer/context-adapter";
import { applyOptimizerContextGate } from "@/lib/optimizer/apply-optimizer-context-gate";
import type { ListingOptimizerInput } from "@/lib/types/listing";

export type GenerationContextResolution = {
  pipeline: "optimized" | "legacy" | "draft";
  contextPackage: ContextPackageV1 | null;
  optimizedContext: OptimizedContextResult | null;
  gatedListingInput: ListingOptimizerInput & {
    activeContext?: import("@/lib/optimization-queue/build-active-context-synthesis").ClusterSynthesisPayload;
    trackedKeywordSignals?: ListingOptimizerInput["trackedKeywordSignals"];
    exploitTargets?: string[];
    topStagedIssues?: ListingOptimizerInput["topStagedIssues"];
    activeSignalTypes?: Array<"reviews" | "market" | "competitors" | "keywords">;
  };
};

type ResolveArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
  listingInput: ListingOptimizerInput & {
    activeContext?: ListingOptimizerInput["activeContext"];
    trackedKeywordSignals?: ListingOptimizerInput["trackedKeywordSignals"];
    exploitTargets?: string[];
    topStagedIssues?: ListingOptimizerInput["topStagedIssues"];
    activeSignalTypes?: ListingOptimizerInput["activeSignalTypes"];
  };
  includeOptimizerContext: boolean;
  isDraft: boolean;
  isFinalize: boolean;
};

/**
 * Resolve optimizer context for generation.
 * - `isDraft` → no Redis / vault reads (Core ASO template path).
 * - Optimized pipeline + finalize/full → Redis Context Package ONLY (no raw vault fetch).
 * - Legacy → existing vault fetch via applyOptimizerContextGate caller.
 */
export async function resolvePrecomputedGenerationContext(
  args: ResolveArgs & {
    fetchedLegacyContext: OptimizedContextResult | null;
  },
): Promise<GenerationContextResolution> {
  if (args.isDraft) {
    return {
      pipeline: "draft",
      contextPackage: null,
      optimizedContext: null,
      gatedListingInput: applyOptimizerContextGate(
        args.listingInput,
        false,
        null,
      ),
    };
  }

  if (args.includeOptimizerContext && useOptimizedPipeline()) {
    const contextPackage = await readContextPackage({
      workspaceId: args.workspaceId,
      locale: args.locale,
      appId: args.appId,
    });

    if (!contextPackage) {
      scheduleSignalCompression({
        supabase: args.supabase,
        workspaceId: args.workspaceId,
        locale: args.locale,
        appId: args.appId,
      });
    }

    if (args.isFinalize && !contextPackage) {
      throw new ContextPackageUnavailableError();
    }

    const optimizedContext: OptimizedContextResult | null = contextPackage
      ? {
          items: [],
          synthesis: contextPackage.synthesis,
          trackedKeywordSignals: contextPackage.trackedKeywordSignals,
          topStagedIssues: contextPackage.topStagedIssues,
          activeSignalTypes: contextPackage.activeSignalTypes,
        }
      : null;

    return {
      pipeline: contextPackage ? "optimized" : "legacy",
      contextPackage,
      optimizedContext,
      gatedListingInput: applyOptimizerContextGate(
        args.listingInput,
        args.includeOptimizerContext,
        optimizedContext,
      ),
    };
  }

  return {
    pipeline: "legacy",
    contextPackage: null,
    optimizedContext: args.fetchedLegacyContext,
    gatedListingInput: applyOptimizerContextGate(
      args.listingInput,
      args.includeOptimizerContext,
      args.fetchedLegacyContext,
    ),
  };
}

export class ContextPackageUnavailableError extends Error {
  readonly code = "context_package_unavailable" as const;

  constructor(
    message = "Context Package is not ready. Stage signals in Keyword Tracker — compression runs in the background.",
  ) {
    super(message);
    this.name = "ContextPackageUnavailableError";
  }
}
