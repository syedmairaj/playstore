/**
 * Keyword Signals — vault parsing and grouping for Active Context panel.
 *
 * Schema-aware reads:
 * - Universal vault: state_en / state_ar (locale-isolated)
 * - Legacy vault: content JSON/text rows (global fetch, locale filter via language column + payload)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";
import { parseStagingVaultContent } from "@/lib/staging-vault/staging-vault-content";
import {
  hasLegacySignalColumns,
  hasUniversalVaultColumns,
} from "@/lib/staging-vault/staging-vault-schema";
import { isExplicitlyStagedKeywordEntry } from "@/lib/staging/optimizer-context-adapter";

export interface KeywordSignalLiveRank {
  rank: number | null;
  fetched_at: string;
  /** package_name → organic rank for workspace Competitor Spy slots */
  tracked_competitor_ranks?: Record<string, number | null>;
  not_ranked_reason?: "not_in_serp" | "outside_visibility_window" | "serper_error";
  error?: string;
}

export type KeywordSignalTargetAsset =
  | "title"
  | "short_description"
  | "full_description"
  | "keywords";

export interface KeywordSignal {
  keyword: string;
  difficulty: number;
  confidence: number;
  searchVolume: number;
  competition?: number;
  recommendation?: string;
  liveRanks?: Record<string, KeywordSignalLiveRank>;
  stagedAt?: string;
  lastFetchedAt?: string;
  /** Listing field this keyword is staged into (ASO sandbox). */
  targetAsset?: KeywordSignalTargetAsset;
  descriptionDraft?: string;
  /** True when user explicitly moved keyword to staging (not passively tracked). */
  explicitlyStaged?: boolean;
  pinned?: boolean;
}

export type KeywordSignalGroup = "high_confidence" | "medium_opportunity" | "live_rank_watchlist";

export interface GroupedKeywordSignals {
  highConfidence: KeywordSignal[];
  mediumOpportunity: KeywordSignal[];
  liveRankWatchlist: KeywordSignal[];
  other: KeywordSignal[];
  total: number;
}

const REC_HIGH = new Set(["HIGH_CONFIDENCE", "high_confidence"]);
const REC_MEDIUM = new Set(["MEDIUM_OPPORTUNITY", "medium_opportunity"]);

/** Difficulty 0–10 → Easy / Medium / Hard badge */
export function difficultyBadge(value: number): {
  label: "Easy" | "Medium" | "Hard";
  color: string;
  bg: string;
  border: string;
} {
  if (value <= 3) {
    return {
      label: "Easy",
      color: "#6ee7b7",
      bg: "rgba(16,185,129,0.1)",
      border: "rgba(16,185,129,0.3)",
    };
  }
  if (value <= 6) {
    return {
      label: "Medium",
      color: "#fcd34d",
      bg: "rgba(245,158,11,0.1)",
      border: "rgba(245,158,11,0.3)",
    };
  }
  return {
    label: "Hard",
    color: "#fca5a5",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.3)",
  };
}

