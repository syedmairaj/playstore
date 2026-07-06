import type {
  ListingOptimizerInput,
  TrackedKeywordSignalInput,
} from "@/lib/types/listing";

/** Default confidence for keywords supplied only via `targetKeywords` (no vault metadata). */
export const REQUEST_KEYWORD_SIGNAL_CONFIDENCE = 72;

export function mapTargetKeywordsToTrackedSignals(
  targetKeywords: string[],
  options?: { defaultConfidence?: number },
): TrackedKeywordSignalInput[] {
  const confidence = options?.defaultConfidence ?? REQUEST_KEYWORD_SIGNAL_CONFIDENCE;
  return targetKeywords
    .map((kw) => kw.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((keyword) => ({ keyword, confidence }));
}

function pushSignals(
  merged: Map<string, TrackedKeywordSignalInput>,
  signals: TrackedKeywordSignalInput[] | undefined,
): void {
  for (const signal of signals ?? []) {
    const keyword = signal.keyword?.trim();
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (merged.has(key)) continue;
    merged.set(key, {
      ...signal,
      keyword,
      confidence:
        typeof signal.confidence === "number" && Number.isFinite(signal.confidence)
          ? signal.confidence
          : REQUEST_KEYWORD_SIGNAL_CONFIDENCE,
    });
  }
}

/**
 * Merge vault, request-body, and `targetKeywords` into tracked keyword signals.
 * Vault signals win on duplicates; request keywords fill gaps when vault is empty.
 */
export function mergeTrackedKeywordSignals(sources: {
  vault?: TrackedKeywordSignalInput[];
  body?: TrackedKeywordSignalInput[];
  targetKeywords?: string[];
}): TrackedKeywordSignalInput[] {
  const merged = new Map<string, TrackedKeywordSignalInput>();
  pushSignals(merged, sources.vault);
  pushSignals(merged, sources.body);
  pushSignals(
    merged,
    mapTargetKeywordsToTrackedSignals(sources.targetKeywords ?? []),
  );
  return Array.from(merged.values()).slice(0, 30);
}

export function enrichListingInputWithRequestKeywords<
  T extends Pick<ListingOptimizerInput, "targetKeywords" | "trackedKeywordSignals">,
>(input: T): T & { trackedKeywordSignals: TrackedKeywordSignalInput[] } {
  const trackedKeywordSignals = mergeTrackedKeywordSignals({
    body: input.trackedKeywordSignals,
    targetKeywords: input.targetKeywords,
  });
  return { ...input, trackedKeywordSignals };
}

/** Vault row count for audits — include request keywords not yet staged in vault. */
export function resolveEffectiveVaultItemCount(args: {
  vaultItemCount: number;
  requestKeywordCount: number;
  clientQueueItemCount?: number;
}): number {
  return Math.max(
    args.vaultItemCount,
    args.requestKeywordCount,
    args.clientQueueItemCount ?? 0,
  );
}
