import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { readOptimizationQueue } from "@/lib/optimization-queue/optimization-queue.service";
import {
  buildOptimizedContextFromItems,
  logOptimizerSignalObserved,
  type OptimizedContextResult,
} from "@/lib/optimizer/context-adapter";
import {
  validateSynthesisPayloadAfterVault,
} from "@/lib/optimization-queue/vault-synthesis-preflight";
import type { ListingGenerationWarning } from "@/lib/listing/listing-generation-warnings";

export type FetchOptimizedContextArgs = {
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
};

export type FetchOptimizedContextResult = OptimizedContextResult & {
  vaultWarnings: ListingGenerationWarning[];
};

/**
 * Lazy-load optimizer context once per generation request.
 * Replaces push-based client routing — generate API is the sole injection point.
 */
export async function fetchOptimizedContext(
  supabase: SupabaseClient,
  args: FetchOptimizedContextArgs,
): Promise<FetchOptimizedContextResult> {
  const queueItems = await readOptimizationQueue(
    supabase,
    args.workspaceId,
    args.locale,
    args.appId,
  );

  const validated = validateSynthesisPayloadAfterVault(queueItems, {
    scope: "server",
    workspaceId: args.workspaceId,
    locale: args.locale,
    appId: args.appId,
  });

  // Log all vault signals for observability without injecting them into prompts.
  for (const item of queueItems) {
    logOptimizerSignalObserved(item);
  }

  const optimized = buildOptimizedContextFromItems(queueItems);

  return {
    ...optimized,
    vaultWarnings: validated.warnings,
  };
}
