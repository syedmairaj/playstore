import { enrichStagingVaultMetadata } from "@/lib/staging-vault/staging-vault-metadata";
import type { AddOptimizationQueueInput, OptimizationQueueItem } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

export type MarketSpotlightContext = {
  category: string;
  categoryLabel: string;
  country: string;
  countryLabel: string;
};

export type MarketSpotlightDataOrigin = {
  module: "market_intel";
  report_type: "keyword_spotlight";
  category: string;
  category_label: string;
  country: string;
  country_label: string;
  spotlight_id: string;
};

export function buildSpotlightContextId(ctx: Pick<MarketSpotlightContext, "category" | "country">): string {
  return `${ctx.category}:${ctx.country}`;
}

export function buildMarketSpotlightDataOrigin(
  ctx: MarketSpotlightContext,
): MarketSpotlightDataOrigin {
  return {
    module: "market_intel",
    report_type: "keyword_spotlight",
    category: ctx.category,
    category_label: ctx.categoryLabel,
    country: ctx.country,
    country_label: ctx.countryLabel,
    spotlight_id: buildSpotlightContextId(ctx),
  };
}

/** Map curated spotlight keywords → optimization queue inputs (Active Context SSOT). */
export function marketSpotlightToQueueInputs(
  keywords: string[],
  ctx: MarketSpotlightContext,
  locale: OptimizationQueueLocale,
): AddOptimizationQueueInput[] {
  const dataOrigin = buildMarketSpotlightDataOrigin(ctx);
  const spotlightId = dataOrigin.spotlight_id;

  return keywords
    .map((kw) => kw.trim())
    .filter(Boolean)
    .map((content) => ({
      type: "keyword_gap" as const,
      category: "opportunity" as const,
      content,
      source: "market_intel" as const,
      sourceContext: "keyword_spotlight",
      sourceContextId: spotlightId,
      metadata: enrichStagingVaultMetadata({
        signalType: "keyword_gap",
        source: "market_intel",
        sourceContext: "keyword_spotlight",
        originModule: "market_intel",
        activeContextSection: "opportunity",
        userSelected: true,
        confidenceScore: 0.85,
        metadata: {
          locale,
          data_origin: dataOrigin,
          from_keyword_spotlight: true,
        },
      }),
    }));
}

export function normSpotlightKeyword(value: string): string {
  return value.replace(/^market_spotlight:/, "").trim().toLowerCase();
}

export function isMarketSpotlightKeywordQueued(
  keyword: string,
  queue: OptimizationQueueItem[],
): boolean {
  const norm = normSpotlightKeyword(keyword);
  return queue.some(
    (item) =>
      item.source === "market_intel" &&
      normSpotlightKeyword(item.content) === norm,
  );
}

export function collectStagedSpotlightKeywords(
  queue: OptimizationQueueItem[],
): Set<string> {
  const staged = new Set<string>();
  for (const item of queue) {
    if (item.source !== "market_intel") continue;
    const term = item.content.replace(/^market_spotlight:/, "").trim();
    if (term) staged.add(term);
  }
  return staged;
}

export function formatMarketDataOriginTooltip(
  dataOrigin: MarketSpotlightDataOrigin | Record<string, unknown> | undefined,
  locale: "en" | "ar",
): string | null {
  if (!dataOrigin || typeof dataOrigin !== "object") return null;

  const categoryLabel =
    typeof dataOrigin.category_label === "string"
      ? dataOrigin.category_label
      : typeof dataOrigin.category === "string"
        ? dataOrigin.category
        : null;
  const countryLabel =
    typeof dataOrigin.country_label === "string"
      ? dataOrigin.country_label
      : typeof dataOrigin.country === "string"
        ? dataOrigin.country.toUpperCase()
        : null;

  if (!categoryLabel && !countryLabel) return null;

  if (locale === "ar") {
    const parts = ["مصدر: تحليل الكلمات الرائجة بالذكاء الاصطناعي"];
    if (categoryLabel) parts.push(`الفئة: ${categoryLabel}`);
    if (countryLabel) parts.push(`السوق: ${countryLabel}`);
    return parts.join(" · ");
  }

  const parts = ["Source: AI Keyword Spotlight trend analysis"];
  if (categoryLabel) parts.push(`Category: ${categoryLabel}`);
  if (countryLabel) parts.push(`Market: ${countryLabel}`);
  return parts.join(" · ");
}
