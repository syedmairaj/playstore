import type { ListingOptimizerInput } from "@/lib/types/listing";
import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";

/** Vault queue items above this → prefer async full unlock (MAX_TOKENS risk). */
const HEAVY_VAULT_ITEM_COUNT = 20;

/** Staged optimization-queue items from client above this → prefer async. */
const HEAVY_CLIENT_QUEUE_ITEMS = 18;

/** Tracked keyword signals above this → prefer async. */
const HEAVY_TRACKED_KEYWORDS = 8;

/** Total active-context labels (offensive + defensive + market) above this → prefer async. */
const HEAVY_ACTIVE_CONTEXT_LABELS = 24;

export type FullUnlockAsyncPolicyInput = {
  vaultItemCount?: number | null;
  clientQueueItemCount?: number | null;
  listingInput?: Pick<
    ListingOptimizerInput,
    "trackedKeywordSignals" | "activeContext" | "targetKeywords" | "exploitTargets"
  >;
};

export type FullUnlockAsyncDecision = {
  preferAsync: boolean;
  reason: string | null;
};

function countActiveContextLabels(
  input: FullUnlockAsyncPolicyInput["listingInput"],
): number {
  const ctx = input?.activeContext;
  if (!ctx || !activeContextHasSignals(ctx)) return 0;
  return ctx.offensive.length + ctx.defensive.length + ctx.market.length;
}

/**
 * When true, `generationStep: full` should use the QStash async worker instead of
 * sync in-request execution — reduces MAX_TOKENS and Vercel timeout risk on heavy vaults.
 *
 * Override: `LISTING_FULL_FORCE_ASYNC=1` always async; `LISTING_FULL_SYNC_ALLOW=1` never async.
 */
export function shouldPreferAsyncFullUnlock(
  input: FullUnlockAsyncPolicyInput,
): FullUnlockAsyncDecision {
  if (process.env.LISTING_FULL_SYNC_ALLOW === "1") {
    return { preferAsync: false, reason: null };
  }
  if (process.env.LISTING_FULL_FORCE_ASYNC === "1") {
    return { preferAsync: true, reason: "LISTING_FULL_FORCE_ASYNC" };
  }

  const vaultItems = input.vaultItemCount ?? 0;
  if (vaultItems >= HEAVY_VAULT_ITEM_COUNT) {
    return {
      preferAsync: true,
      reason: `vault_item_count_${vaultItems}`,
    };
  }

  const clientQueue = input.clientQueueItemCount ?? 0;
  if (clientQueue >= HEAVY_CLIENT_QUEUE_ITEMS) {
    return {
      preferAsync: true,
      reason: `client_queue_items_${clientQueue}`,
    };
  }

  const tracked = input.listingInput?.trackedKeywordSignals?.length ?? 0;
  if (tracked >= HEAVY_TRACKED_KEYWORDS) {
    return {
      preferAsync: true,
      reason: `tracked_keywords_${tracked}`,
    };
  }

  const contextLabels = countActiveContextLabels(input.listingInput);
  if (contextLabels >= HEAVY_ACTIVE_CONTEXT_LABELS) {
    return {
      preferAsync: true,
      reason: `active_context_labels_${contextLabels}`,
    };
  }

  const seedKeywords = input.listingInput?.targetKeywords?.length ?? 0;
  const exploitTargets = input.listingInput?.exploitTargets?.length ?? 0;
  if (seedKeywords + exploitTargets >= 30) {
    return {
      preferAsync: true,
      reason: `keyword_payload_${seedKeywords + exploitTargets}`,
    };
  }

  return { preferAsync: false, reason: null };
}
