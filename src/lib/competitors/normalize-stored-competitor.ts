import type { CompetitorSpyQuickWinPlan } from "@/lib/keywords/build-competitor-spy-from-serper-preview";
import { isPlaceholderPlayStorePackageId } from "@/lib/keywords/play-store-details-url";

export type StoredSentimentResult = {
  topPraiseKeywords: string[];
  reportedBugsKeywords: string[];
  featureRequestsKeywords: string[];
};

export type StoredAsoAudit = {
  domainAuthority: number;
  hasVideoTrailer: boolean;
  localizedMarketsCount: number;
};

export type StoredCompetitorSharedRow = {
  keyword: string;
  yourRank: number | null;
  theirRank: number;
  /** True for manually added custom overlap keywords (persisted via custom-keyword API). */
  isCustom?: boolean;
  /** ISO country code (e.g. "us", "in") this row belongs to. Present on custom rows. */
  country?: string;
};

export type StoredCompetitor = {
  id: string;
  query: string;
  displayName: string;
  packageId: string;
  topKeywords: string[];
  shared: StoredCompetitorSharedRow[];
  quickWins: string[];
  quickWinPlans?: CompetitorSpyQuickWinPlan[];
  quickWinTerms: string[];
  gaps: { keyword: string; opportunity: "high" | "medium" }[];
  /** Persisted sentiment analysis — present after first Gemini run. */
  sentiment?: StoredSentimentResult;
  /** Persisted ASO off-page audit metrics — present after first Gemini run. */
  asoAudit?: StoredAsoAudit;
};

function normalizeQuickWinPlan(raw: unknown): CompetitorSpyQuickWinPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.key === "tplTrail") {
    if (
      typeof o.keyword === "string" &&
      typeof o.yourRank === "number" &&
      typeof o.theirRank === "number"
    ) {
      return { key: "tplTrail", keyword: o.keyword, yourRank: o.yourRank, theirRank: o.theirRank };
    }
  }
  if (o.key === "tplAbsent" && typeof o.keyword === "string") {
    return { key: "tplAbsent", keyword: o.keyword };
  }
  if (o.key === "tplAhead") {
    if (
      typeof o.keyword === "string" &&
      typeof o.yourRank === "number" &&
      typeof o.theirRank === "number"
    ) {
      return { key: "tplAhead", keyword: o.keyword, yourRank: o.yourRank, theirRank: o.theirRank };
    }
  }
  if (o.key === "tplTie" && typeof o.keyword === "string" && typeof o.rank === "number") {
    return { key: "tplTie", keyword: o.keyword, rank: o.rank };
  }
  if (o.key === "tplGap" && typeof o.term === "string") {
    return { key: "tplGap", term: o.term };
  }
  return null;
}

export function normalizeStoredCompetitorFromAnalysisJson(
  id: string,
  query: string,
  displayName: string,
  packageId: string,
  analysis: unknown,
): StoredCompetitor | null {
  if (isPlaceholderPlayStorePackageId(packageId)) return null;
  if (!analysis || typeof analysis !== "object") return null;
  const o = analysis as Record<string, unknown>;

  const quickWinPlans =
    Array.isArray(o.quickWinPlans)
      ? o.quickWinPlans
          .map(normalizeQuickWinPlan)
          .filter((x): x is CompetitorSpyQuickWinPlan => x !== null)
      : undefined;

  const quickWinTermsRaw = Array.isArray(o.quickWinTerms)
    ? o.quickWinTerms.filter((x): x is string => typeof x === "string")
    : [];

  const quickWins = Array.isArray(o.quickWins)
    ? o.quickWins.filter((x): x is string => typeof x === "string")
    : [];

  const quickWinTermsBase =
    quickWinTermsRaw.length > 0 ? quickWinTermsRaw : quickWins.map(() => "");
  const planLen = quickWinPlans?.length ?? 0;
  const n = Math.max(quickWins.length, planLen, quickWinTermsBase.length, 1);

  return {
    id,
    query: typeof o.query === "string" && o.query.trim() ? o.query : query,
    displayName,
    packageId,
    topKeywords: Array.isArray(o.topKeywords)
      ? o.topKeywords.filter((x): x is string => typeof x === "string")
      : [],
    shared: Array.isArray(o.shared)
      ? o.shared
          .map((x): StoredCompetitorSharedRow | null => {
            if (!x || typeof x !== "object") return null;
            const s = x as Record<string, unknown>;
            if (typeof s.keyword !== "string") return null;
            if (typeof s.theirRank !== "number") return null;
            const yourRank = typeof s.yourRank === "number" ? s.yourRank : null;
            const isCustom = s.isCustom === true ? true : undefined;
            const country = typeof s.country === "string" && s.country ? s.country : undefined;
            return { keyword: s.keyword, yourRank, theirRank: s.theirRank, isCustom, country };
          })
          .filter((x): x is StoredCompetitorSharedRow => x !== null)
      : [],
    quickWins,
    quickWinPlans,
    quickWinTerms: quickWinTermsBase.slice(0, n),
    gaps: Array.isArray(o.gaps)
      ? o.gaps.filter((x): x is { keyword: string; opportunity: "high" | "medium" } => {
          if (!x || typeof x !== "object") return false;
          const g = x as Record<string, unknown>;
          return (
            typeof g.keyword === "string" &&
            (g.opportunity === "high" || g.opportunity === "medium")
          );
        })
      : [],
    sentiment: (() => {
      const s = o.sentiment;
      if (!s || typeof s !== "object") return undefined;
      const sr = s as Record<string, unknown>;
      const arr = (k: string): string[] =>
        Array.isArray(sr[k])
          ? (sr[k] as unknown[]).filter((x): x is string => typeof x === "string")
          : [];
      return {
        topPraiseKeywords: arr("topPraiseKeywords"),
        reportedBugsKeywords: arr("reportedBugsKeywords"),
        featureRequestsKeywords: arr("featureRequestsKeywords"),
        praiseSignals: Array.isArray(sr.praiseSignals)
          ? (sr.praiseSignals as Array<Record<string, unknown>>)
              .map((row) => ({
                term: typeof row.term === "string" ? row.term : "",
                conversionImpactScore:
                  typeof row.conversionImpactScore === "number"
                    ? row.conversionImpactScore
                    : 50,
                classification:
                  row.classification === "market_dominating" ||
                  row.classification === "user_appreciated"
                    ? row.classification
                    : ("user_appreciated" as const),
              }))
              .filter((row) => row.term)
          : undefined,
      };
    })(),
    asoAudit: (() => {
      const a = o.asoAudit;
      if (!a || typeof a !== "object") return undefined;
      const ar = a as Record<string, unknown>;
      if (
        typeof ar.domainAuthority !== "number" ||
        typeof ar.hasVideoTrailer !== "boolean" ||
        typeof ar.localizedMarketsCount !== "number"
      ) return undefined;
      return {
        domainAuthority: ar.domainAuthority,
        hasVideoTrailer: ar.hasVideoTrailer,
        localizedMarketsCount: ar.localizedMarketsCount,
      };
    })(),
  };
}
