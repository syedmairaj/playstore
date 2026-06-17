import type {
  ChartAppForThreats,
  CompetitorThreatSignal,
  GrowthKeywordSignal,
  LegacyKeywordSpotlightResult,
  MarketIntelContext,
  MarketIntelligenceReport,
  UxSentimentInsightKind,
  UxSentimentInsightSignal,
} from "@/lib/market/market-intel-signal-types";

const PRIORITY_SEARCH_WEIGHT = 0.45;
const PRIORITY_CVR_WEIGHT = 0.55;

export function clampScore(value: unknown, fallback = 50): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computePriorityScore(
  searchVolumeScore: number,
  conversionImpactScore: number,
): number {
  const score =
    searchVolumeScore * PRIORITY_SEARCH_WEIGHT +
    conversionImpactScore * PRIORITY_CVR_WEIGHT;
  return Math.round(score * 10) / 10;
}

export function normMarketIntelTerm(value: string): string {
  return value.replace(/^market_spotlight:/, "").trim().toLowerCase();
}

function slugId(prefix: string, value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${prefix}:${slug || "item"}`;
}

export function sortByMarketPriority<T extends { priorityScore: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => b.priorityScore - a.priorityScore);
}

type RawModelGrowthKeyword = {
  term?: string;
  searchVolumeScore?: number;
  conversionImpactScore?: number;
};

type RawModelCompetitorThreat = {
  term?: string;
  competitorTitle?: string;
  competitorAppId?: string | null;
  threatScore?: number;
  searchVolumeScore?: number;
  conversionImpactScore?: number;
};

type RawModelUxInsight = {
  headline?: string;
  body?: string;
  insightKind?: string;
};

export type RawCategorizedSpotlightModel = {
  growthKeywords?: RawModelGrowthKeyword[];
  competitorThreats?: RawModelCompetitorThreat[];
  uxSentimentInsights?: RawModelUxInsight[];
};

function normalizeInsightKind(raw: unknown): UxSentimentInsightKind {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "aso_recommendation" || value === "sentiment_theme") {
    return value;
  }
  return "category_narrative";
}

function buildGrowthKeywords(
  raw: RawModelGrowthKeyword[] | undefined,
): GrowthKeywordSignal[] {
  const seen = new Set<string>();
  const items: GrowthKeywordSignal[] = [];

  for (const [index, row] of (raw ?? []).entries()) {
    const term = typeof row.term === "string" ? row.term.trim() : "";
    if (!term) continue;
    const norm = normMarketIntelTerm(term);
    if (seen.has(norm)) continue;
    seen.add(norm);

    const searchVolumeScore = clampScore(row.searchVolumeScore, 70 - index * 3);
    const conversionImpactScore = clampScore(
      row.conversionImpactScore,
      75 - index * 2,
    );

    items.push({
      type: "growth_keyword",
      id: slugId("gk", term),
      term,
      searchVolumeScore,
      conversionImpactScore,
      priorityScore: computePriorityScore(searchVolumeScore, conversionImpactScore),
      frequencyRank: index + 1,
    });
  }

  return sortByMarketPriority(items);
}

function enrichThreatsFromChart(
  threats: CompetitorThreatSignal[],
  chartApps: ChartAppForThreats[],
  ownAppId?: string | null,
): CompetitorThreatSignal[] {
  const titleByNorm = new Map<string, ChartAppForThreats>();
  for (const app of chartApps) {
    if (ownAppId && app.appId === ownAppId) continue;
    titleByNorm.set(app.title.trim().toLowerCase(), app);
  }

  return threats.map((threat) => {
    const match =
      (threat.competitorAppId
        ? chartApps.find((a) => a.appId === threat.competitorAppId)
        : null) ??
      titleByNorm.get(threat.competitorTitle.trim().toLowerCase()) ??
      null;

    if (!match) return threat;

    return {
      ...threat,
      competitorAppId: match.appId,
      competitorTitle: match.title,
      chartRank: match.rank,
      threatScore: clampScore(
        threat.threatScore + Math.max(0, 12 - match.rank),
        threat.threatScore,
      ),
      priorityScore: computePriorityScore(
        threat.searchVolumeScore,
        threat.conversionImpactScore,
      ),
    };
  });
}

function buildCompetitorThreats(
  raw: RawModelCompetitorThreat[] | undefined,
  chartApps: ChartAppForThreats[],
  ownAppId?: string | null,
): CompetitorThreatSignal[] {
  const seen = new Set<string>();
  const items: CompetitorThreatSignal[] = [];

  for (const row of raw ?? []) {
    const term = typeof row.term === "string" ? row.term.trim() : "";
    const competitorTitle =
      typeof row.competitorTitle === "string" ? row.competitorTitle.trim() : "";
    if (!term || !competitorTitle) continue;

    const norm = `${normMarketIntelTerm(term)}::${competitorTitle.toLowerCase()}`;
    if (seen.has(norm)) continue;
    seen.add(norm);

    const searchVolumeScore = clampScore(row.searchVolumeScore, 55);
    const conversionImpactScore = clampScore(row.conversionImpactScore, 60);
    const threatScore = clampScore(row.threatScore, 65);

    items.push({
      type: "competitor_threat",
      id: slugId("ct", `${term}-${competitorTitle}`),
      term,
      competitorAppId:
        typeof row.competitorAppId === "string" ? row.competitorAppId : null,
      competitorTitle,
      chartRank: null,
      threatScore,
      searchVolumeScore,
      conversionImpactScore,
      priorityScore: computePriorityScore(searchVolumeScore, conversionImpactScore),
    });
  }

  const enriched = enrichThreatsFromChart(items, chartApps, ownAppId);
  return sortByMarketPriority(enriched);
}

function buildUxInsights(
  raw: RawModelUxInsight[] | undefined,
  ctx: MarketIntelContext,
  capturedAt: string,
): UxSentimentInsightSignal[] {
  const items: UxSentimentInsightSignal[] = [];

  for (const row of raw ?? []) {
    const headline = typeof row.headline === "string" ? row.headline.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!headline || !body) continue;

    items.push({
      type: "ux_sentiment_insight",
      id: slugId("ux", headline),
      headline,
      body,
      insightKind: normalizeInsightKind(row.insightKind),
      category: ctx.category,
      country: ctx.country,
      capturedAt,
    });
  }

  return items;
}

/** Convert legacy flat spotlight into categorized report (client cache migration). */
export function migrateLegacySpotlight(
  legacy: LegacyKeywordSpotlightResult,
  ctx: MarketIntelContext,
  chartApps: ChartAppForThreats[] = [],
): MarketIntelligenceReport {
  const capturedAt = new Date().toISOString();

  const growthKeywords = buildGrowthKeywords(
    legacy.trendingKeywords.map((term, index) => ({
      term,
      searchVolumeScore: 85 - index * 4,
      conversionImpactScore: 80 - index * 3,
    })),
  );

  const uxSentimentInsights: UxSentimentInsightSignal[] = [];
  if (legacy.narrative?.trim()) {
    uxSentimentInsights.push({
      type: "ux_sentiment_insight",
      id: slugId("ux", "category-narrative"),
      headline: "Category narrative",
      body: legacy.narrative.trim(),
      insightKind: "category_narrative",
      category: ctx.category,
      country: ctx.country,
      capturedAt,
    });
  }
  if (legacy.asoTip?.trim()) {
    uxSentimentInsights.push({
      type: "ux_sentiment_insight",
      id: slugId("ux", "aso-tip"),
      headline: "ASO recommendation",
      body: legacy.asoTip.trim(),
      insightKind: "aso_recommendation",
      category: ctx.category,
      country: ctx.country,
      capturedAt,
    });
  }

  return {
    version: 2,
    growthKeywords,
    competitorThreats: buildCompetitorThreats([], chartApps, ctx.ownAppId),
    uxSentimentInsights,
  };
}

export function buildMarketIntelligenceReport(
  model: RawCategorizedSpotlightModel,
  ctx: MarketIntelContext,
  chartApps: ChartAppForThreats[],
): MarketIntelligenceReport {
  const capturedAt = new Date().toISOString();

  return {
    version: 2,
    growthKeywords: buildGrowthKeywords(model.growthKeywords),
    competitorThreats: buildCompetitorThreats(
      model.competitorThreats,
      chartApps,
      ctx.ownAppId,
    ),
    uxSentimentInsights: buildUxInsights(
      model.uxSentimentInsights,
      ctx,
      capturedAt,
    ),
  };
}

export function isLegacySpotlightPayload(
  value: unknown,
): value is LegacyKeywordSpotlightResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    Array.isArray(row.trendingKeywords) &&
    typeof row.narrative === "string" &&
    !Array.isArray(row.growthKeywords)
  );
}

export function isMarketIntelligenceReport(
  value: unknown,
): value is MarketIntelligenceReport {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.version === 2 &&
    Array.isArray(row.growthKeywords) &&
    Array.isArray(row.competitorThreats) &&
    Array.isArray(row.uxSentimentInsights)
  );
}

export function coerceMarketIntelligenceReport(
  value: unknown,
  ctx: MarketIntelContext,
  chartApps: ChartAppForThreats[] = [],
): MarketIntelligenceReport | null {
  if (isMarketIntelligenceReport(value)) {
    return {
      version: 2,
      growthKeywords: sortByMarketPriority(value.growthKeywords),
      competitorThreats: sortByMarketPriority(value.competitorThreats),
      uxSentimentInsights: value.uxSentimentInsights,
    };
  }
  if (isLegacySpotlightPayload(value)) {
    return migrateLegacySpotlight(value, ctx, chartApps);
  }
  return null;
}
