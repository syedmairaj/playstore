import { parseKeyword, type KeywordCategory } from "@/components/listing/optimizer/keyword-strategy-panel";

export type DiscoverySuggestionCategory =
  | KeywordCategory
  | "brand"
  | "opportunity";

export type DiscoverySuggestionSource =
  | "ai_listing"
  | "brand_heuristic"
  | "category_heuristic"
  | "name_expansion";

export type DiscoveryKeywordSuggestion = {
  keyword: string;
  raw: string;
  category: DiscoverySuggestionCategory;
  reasonKey: string;
  reasonParams?: Record<string, string | number>;
  source: DiscoverySuggestionSource;
  /** Higher = shown first */
  priority: number;
};

export type DiscoveryAppContext = {
  appId: string;
  appName: string;
  category?: string | null;
  shortDescription?: string | null;
};

const MAX_SUGGESTIONS = 10;

const CATEGORY_LONGTAIL: Record<string, string[]> = {
  health: [
    "nutrition tracking app",
    "daily health monitor",
    "wellness tracker app",
  ],
  fitness: [
    "workout tracker app",
    "fitness goals app",
    "activity monitor app",
  ],
  medical: [
    "health data tracker",
    "symptom tracker app",
    "medical log app",
  ],
  productivity: [
    "task manager app",
    "daily planner app",
    "habit tracker app",
  ],
  finance: [
    "expense tracker app",
    "budget planner app",
    "money manager app",
  ],
};

const SODIUM_SUGGESTIONS = [
  "sodium intake tracker",
  "salt intake monitor",
  "daily sodium log",
];

const GLUCOSE_SUGGESTIONS = [
  "blood sugar tracker",
  "glucose monitor app",
  "sugar level log",
];

function normKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenizeName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function categoryBucket(category: string | null | undefined): string | null {
  if (!category?.trim()) return null;
  const c = category.toLowerCase();
  if (c.includes("health") || c.includes("fitness") || c.includes("medical")) return "health";
  if (c.includes("productivity")) return "productivity";
  if (c.includes("finance") || c.includes("money")) return "finance";
  return null;
}

function pushUnique(
  out: DiscoveryKeywordSuggestion[],
  seen: Set<string>,
  item: DiscoveryKeywordSuggestion,
): void {
  const key = normKeyword(item.keyword);
  if (key.length < 2 || seen.has(key)) return;
  seen.add(key);
  out.push(item);
}

function inferCategoryFromText(
  keyword: string,
  appTokens: string[],
  parsed: KeywordCategory,
): DiscoverySuggestionCategory {
  if (parsed !== "general") return parsed;

  const k = normKeyword(keyword);
  const wordCount = k.split(" ").length;

  if (appTokens.some((t) => k.includes(t))) return "brand";
  if (wordCount >= 4) return "intent";
  if (/\b(best|free|top|how to|for)\b/.test(k)) return "intent";
  if (/\b(tracker|monitor|log|app|manager)\b/.test(k) && wordCount <= 3) {
    return "competitive";
  }
  return "competitive";
}

function reasonForAiKeyword(
  category: DiscoverySuggestionCategory,
  appName: string,
): { reasonKey: string; reasonParams?: Record<string, string> } {
  switch (category) {
    case "brand":
      return { reasonKey: "brandFeature", reasonParams: { app: appName } };
    case "gap":
      return { reasonKey: "competitorGap" };
    case "intent":
      return { reasonKey: "highIntent" };
    case "opportunity":
      return { reasonKey: "opportunity" };
    case "competitive":
    default:
      return { reasonKey: "aiListingCompetitive" };
  }
}

