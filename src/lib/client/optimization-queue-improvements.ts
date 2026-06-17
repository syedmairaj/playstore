import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import {
  readGrowthStrategyTag,
  readImpactPercent,
} from "@/lib/review-insights/growth-strategy-tags";

/** Map optimization queue rows → listing improvement pills (with ASO Growth metadata). */
export function optimizationQueueItemsToImprovements(
  items: OptimizationQueueItem[],
): ListingImprovementItem[] {
  return items.map((item) => {
    const meta = item.metadata ?? {};
    const category = resolveQueueItemCategory(item);
    const growthStrategyTag =
      category === "review" ? readGrowthStrategyTag(meta) : undefined;
    const impactPercent =
      category === "review" ? readImpactPercent(meta) : undefined;

    let sentimentTag = item.content;
    if (item.type === "market_keyword") {
      sentimentTag = item.content.startsWith("market_spotlight:")
        ? item.content
        : `market_spotlight:${item.content}`;
    }

    const packageName =
      typeof meta.package_name === "string" ? meta.package_name : null;

    return {
      id: item.id,
      reviewId: item.id,
      reviewText: String(meta.description ?? item.content),
      title: item.content,
      userName: "",
      score: 0,
      sentimentTag,
      appId: null,
      packageName,
      isUtilized: false,
      createdAt: item.stagedAt,
      growthStrategyTag,
      impactPercent,
    };
  });
}
