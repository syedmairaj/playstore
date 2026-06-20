import type {
  ClusterSynthesisPayload,
  ActiveContextSynthesisSignal,
} from "@/lib/optimization-queue/build-active-context-synthesis";
import type { ListingOptimizerInput } from "@/lib/types/listing";

/** Hard cap on total characters for optimizer synthesis injected into prompts. */
export const OPTIMIZER_CONTEXT_MAX_CHARS = 5000;
/** Top-N market intelligence signals before generation (latency guard). */
export const OPTIMIZER_CONTEXT_MAX_SIGNALS = 5;

function signalScore(signal: ActiveContextSynthesisSignal): number {
  const impact = signal.impactPercent ?? 0;
  const conversion = signal.conversionImpactScore ?? 0;
  return impact * 10 + conversion;
}

function emptySynthesis(): ClusterSynthesisPayload {
  return { offensive: [], defensive: [], market: [] };
}

/**
 * Keep only the top N synthesis signals by impact (reviews/defensive first).
 */
export function pruneSynthesisToTopSignals(
  payload: ClusterSynthesisPayload,
  maxSignals = OPTIMIZER_CONTEXT_MAX_SIGNALS,
): ClusterSynthesisPayload {
  const ordered = [
    ...payload.defensive.map((signal) => ({ bucket: "defensive" as const, signal })),
    ...payload.market.map((signal) => ({ bucket: "market" as const, signal })),
    ...payload.offensive.map((signal) => ({ bucket: "offensive" as const, signal })),
  ].sort((a, b) => signalScore(b.signal) - signalScore(a.signal));

  const next = emptySynthesis();
  let count = 0;

  for (const row of ordered) {
    if (count >= maxSignals) break;
    if (!row.signal.label.trim()) continue;
    next[row.bucket].push(row.signal);
    count += 1;
  }

  return next;
}

/**
 * Truncate market-intelligence synthesis to a character budget (EN/AR safe).
 */
export function pruneSynthesisToCharBudget(
  payload: ClusterSynthesisPayload,
  maxChars = OPTIMIZER_CONTEXT_MAX_CHARS,
): ClusterSynthesisPayload {
  const ordered = [
    ...payload.defensive.map((signal) => ({ bucket: "defensive" as const, signal })),
    ...payload.market.map((signal) => ({ bucket: "market" as const, signal })),
    ...payload.offensive.map((signal) => ({ bucket: "offensive" as const, signal })),
  ].sort((a, b) => signalScore(b.signal) - signalScore(a.signal));

  const next = emptySynthesis();
  let used = 0;

  for (const row of ordered) {
    const label = row.signal.label.trim();
    if (!label) continue;
    if (used + label.length <= maxChars) {
      next[row.bucket].push(row.signal);
      used += label.length;
      continue;
    }
    const remaining = maxChars - used;
    if (remaining >= 24) {
      next[row.bucket].push({ ...row.signal, label: label.slice(0, remaining) });
    }
    break;
  }

  return next;
}

/**
 * Prune optimizer context before generation — top 5 signals + char budget.
 */
export function pruneContext(input: ListingOptimizerInput): ListingOptimizerInput {
  const next: ListingOptimizerInput = { ...input };

  if (input.activeContext) {
    next.activeContext = pruneSynthesisToTopSignals(
      pruneSynthesisToCharBudget(input.activeContext),
      OPTIMIZER_CONTEXT_MAX_SIGNALS,
    );
  }

  if (input.topStagedIssues && input.topStagedIssues.length > OPTIMIZER_CONTEXT_MAX_SIGNALS) {
    next.topStagedIssues = input.topStagedIssues.slice(0, OPTIMIZER_CONTEXT_MAX_SIGNALS);
  }

  if (
    input.trackedKeywordSignals &&
    input.trackedKeywordSignals.length > OPTIMIZER_CONTEXT_MAX_SIGNALS
  ) {
    next.trackedKeywordSignals = input.trackedKeywordSignals.slice(
      0,
      OPTIMIZER_CONTEXT_MAX_SIGNALS,
    );
  }

  return next;
}