export function formatSearchVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Normalise a single vault signal entry */
function normaliseSignalEntry(
  keywordKey: string,
  raw: Record<string, unknown>
): KeywordSignal | null {
  const keyword =
    typeof raw.keyword === "string" && raw.keyword.trim()
      ? raw.keyword.trim()
      : keywordKey.trim();
  if (!keyword) return null;

  const difficulty =
    typeof raw.difficulty === "number"
      ? raw.difficulty
      : typeof raw.difficulty_score === "number"
        ? raw.difficulty_score
        : 5;

  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;

  const searchVolume =
    typeof raw.search_volume === "number"
      ? raw.search_volume
      : typeof raw.searchVolume === "number"
        ? raw.searchVolume
        : 0;

  const liveRanksRaw = raw.live_ranks as Record<string, Record<string, unknown>> | undefined;
  let liveRanks: Record<string, KeywordSignalLiveRank> | undefined;
  if (liveRanksRaw && Object.keys(liveRanksRaw).length > 0) {
    liveRanks = {};
    for (const [market, entry] of Object.entries(liveRanksRaw)) {
      if (!entry || typeof entry !== "object") continue;
      const rank =
        typeof entry.rank === "number" || entry.rank === null ? entry.rank : null;
      const fetched_at =
        typeof entry.fetched_at === "string" ? entry.fetched_at : "";
      if (!fetched_at) continue;
      const trackedRaw = entry.tracked_competitor_ranks;
      let tracked_competitor_ranks: Record<string, number | null> | undefined;
      if (trackedRaw && typeof trackedRaw === "object" && !Array.isArray(trackedRaw)) {
        tracked_competitor_ranks = {};
        for (const [pkg, rk] of Object.entries(trackedRaw)) {
          if (typeof rk === "number" || rk === null) {
            tracked_competitor_ranks[pkg] = rk;
          }
        }
        if (Object.keys(tracked_competitor_ranks).length === 0) {
          tracked_competitor_ranks = undefined;
        }
      }
      const notRankedReason = entry.not_ranked_reason;
      liveRanks[market] = {
        rank,
        fetched_at,
        ...(tracked_competitor_ranks ? { tracked_competitor_ranks } : {}),
        ...(notRankedReason === "not_in_serp" ||
        notRankedReason === "outside_visibility_window" ||
        notRankedReason === "serper_error"
          ? { not_ranked_reason: notRankedReason }
          : {}),
        ...(typeof entry.error === "string" ? { error: entry.error } : {}),
      };
    }
    if (Object.keys(liveRanks).length === 0) liveRanks = undefined;
  }

  const targetRaw = raw.target_asset ?? raw.targetAsset;
  const targetAsset =
    targetRaw === "title" ||
    targetRaw === "short_description" ||
    targetRaw === "full_description" ||
    targetRaw === "keywords"
      ? (targetRaw as KeywordSignalTargetAsset)
      : undefined;

  const descriptionDraft =
    typeof raw.description_draft === "string"
      ? raw.description_draft
      : typeof raw.descriptionDraft === "string"
        ? raw.descriptionDraft
        : undefined;

  const pinned = raw.pinned === true || raw.is_pinned === true;
  const explicitlyStaged = isExplicitlyStagedKeywordEntry(raw);

  return {
    keyword,
    difficulty,
    confidence,
    searchVolume,
    competition: typeof raw.competition === "number" ? raw.competition : undefined,
    recommendation:
      typeof raw.recommendation === "string" ? raw.recommendation : undefined,
    liveRanks: liveRanks && Object.keys(liveRanks).length > 0 ? liveRanks : undefined,
    stagedAt: typeof raw.staged_at === "string" ? raw.staged_at : undefined,
    lastFetchedAt:
      typeof raw.last_fetched_at === "string" ? raw.last_fetched_at : undefined,
    targetAsset,
    descriptionDraft,
    pinned,
    explicitlyStaged,
  };
}

/**
 * Parse keyword_validator.signals map from a locale state branch.
 * Dual-locale safe: caller passes the correct state_en or state_ar object.
 */
function parseSignalsFromFeature(
  features: Record<string, unknown>,
  featureKey: "keyword_validator" | "keyword_tracker",
): KeywordSignal[] {
  const feature = (features[featureKey] ?? {}) as Record<string, unknown>;
  const signals = (feature.signals ?? {}) as Record<string, Record<string, unknown>>;
  const parsed: KeywordSignal[] = [];
  for (const [key, entry] of Object.entries(signals)) {
    if (!entry || typeof entry !== "object") continue;
    const signal = normaliseSignalEntry(key, entry);
    if (signal) parsed.push(signal);
  }
  return parsed;
}

export function parseKeywordSignalsFromState(
  state: Record<string, unknown> | null | undefined
): KeywordSignal[] {
  if (!state || typeof state !== "object") return [];

  const features = (state.features ?? {}) as Record<string, unknown>;
  const tracker = parseSignalsFromFeature(features, "keyword_tracker").filter(
    (s) => s.explicitlyStaged,
  );
  const validator = parseSignalsFromFeature(features, "keyword_validator").filter(
    (s) => s.explicitlyStaged && (s.pinned || s.targetAsset),
  );
  return mergeKeywordSignalsByTerm([...tracker, ...validator]);
}

/** Active Context + ASO Sandbox: only user-staged keywords (curated selection). */
export function isExplicitlyStagedKeywordSignal(signal: KeywordSignal): boolean {
  if (signal.explicitlyStaged === false) return false;
  return Boolean(
    signal.pinned ||
      (signal.stagedAt && signal.targetAsset) ||
      (signal.stagedAt && signal.explicitlyStaged),
  );
}

/** Keywords with a target asset — shown in ASO Sandbox after "Move to Staging". */
export function filterSandboxKeywordSignals(signals: KeywordSignal[]): KeywordSignal[] {
  return signals.filter(
    (s) => isExplicitlyStagedKeywordSignal(s) && Boolean(s.targetAsset),
  );
}

