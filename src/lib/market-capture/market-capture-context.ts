import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import type { MarketCaptureContext, MarketCaptureLocale } from "@/lib/market-capture/market-capture.types";

export type BuildMarketCaptureContextInput = {
  locale: MarketCaptureLocale;
  competitorName: string;
  appName: string;
  category: string;
  appFeatures: string;
  queueItems: OptimizationQueueItem[];
  currentListing?: MarketCaptureContext["currentListing"];
  /** Optional seed keywords from synthesis merge. */
  seedKeywords?: string[];
};

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * Partition Active Context queue items into oppositional vs growth inputs.
 */
export function buildMarketCaptureContext(
  input: BuildMarketCaptureContextInput,
): MarketCaptureContext {
  const growthKeywords: string[] = [...(input.seedKeywords ?? [])];
  const oppositionalPainPoints: string[] = [];
  const reviewPraise: string[] = [];
  const featureRequests: string[] = [];

  for (const item of input.queueItems) {
    const term = item.content.trim();
    if (!term) continue;
    const category = resolveQueueItemCategory(item);

    switch (category) {
      case "tracker":
      case "opportunity":
        growthKeywords.push(term.replace(/^market_spotlight:/, ""));
        break;
      case "review":
        if (item.type === "feature_request") {
          featureRequests.push(term);
        } else {
          oppositionalPainPoints.push(term);
        }
        break;
      case "strength":
        if (item.type === "competitor_weakness") {
          oppositionalPainPoints.push(term);
        } else {
          growthKeywords.push(term);
        }
        break;
      default:
        growthKeywords.push(term);
    }
  }

  return {
    locale: input.locale,
    competitorName: input.competitorName,
    appName: input.appName,
    category: input.category,
    appFeatures: input.appFeatures,
    growthKeywords: unique(growthKeywords).slice(0, 20),
    oppositionalPainPoints: unique(oppositionalPainPoints).slice(0, 10),
    reviewPraise: unique(reviewPraise).slice(0, 5),
    featureRequests: unique(featureRequests).slice(0, 5),
    currentListing: input.currentListing,
  };
}
