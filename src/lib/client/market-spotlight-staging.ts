import { enrichStagingVaultMetadata } from "@/lib/staging-vault/staging-vault-metadata";
import type { AddOptimizationQueueInput, OptimizationQueueItem } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import type { CompetitorThreatSignal, GrowthKeywordSignal } from "@/lib/market/market-intel-signal-types";
import { normMarketIntelTerm } from "@/lib/market/categorize-market-intel";

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
      signalCluster: "MARKET_INTEL" as const,
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
          market_intel_signal_type: "growth_keyword",
        },
      }),
    }));
}

/** Map competitor threat signals → optimization queue inputs. */
export function marketThreatsToQueueInputs(
  threats: CompetitorThreatSignal[],
  ctx: MarketSpotlightContext,
  locale: OptimizationQueueLocale,
): AddOptimizationQueueInput[] {
  const dataOrigin = buildMarketSpotlightDataOrigin(ctx);
  const spotlightId = dataOrigin.spotlight_id;

  return threats.map((threat) => ({
    type: "keyword_gap" as const,
    category: "opportunity" as const,
    content: threat.term,
    source: "market_intel" as const,
    sourceContext: "competitor_threat",
    sourceContextId: spotlightId,
    signalCluster: "MARKET_INTEL" as const,
    metadata: enrichStagingVaultMetadata({
      signalType: "keyword_gap",
      source: "market_intel",
      sourceContext: "competitor_threat",
      originModule: "market_intel",
      activeContextSection: "opportunity",
      userSelected: true,
      confidenceScore: 0.8,
      metadata: {
        locale,
        data_origin: dataOrigin,
        from_keyword_spotlight: true,
        market_intel_signal_type: "competitor_threat",
        competitor_title: threat.competitorTitle,
        competitor_app_id: threat.competitorAppId,
        chart_rank: threat.chartRank,
        threat_score: threat.threatScore,
      },
    }),
  }));
}

export function growthKeywordStageKey(signal: GrowthKeywordSignal): string {
  return normMarketIntelTerm(signal.term);
}

export function competitorThreatStageKey(signal: CompetitorThreatSignal): string {
  return `threat:${normMarketIntelTerm(signal.term)}::${signal.competitorTitle.trim().toLowerCase()}`;
}

export function normSpotlightKeyword(value: string): string {
  return normMarketIntelTerm(value);
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

export function collectStagedMarketIntelKeys(
  queue: OptimizationQueueItem[],
): Set<string> {
  const staged = new Set<string>();
  for (const item of queue) {
    if (item.source !== "market_intel") continue;
    const meta = item.metadata ?? {};
    const signalType = String(meta.market_intel_signal_type ?? "growth_keyword");
    const term = item.content.replace(/^market_spotlight:/, "").trim();
    if (!term) continue;

    if (signalType === "competitor_threat") {
      const competitorTitle =
        typeof meta.competitor_title === "string" ? meta.competitor_title : "";
      staged.add(`threat:${normMarketIntelTerm(term)}::${competitorTitle.trim().toLowerCase()}`);
    } else {
      staged.add(normMarketIntelTerm(term));
    }
  }
  return staged;
}

/** @deprecated Use collectStagedMarketIntelKeys */
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
