import type { ClusterSynthesisPayload } from "@/lib/optimization-queue/build-active-context-synthesis";
import type { OptimizationQueueSynthesisPayload } from "@/lib/optimization-queue/optimization-queue.types";

function clampPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function sanitizeActiveContextSignal(
  signal: ClusterSynthesisPayload["offensive"][number],
): ClusterSynthesisPayload["offensive"][number] {
  const label = signal.label.trim().slice(0, 500);
  return {
    ...signal,
    label,
    ...(signal.impactPercent != null
      ? { impactPercent: clampPercent(signal.impactPercent) }
      : {}),
    ...(signal.conversionImpactScore != null
      ? { conversionImpactScore: clampPercent(signal.conversionImpactScore) }
      : {}),
  };
}

export function sanitizeActiveContextForGenerate(
  activeContext: ClusterSynthesisPayload,
): ClusterSynthesisPayload {
  return {
    offensive: activeContext.offensive.map(sanitizeActiveContextSignal),
    defensive: activeContext.defensive.map(sanitizeActiveContextSignal),
    market: activeContext.market.map(sanitizeActiveContextSignal),
  };
}

export function sanitizeTrackedKeywordSignalsForGenerate(
  signals: OptimizationQueueSynthesisPayload["trackedKeywordSignals"],
): Array<{
  keyword: string;
  confidence: number;
  difficulty?: number;
  searchVolume?: number;
  liveRankSummary?: string;
}> {
  return signals.map((signal) => ({
    keyword: signal.keyword.trim(),
    confidence: clampConfidence(signal.confidence),
    ...(typeof signal.difficulty === "number" && Number.isFinite(signal.difficulty)
      ? { difficulty: Math.min(10, Math.max(0, signal.difficulty)) }
      : {}),
    ...(typeof signal.searchVolume === "number" && Number.isFinite(signal.searchVolume)
      ? { searchVolume: Math.max(0, signal.searchVolume) }
      : {}),
    ...(signal.liveRankSummary?.trim()
      ? { liveRankSummary: signal.liveRankSummary.trim().slice(0, 120) }
      : {}),
  }));
}
