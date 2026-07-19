/**
 * Build Market Discovery Target Keywords / App Features text from Active Context
 * (optimization queue pillars). Used by Auto-Fill (research) mode so queued Spy
 * gaps, market intel, and review insights can unlock Build listing draft without
 * a separate localStorage inject from Competitor Spy navigation.
 */

import { mergeOptimizerKeywordText } from "@/lib/client/listing-optimizer-keywords-prefill";
import type { PartitionedActiveContextQueue } from "@/lib/client/active-context-from-queue";

export type DiscoveryFieldsFromActiveContext = {
  keywords: string;
  features: string;
};

type PartitionSlice = Pick<
  PartitionedActiveContextQueue,
  "competitorSpyPills" | "marketIntelPills" | "reviewPills" | "trackerItems"
>;

const MAX_FEATURE_LINES = 12;

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Maps staged Active Context pillars into the two Market Discovery textareas.
 * Keywords prefer short ASO terms; features become consultant-style bullets.
 */
export function buildDiscoveryFieldsFromActiveContext(
  partition: PartitionSlice,
): DiscoveryFieldsFromActiveContext {
  const keywordSeeds: string[] = [
    ...partition.trackerItems.map((item) => item.content),
    ...partition.competitorSpyPills.map((pill) => pill.label),
    ...partition.marketIntelPills.map((pill) => pill.label),
  ];

  const keywords = mergeOptimizerKeywordText("", keywordSeeds);

  const featureLines = dedupeLines([
    ...partition.competitorSpyPills.map(
      (pill) => `Competitive opportunity: ${pill.label}`,
    ),
    ...partition.reviewPills.map((pill) => `User insight: ${pill.label}`),
    ...partition.marketIntelPills.map(
      (pill) => `Market demand: ${pill.label}`,
    ),
  ]).slice(0, MAX_FEATURE_LINES);

  return {
    keywords,
    features: featureLines.join("\n"),
  };
}

export function hasDiscoverableActiveContext(
  partition: PartitionSlice,
): boolean {
  return (
    partition.trackerItems.length > 0 ||
    partition.competitorSpyPills.length > 0 ||
    partition.marketIntelPills.length > 0 ||
    partition.reviewPills.length > 0
  );
}