export function filterActiveContextKeywordSignals(signals: KeywordSignal[]): KeywordSignal[] {
  return signals.filter(isExplicitlyStagedKeywordSignal);
}

export type VaultLocale = "en" | "ar";

export type KeywordSignalsFetchSource = "universal" | "legacy" | "hybrid" | "none";

export type LegacyVaultKeywordRow = {
  id?: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  language?: string | null;
  created_at?: string | null;
  signal_type?: string | null;
  source_app_id?: string | null;
};

function mergeKeywordSignalsByTerm(signals: KeywordSignal[]): KeywordSignal[] {
  const byKeyword = new Map<string, KeywordSignal>();
  for (const signal of signals) {
    const key = signal.keyword.toLowerCase();
    const existing = byKeyword.get(key);
    if (!existing || signal.confidence >= existing.confidence) {
      byKeyword.set(key, signal);
    }
  }
  return [...byKeyword.values()].sort((a, b) => b.confidence - a.confidence);
}

function rowLanguageMatchesLocale(
  language: string | null | undefined,
  locale: VaultLocale,
): boolean {
  if (!language || !language.trim()) return true;
  const normalized = language.trim().toLowerCase();
  if (locale === "ar") return normalized.startsWith("ar");
  return normalized.startsWith("en") || normalized === "en";
}

