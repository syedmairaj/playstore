import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { readOptimizationQueue } from "@/lib/optimization-queue/optimization-queue.service";
import {
  buildOptimizedContextFromItems,
  logOptimizerSignalObserved,
  type OptimizedContextResult,
} from "@/lib/optimizer/context-adapter";

export type FetchOptimizedContextArgs = {
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
};

/**
 * Lazy-load optimizer context once per generation request.
 * Replaces push-based client routing — generate API is the sole injection point.
 */
export async function fetchOptimizedContext(
  supabase: SupabaseClient,
  args: FetchOptimizedContextArgs,
): Promise<OptimizedContextResult> {
  const queueItems = await readOptimizationQueue(
    supabase,
    args.workspaceId,
    args.locale,
    args.appId,
  );

  // Log all vault signals for observability without injecting them into prompts.
  for (const item of queueItems) {
    logOptimizerSignalObserved(item);
  }

  return buildOptimizedContextFromItems(queueItems);
}