function buildBrandHeuristics(ctx: DiscoveryAppContext): DiscoveryKeywordSuggestion[] {
  const name = ctx.appName.trim();
  if (!name) return [];

  const tokens = tokenizeName(name);
  const lowerName = name.toLowerCase();
  const out: DiscoveryKeywordSuggestion[] = [];
  const base = {
    category: "brand" as const,
    reasonKey: "brandFeature",
    reasonParams: { app: name },
    source: "brand_heuristic" as const,
    priority: 95,
  };

  out.push({
    ...base,
    keyword: `${lowerName} tracker`,
    raw: `${lowerName} tracker`,
  });
  out.push({
    ...base,
    keyword: `${lowerName} app`,
    raw: `${lowerName} app`,
    priority: 88,
  });

  if (tokens.length >= 2) {
    out.push({
      ...base,
      keyword: `${tokens.join(" ")} tracker`,
      raw: `${tokens.join(" ")} tracker`,
      priority: 92,
    });
  }

  const joined = tokens.join(" ");
  if (joined.includes("salt") || joined.includes("sodium")) {
    for (const kw of SODIUM_SUGGESTIONS) {
      out.push({
        keyword: kw,
        raw: kw,
        category: "intent",
        reasonKey: "featureFit",
        reasonParams: { feature: "sodium" },
        source: "name_expansion",
        priority: 85,
      });
    }
  }
  if (joined.includes("sugar") || joined.includes("glucose")) {
    for (const kw of GLUCOSE_SUGGESTIONS) {
      out.push({
        keyword: kw,
        raw: kw,
        category: "intent",
        reasonKey: "featureFit",
        reasonParams: { feature: "glucose" },
        source: "name_expansion",
        priority: 85,
      });
    }
  }

  return out;
}

function buildCategoryHeuristics(ctx: DiscoveryAppContext): DiscoveryKeywordSuggestion[] {
  const bucket = categoryBucket(ctx.category);
  if (!bucket) return [];

  const templates = CATEGORY_LONGTAIL[bucket] ?? [];
  return templates.map((keyword, index) => ({
    keyword,
    raw: keyword,
    category: "opportunity" as const,
    reasonKey: "categoryFit",
    reasonParams: { category: ctx.category?.trim() || bucket },
    source: "category_heuristic" as const,
    priority: 70 - index,
  }));
}

function fromAiListing(
  rawItems: string[],
  ctx: DiscoveryAppContext,
): DiscoveryKeywordSuggestion[] {
  const appTokens = tokenizeName(ctx.appName);
  const out: DiscoveryKeywordSuggestion[] = [];

  for (const raw of rawItems) {
    const parsed = parseKeyword(raw);
    const keyword = parsed.keyword.trim();
    if (keyword.length < 2) continue;

    const category = inferCategoryFromText(keyword, appTokens, parsed.category);
    const { reasonKey, reasonParams } = reasonForAiKeyword(category, ctx.appName);

    out.push({
      keyword,
      raw,
      category,
      reasonKey,
      reasonParams,
      source: "ai_listing",
      priority:
        category === "brand"
          ? 90
          : category === "gap"
            ? 82
            : category === "intent"
              ? 78
              : 75,
    });
  }

  return out;
}

/**
 * Build ranked, de-duplicated discovery suggestions for the selected app.
 * Merges AI listing output with brand/category heuristics.
 */
export function buildContextualDiscoverySuggestions(args: {
  app: DiscoveryAppContext;
  aiListingKeywords?: string[];
  excludeNormalized?: ReadonlySet<string>;
}): DiscoveryKeywordSuggestion[] {
  const { app, aiListingKeywords = [], excludeNormalized } = args;
  const seen = new Set<string>();
  const merged: DiscoveryKeywordSuggestion[] = [];

  for (const item of fromAiListing(aiListingKeywords, app)) {
    pushUnique(merged, seen, item);
  }
  for (const item of buildBrandHeuristics(app)) {
    pushUnique(merged, seen, item);
  }
  for (const item of buildCategoryHeuristics(app)) {
    pushUnique(merged, seen, item);
  }

  const filtered = merged.filter((item) => {
    if (!excludeNormalized?.size) return true;
    return !excludeNormalized.has(normKeyword(item.keyword));
  });

  return filtered
    .sort((a, b) => b.priority - a.priority || a.keyword.localeCompare(b.keyword))
    .slice(0, MAX_SUGGESTIONS);
}

export function discoveryGenerationId(
  appId: string,
  aiGenerationId?: string | null,
): string {
  return aiGenerationId?.trim() ? aiGenerationId : `ctx-${appId}`;
}