function resolveTargetAsset(
  ...candidates: unknown[]
): KeywordSignalTargetAsset | undefined {
  for (const candidate of candidates) {
    if (isListingAssetTarget(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Parse a single legacy vault row (content JSON or plain keyword text).
 */
export function parseLegacyVaultKeywordRow(
  row: LegacyVaultKeywordRow,
  locale: VaultLocale,
  options?: { globalFetch?: boolean },
): KeywordSignal | null {
  const globalFetch = options?.globalFetch ?? false;
  const rawContent = String(row.content ?? "").trim();
  if (!rawContent) return null;

  const parsedContent = parseStagingVaultContent(rawContent);
  const keyword = (parsedContent?.keyword ?? rawContent).trim();
  if (!keyword) return null;

  if (!globalFetch) {
    if (parsedContent?.locale && parsedContent.locale !== locale) {
      return null;
    }
    if (!rowLanguageMatchesLocale(row.language, locale) && !parsedContent?.locale) {
      return null;
    }
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const contentPayload = meta.content_payload as Record<string, unknown> | undefined;

  const targetAsset = resolveTargetAsset(
    parsedContent?.targetAsset,
    meta.targetAsset,
    contentPayload?.targetAsset,
  );

  const descriptionDraft =
    parsedContent?.descriptionDraft ??
    (typeof meta.descriptionDraft === "string" ? meta.descriptionDraft : undefined) ??
    (typeof meta.description_draft === "string" ? meta.description_draft : undefined);

  const stagedAt =
    parsedContent?.stagedAt ??
    (typeof row.created_at === "string" ? row.created_at : undefined);

  const metaRecord = {
    ...meta,
    targetAsset,
    staged_at: stagedAt,
    discovery_source: parsedContent?.discoverySource ?? meta.discoverySource,
  } as Record<string, unknown>;

  const explicitlyStaged = isExplicitlyStagedKeywordEntry(metaRecord);

  if (!explicitlyStaged && !targetAsset) {
    return null;
  }

  return {
    keyword,
    difficulty: 5,
    confidence: 70,
    searchVolume: 0,
    recommendation: "MEDIUM_OPPORTUNITY",
    stagedAt,
    targetAsset,
    descriptionDraft,
    explicitlyStaged,
  };
}

/**
 * Parse legacy keyword rows. Legacy schema has no state_en/state_ar — global fetch
 * with best-effort locale filtering via language column and JSON payload locale.
 */
export function parseKeywordSignalsFromLegacyRows(
  rows: LegacyVaultKeywordRow[],
  locale: VaultLocale,
  options?: { globalFetch?: boolean },
): KeywordSignal[] {
  const parsed: KeywordSignal[] = [];
  for (const row of rows) {
    if (row.signal_type && row.signal_type !== "keyword") continue;
    const signal = parseLegacyVaultKeywordRow(row, locale, options);
    if (signal) parsed.push(signal);
  }
  return mergeKeywordSignalsByTerm(parsed);
}

/**
 * Schema-aware keyword signal resolver for the optimizer and Active Context panel.
 */
export async function fetchKeywordSignalsForApp(
  supabase: SupabaseClient,
  args: { workspaceId: string; appId: string; locale: VaultLocale },
): Promise<{ signals: KeywordSignal[]; source: KeywordSignalsFetchSource }> {
  const { workspaceId, appId, locale } = args;
  const universalAvailable = await hasUniversalVaultColumns(supabase);
  const legacyAvailable = await hasLegacySignalColumns(supabase);

  let universalSignals: KeywordSignal[] = [];
  let legacySignals: KeywordSignal[] = [];

  if (universalAvailable) {
    const stateKey = locale === "ar" ? "state_ar" : "state_en";
    const { data: vaultRow, error } = await supabase
      .from("workspace_staging_vault")
      .select(`${stateKey}, is_deleted, deleted_at`)
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[KeywordSignals] Universal vault read failed, will try legacy fallback:",
        error.message,
      );
    } else if (vaultRow && !vaultRow.is_deleted && !vaultRow.deleted_at) {
      const state = vaultRow[stateKey as keyof typeof vaultRow] as
        | Record<string, unknown>
        | undefined;
      universalSignals = parseKeywordSignalsFromState(state);
    }
  }

  if (legacyAvailable) {
    const { data: rows, error } = await supabase
      .from("workspace_staging_vault")
      .select(
        "id, content, metadata, language, created_at, signal_type, source_app_id, deleted_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("signal_type", "keyword")
      .eq("source_app_id", appId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.warn("[KeywordSignals] Legacy vault read failed:", error.message);
    } else if (rows?.length) {
      legacySignals = parseKeywordSignalsFromLegacyRows(rows, locale, {
        globalFetch: !universalAvailable,
      });
    }
  }

  const mergeCurated = (signals: KeywordSignal[]) =>
    filterActiveContextKeywordSignals(mergeKeywordSignalsByTerm(signals));

  if (universalSignals.length > 0 && legacySignals.length > 0) {
    const merged = new Map<string, KeywordSignal>();
    for (const signal of legacySignals) {
      merged.set(signal.keyword.toLowerCase(), signal);
    }
    for (const signal of universalSignals) {
      merged.set(signal.keyword.toLowerCase(), signal);
    }
    return {
      signals: mergeCurated([...merged.values()]),
      source: "hybrid",
    };
  }

  if (universalSignals.length > 0) {
    return { signals: mergeCurated(universalSignals), source: "universal" };
  }

  if (legacySignals.length > 0) {
    return { signals: mergeCurated(legacySignals), source: "legacy" };
  }

  return { signals: [], source: "none" };
}

export function hasLiveRanks(signal: KeywordSignal): boolean {
  return Boolean(signal.liveRanks && Object.keys(signal.liveRanks).length > 0);
}

export function groupKeywordSignals(signals: KeywordSignal[]): GroupedKeywordSignals {
  const highConfidence: KeywordSignal[] = [];
  const mediumOpportunity: KeywordSignal[] = [];
  const liveRankWatchlist: KeywordSignal[] = [];
  const categorized = new Set<string>();

  for (const signal of signals) {
    const rec = signal.recommendation?.toUpperCase().replace(/-/g, "_") ?? "";

    if (signal.confidence >= 75 || REC_HIGH.has(rec) || REC_HIGH.has(signal.recommendation ?? "")) {
      highConfidence.push(signal);
      categorized.add(signal.keyword);
    } else if (
      (signal.confidence >= 50 && signal.confidence < 75) ||
      REC_MEDIUM.has(rec) ||
      REC_MEDIUM.has(signal.recommendation ?? "")
    ) {
      mediumOpportunity.push(signal);
      categorized.add(signal.keyword);
    }

    if (hasLiveRanks(signal)) {
      liveRankWatchlist.push(signal);
    }
  }

  const other = signals.filter((s) => !categorized.has(s.keyword));

  return {
    highConfidence,
    mediumOpportunity,
    liveRankWatchlist,
    other,
    total: signals.length,
  };
}

/** Compact live-rank labels for row display, e.g. "US: #12" */
export function formatLiveRankIndicators(
  liveRanks: Record<string, KeywordSignalLiveRank> | undefined,
  maxMarkets = 3
): string[] {
  if (!liveRanks) return [];

  return Object.entries(liveRanks)
    .slice(0, maxMarkets)
    .map(([market, data]) => {
      const code = market.toUpperCase();
      if (data.rank != null) return `${code}: #${data.rank}`;
      return `${code}: —`;
    });
}
