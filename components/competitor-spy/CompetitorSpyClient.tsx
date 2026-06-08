"use client";
import { useStaging } from "@/src/hooks/useStaging"; // Update path if needed
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Info, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CountrySelector } from "@/components/country-selector";
import {
  SerperPreviewResults,
  type SerperPreviewCountry,
} from "@/components/serper/serper-preview-results";
import { CompetitorSpyCountryTabs } from "@/components/competitor-spy/competitor-spy-country-tabs";
import { CompetitorSpyCreditsConfirmDialog } from "@/components/competitor-spy/competitor-spy-credits-confirm-dialog";
import { CompetitorSpyManageSheet } from "@/components/competitor-spy/competitor-spy-manage-sheet";
import {
  CompetitorSpyKeywordGapTable,
  type CompetitorSpyGapEmptyVariant,
} from "@/components/competitor-spy/competitor-spy-keyword-gap-table";
import { RankDisplay } from "@/components/keywords/rank-display";
import { OptimizerShimmerBar } from "@/components/listing/optimizer/optimizer-shimmer-bar";
import { OptimizerWorkspace } from "@/components/optimizer/OptimizerWorkspace";
import { CompetitorSpySnapshotCard } from "@/components/competitor-spy/competitor-spy-snapshot-card";
import {
  readPersistedActiveCountry,
  readPersistedSelectedCountries,
  sanitizeSelectedCountries,
  writePersistedActiveCountry,
  writePersistedSelectedCountries,
} from "@/lib/client/competitor-spy-country-storage";
import {
  navigateToListingOptimizer,
  setPlaystoreInjectedKeywordContext,
  setPlaystoreInjectedCompetitorVulnerabilities,
} from "@/lib/client/listing-optimizer-keywords-prefill";
import {
  buildCompetitorSpyInsightsForCountry,
  filterSerperPreviewByCountry,
  gapRowsForCompetitorCountry,
  liveTitleFromPreviewInResults,
  minPreviewRankForPackageInResults,
  previewHasCountryBlock,
} from "@/lib/competitors/competitor-spy-country-insights";
import {
  type StoredCompetitor,
  type StoredCompetitorSharedRow,
  normalizeStoredCompetitorFromAnalysisJson,
} from "@/lib/competitors/normalize-stored-competitor";
import {
  filterSharedRowsBothSidesTracked,
  type CompetitorSpyQuickWinPlan,
  type TrackedKeywordRankHint,
  buildCompetitorSpyAnalysisFromPreview,
} from "@/lib/keywords/build-competitor-spy-from-serper-preview";
import {
  WORKSPACE_KEYWORDS_CHANGED_EVENT,
  type WorkspaceKeywordsChangedDetail,
} from "@/lib/client/workspace-keywords-sync";
import { inferWorkspaceAppPlayLive } from "@/lib/keywords/infer-workspace-app-play-live";
import {
  isKeywordRankSyncComplete,
  KEYWORD_RANK_SYNC_POLL_INTERVAL_MS,
  KEYWORD_RANK_SYNC_POLL_MAX_ATTEMPTS,
} from "@/lib/keywords/keyword-rank-sync-pending";
import { type SupportedCountryCode } from "@/lib/countries";
import { competitorSpyAiCreditsForCountryCount } from "@/lib/keywords/keyword-track-ai-pricing";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

const STORAGE_COMPETITORS = "playstore:competitorSpy:competitors";
const STORAGE_TRACKED = "playstore:competitorSpy:tracked";
const STORAGE_PREVIEWS = "playstore:competitorSpy:previews";

/**
 * Converts a lowercase ISO country code to a flag emoji + uppercase code badge label.
 * Uses regional indicator Unicode codepoints — supported in all modern browsers/OSes.
 * Example: "us" → "🇺🇸 US", "in" → "🇮🇳 IN", "sa" → "🇸🇦 SA"
 */
function countryBadgeLabel(code: string): string {
  const upper = code.toUpperCase();
  // Regional indicator symbols: A = 0x1F1E6, offset from 'A' charcode.
  const flag = [...upper]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
  return `${flag} ${upper}`;
}

export type CompetitorSpyClientProps = {
  workspaceId: string;
  /** Optional server snapshot; when omitted, apps load after mount via API. */
  apps?: WorkspaceAppListRow[];
  appsLoadError?: string | null;
  keywordTrackerEnabled: boolean;
};

const SHARED_TABLE_SKELETON_ROWS = 4;

type WorkspaceKeywordListRow = {
  term: string;
  latest?: { rank: number | null } | null;
  ranks?: { rank: number | null }[];
  /**
   * Newest snapshot per country from the DB. Shape matches KeywordWithRanks.latestPerCountry.
   * Used to pick the correct rank for the currently-active country tab.
   */
  latestPerCountry?: { country: string; rank: number; captured_at: string }[];
  lastSyncedAt?: string | null;
};

export type { StoredCompetitor };

function storageKeyCompetitors(workspaceId: string) {
  return `${STORAGE_COMPETITORS}:${workspaceId}`;
}

function storageKeyTracked(workspaceId: string) {
  return `${STORAGE_TRACKED}:${workspaceId}`;
}

function parseSessionCompetitors(raw: string | null): StoredCompetitor[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        if (typeof o.id !== "string" || typeof o.packageId !== "string") return null;
        return normalizeStoredCompetitorFromAnalysisJson(
          o.id,
          typeof o.query === "string" ? o.query : "",
          typeof o.displayName === "string" ? o.displayName : "",
          o.packageId,
          row,
        );
      })
      .filter((x): x is StoredCompetitor => x !== null);
  } catch {
    return [];
  }
}

function parseTracked(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

type PreviewByCompetitorId = Record<string, SerperPreviewCountry[]>;

function storageKeyPreviews(workspaceId: string) {
  return `${STORAGE_PREVIEWS}:${workspaceId}`;
}

function parsePreviews(raw: string | null): PreviewByCompetitorId {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PreviewByCompetitorId = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) out[id] = value as SerperPreviewCountry[];
    }
    return out;
  } catch {
    return {};
  }
}

function findCachedCompetitorForQuery(
  list: StoredCompetitor[],
  query: string,
): StoredCompetitor | undefined {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return undefined;
  return list.find(
    (c) =>
      c.query.trim().toLowerCase() === q ||
      c.packageId.trim().toLowerCase() === q ||
      c.displayName.trim().toLowerCase() === q,
  );
}

type CompetitorApiRow = StoredCompetitor & {
  previewResults?: SerperPreviewCountry[] | null;
  /** Set to "complete" by the GET /competitors route once the DB read is settled.
   *  Polling should stop the moment this field equals "complete" on the target
   *  competitor row — even when shared/topKeywords arrays are legitimately empty
   *  (e.g. USA/India with no competitive keyword intersection). */
  syncStatus?: "syncing" | "complete";
};

async function fetchWorkspaceCompetitors(
  workspaceId: string,
): Promise<CompetitorApiRow[]> {
  const res = await fetch(`/api/workspaces/${workspaceId}/competitors`);
  const json = (await res.json()) as {
    ok?: boolean;
    competitors?: CompetitorApiRow[];
  };
  if (!res.ok || !json.ok || !Array.isArray(json.competitors)) return [];
  return json.competitors;
}

function minTheirRankFromShared(comp: StoredCompetitor): number | null {
  const nums = comp.shared.map((s) => s.theirRank).filter((n) => typeof n === "number");
  if (!nums.length) return null;
  return Math.min(...nums);
}

function SharedKeywordsTableSkeleton({ isRtl }: { isRtl: boolean }) {
  const t = useTranslations("competitorSpy.shared");
  return <SharedKeywordsTableSkeletonBody isRtl={isRtl} label={t("loadingSkeleton")} />;
}

function SharedKeywordsTableSkeletonBody({ isRtl, label, syncingMessage }: { isRtl: boolean; label: string; syncingMessage?: string }) {
  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1018]",
        isRtl && "font-arabic",
      )}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <thead className="border-b border-white/[0.06] bg-[#070a0f] text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">
                <OptimizerShimmerBar className="h-3 w-24" />
              </th>
              <th className="px-4 py-3 font-medium">
                <OptimizerShimmerBar className="h-3 w-16" delayS={0.05} />
              </th>
              <th className="px-4 py-3 font-medium">
                <OptimizerShimmerBar className="h-3 w-16" delayS={0.1} />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SHARED_TABLE_SKELETON_ROWS }, (_, i) => (
              <tr key={i} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-3">
                  <OptimizerShimmerBar className="h-4 w-36" delayS={i * 0.08} />
                </td>
                <td className="px-4 py-3">
                  <OptimizerShimmerBar className="h-4 w-12" delayS={i * 0.08 + 0.04} />
                </td>
                <td className="px-4 py-3">
                  <OptimizerShimmerBar className="h-4 w-12" delayS={i * 0.08 + 0.08} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sr-only">{label}</p>
      {syncingMessage && (
        <p className="px-4 pb-3 pt-1 text-center text-xs leading-relaxed text-zinc-500">
          {syncingMessage}
        </p>
      )}
    </div>
  );
}

export function CompetitorSpyClient({
  workspaceId,
  apps: initialApps,
  appsLoadError: initialAppsLoadError = null,
  keywordTrackerEnabled,
}: CompetitorSpyClientProps) {
  const t = useTranslations("competitorSpy");
  const tQuick = useTranslations("competitorSpy.quickWins");
  const tRanks = useTranslations("competitorSpy.ranks");
  const tSerper = useTranslations("serperPreview");
  const analyzeSectionRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const router = useRouter();
  const isRtl = locale === "ar";
  const defaultMarket = (locale === "ar" ? "sa" : "us") as SupportedCountryCode;
  const { stage } = useStaging();
  const rankLabels = useMemo(
    () => ({
      notInTop: tRanks("notInTop"),
      notPublished: tRanks("notPublished"),
      outsideTopTooltip: tRanks("outsideTopTooltip"),
    }),
    [tRanks],
  );
  const [competitors, setCompetitors] = useState<StoredCompetitor[]>([]);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | null>(null);
  const [trackedTerms, setTrackedTerms] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [analyzePending, setAnalyzePending] = useState(false);
  const [trackPending, setTrackPending] = useState<string | null>(null);
  const [optimisticTracked, setOptimisticTracked] = useState<Set<string>>(() => new Set());
  const [countryOverlapShared, setCountryOverlapShared] = useState<StoredCompetitorSharedRow[]>(
    [],
  );
  const [apps, setApps] = useState<WorkspaceAppListRow[]>(() => initialApps ?? []);
  const [appsLoadError, setAppsLoadError] = useState<string | null>(initialAppsLoadError);
  const [targetAppId, setTargetAppId] = useState(() => initialApps?.[0]?.id ?? "");
  const [dismissedSharedKeywords, setDismissedSharedKeywords] = useState<Set<string>>(
    () => new Set(),
  );
  const [sessionKeywordStack, setSessionKeywordStack] = useState<string[]>([]);
  /** Live custom rows appended via the credit-gated API call. Replaces session-only stack. */
  const [liveCustomRows, setLiveCustomRows] = useState<
    (StoredCompetitorSharedRow & { isCustom: true; hasLiveRanks: boolean; country: string })[]
  >([]);
  /** Keyword draft queued for the custom-keyword credit confirmation dialog. */
  const [customKwConfirmDraft, setCustomKwConfirmDraft] = useState<string | null>(null);
  /** Whether the custom keyword API call is currently in-flight. */
  const [customKwPending, setCustomKwPending] = useState(false);
  const [customKeywordDraft, setCustomKeywordDraft] = useState("");
  const [selectedCountries, setSelectedCountriesRaw] = useState<SupportedCountryCode[]>(
    () => [defaultMarket],
  );
  const [activeCountry, setActiveCountry] = useState<SupportedCountryCode>(defaultMarket);
  const [manageOpen, setManageOpen] = useState(false);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [countriesHydrated, setCountriesHydrated] = useState(false);
  /**
   * Optimistic retry flag: set true while a 2-second background re-fetch is pending.
   * Cleared once the retry resolves (with or without data).
   */
  const [optimisticRetryPending, setOptimisticRetryPending] = useState(false);

  const setSelectedCountries = useCallback(
    (next: SupportedCountryCode[]) => {
      setSelectedCountriesRaw(sanitizeSelectedCountries(next, [defaultMarket]));
    },
    [defaultMarket],
  );
  const [previewPending, setPreviewPending] = useState(false);
  const [previewResults, setPreviewResults] = useState<SerperPreviewCountry[] | null>(null);
  const [previewByCompetitorId, setPreviewByCompetitorId] = useState<PreviewByCompetitorId>({});
  const [creditsConfirmOpen, setCreditsConfirmOpen] = useState(false);
  /** Term queued for tracking, pending the 1-credit confirmation dialog. */
  const [trackCreditsConfirmTerm, setTrackCreditsConfirmTerm] = useState<string | null>(null);
  const [trackedKeywordHints, setTrackedKeywordHints] = useState<TrackedKeywordRankHint[]>([]);
  const [dbLoadPending, setDbLoadPending] = useState(false);

  // ── Review Sentiment state ─────────────────────────────────────────────────
  type SentimentResult = {
    topPraiseKeywords: string[];
    reportedBugsKeywords: string[];
    featureRequestsKeywords: string[];
  };
  type AsoAuditData = {
    domainAuthority: number;
    hasVideoTrailer: boolean;
    localizedMarketsCount: number;
  };
  /** packageId of the competitor whose sentiment was last fetched — invalidates when user switches. */
  const [sentimentForPackage, setSentimentForPackage] = useState<string | null>(null);
  const [sentimentConfirmOpen, setSentimentConfirmOpen] = useState(false);
  const [sentimentBusy, setSentimentBusy] = useState(false);
  const [sentimentError, setSentimentError] = useState<string | null>(null);
  const [sentimentResult, setSentimentResult] = useState<SentimentResult | null>(null);
  /** ASO audit data loaded from DB (or returned by the sentiment API). */
  const [dbAsoAudit, setDbAsoAudit] = useState<AsoAuditData | null>(null);

  const rankPollAbortByTermRef = useRef<Map<string, AbortController>>(new Map());
  const tShared = useTranslations("competitorSpy.shared");
  const tCountries = useTranslations("countrySelector");

  const analyzeCreditCost = useMemo(
    () => competitorSpyAiCreditsForCountryCount(selectedCountries.length),
    [selectedCountries.length],
  );

  const formatQuickWin = useCallback(
    (plan: CompetitorSpyQuickWinPlan) => {
      switch (plan.key) {
        case "tplTrail":
          return tQuick("tplTrail", {
            keyword: plan.keyword,
            yourRank: plan.yourRank,
            theirRank: plan.theirRank,
          });
        case "tplAbsent":
          return tQuick("tplAbsent", { keyword: plan.keyword });
        case "tplAhead":
          return tQuick("tplAhead", {
            keyword: plan.keyword,
            yourRank: plan.yourRank,
            theirRank: plan.theirRank,
          });
        case "tplTie":
          return tQuick("tplTie", { keyword: plan.keyword, rank: plan.rank });
        case "tplGap":
          return tQuick("tplGap", { term: plan.term });
        default:
          return "";
      }
    },
    [tQuick],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fallback = [defaultMarket];
    const persisted = readPersistedSelectedCountries(fallback);
    setSelectedCountriesRaw(persisted);
    setActiveCountry(readPersistedActiveCountry(persisted[0] ?? defaultMarket, persisted));
    setCountriesHydrated(true);
  }, [defaultMarket]);

  useEffect(() => {
    if (!countriesHydrated) return;
    writePersistedSelectedCountries(selectedCountries);
  }, [countriesHydrated, selectedCountries]);

  useEffect(() => {
    if (!countriesHydrated) return;
    writePersistedActiveCountry(activeCountry);
  }, [activeCountry, countriesHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sessionList = parseSessionCompetitors(
      sessionStorage.getItem(storageKeyCompetitors(workspaceId)),
    );
    const sessionPreviews = parsePreviews(
      sessionStorage.getItem(storageKeyPreviews(workspaceId)),
    );
    if (sessionList.length > 0) {
      setCompetitors(sessionList);
      setPreviewByCompetitorId(sessionPreviews);
    }
    setTrackedTerms(parseTracked(sessionStorage.getItem(storageKeyTracked(workspaceId))));
    setHydrated(true);
  }, [workspaceId]);

  useEffect(() => {
    if (initialApps?.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/apps`);
        const json = (await res.json()) as {
          ok?: boolean;
          apps?: WorkspaceAppListRow[];
          error?: { message?: string };
        };
        if (cancelled) return;
        if (res.ok && json.ok && Array.isArray(json.apps)) {
          setApps(json.apps);
          setAppsLoadError(null);
        } else {
          setAppsLoadError(json.error?.message ?? t("retry"));
        }
      } catch {
        if (!cancelled) setAppsLoadError(t("retry"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialApps?.length, t, workspaceId]);

  useEffect(() => {
    const controllers = rankPollAbortByTermRef.current;
    return () => {
      for (const ac of controllers.values()) ac.abort();
      controllers.clear();
    };
  }, []);

  const refreshTrackedKeywordHints = useCallback(async (forCountry?: string) => {
    if (!keywordTrackerEnabled) {
      setTrackedKeywordHints([]);
      return;
    }
    const appId = targetAppId || apps[0]?.id;
    if (!appId) {
      setTrackedKeywordHints([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/keywords?appId=${encodeURIComponent(appId)}`,
      );
      const json = (await res.json()) as {
        ok?: boolean;
        keywords?: WorkspaceKeywordListRow[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.keywords)) return;

      // Pick the most accurate rank for the active country tab:
      // 1. If latestPerCountry has an entry for forCountry, use it.
      // 2. Otherwise fall back to the headline latest rank.
      const targetCountry = (forCountry ?? activeCountry).toLowerCase();
      const hints = json.keywords
        .map((k) => {
          const term = String(k.term ?? "").trim();
          if (term.length < 2) return null;
          const countryHit = k.latestPerCountry?.find(
            (p) => String(p.country ?? "").toLowerCase() === targetCountry,
          );
          const yourRank = countryHit != null ? countryHit.rank : (k.latest?.rank ?? null);
          return { term, yourRank };
        })
        .filter((h): h is { term: string; yourRank: number | null } => h !== null)
        .slice(0, 40);

      setTrackedKeywordHints(hints);
      // Replace trackedTerms entirely with the live DB result so stale
      // sessionStorage entries never resurface deleted keywords.
      setTrackedTerms(hints.map((h) => h.term));
    } catch {
      setTrackedKeywordHints([]);
    }
  }, [activeCountry, apps, keywordTrackerEnabled, targetAppId, workspaceId]);

  useEffect(() => {
    function onKeywordsChanged(e: Event) {
      const detail = (e as CustomEvent<WorkspaceKeywordsChangedDetail>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      if (detail.removedTerms?.length) {
        const removed = new Set(detail.removedTerms.map((t) => t.trim().toLowerCase()));
        setOptimisticTracked((prev) => {
          const next = new Set(prev);
          for (const term of removed) next.delete(term);
          return next;
        });
        setTrackedTerms((prev) => {
          const next = prev.filter((t) => !removed.has(t.toLowerCase()));
          // Eagerly flush to sessionStorage so a same-tab page navigation picks up the
          // pruned list before the React re-render writes the state via the deferred effect.
          try {
            sessionStorage.setItem(storageKeyTracked(workspaceId), JSON.stringify(next));
          } catch { /* private mode / quota */ }
          return next;
        });
        setTrackedKeywordHints((prev) =>
          prev.filter((h) => !removed.has(h.term.toLowerCase())),
        );
        for (const term of detail.removedTerms) {
          const key = term.trim().toLowerCase();
          rankPollAbortByTermRef.current.get(key)?.abort();
          rankPollAbortByTermRef.current.delete(key);
          setTrackPending((cur) => (cur && removed.has(cur) ? null : cur));
        }
        return;
      }
      void refreshTrackedKeywordHints();
    }
    function onVisible() {
      if (document.visibilityState === "visible") void refreshTrackedKeywordHints();
    }
    window.addEventListener(WORKSPACE_KEYWORDS_CHANGED_EVENT, onKeywordsChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(WORKSPACE_KEYWORDS_CHANGED_EVENT, onKeywordsChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshTrackedKeywordHints, workspaceId]);

  const startRankPollForTerm = useCallback(
    (term: string) => {
      const key = term.trim().toLowerCase();
      if (!key || !keywordTrackerEnabled) return;
      const appId = targetAppId || apps[0]?.id;
      if (!appId) return;

      rankPollAbortByTermRef.current.get(key)?.abort();
      const ac = new AbortController();
      rankPollAbortByTermRef.current.set(key, ac);

      void (async () => {
        try {
          for (let attempt = 0; attempt < KEYWORD_RANK_SYNC_POLL_MAX_ATTEMPTS; attempt += 1) {
            if (ac.signal.aborted) return;
            if (attempt > 0) {
              await new Promise<void>((resolve, reject) => {
                const timer = window.setTimeout(resolve, KEYWORD_RANK_SYNC_POLL_INTERVAL_MS);
                ac.signal.addEventListener(
                  "abort",
                  () => {
                    window.clearTimeout(timer);
                    reject(new DOMException("Aborted", "AbortError"));
                  },
                  { once: true },
                );
              });
            }
            if (ac.signal.aborted) return;

            const res = await fetch(
              `/api/workspaces/${workspaceId}/keywords?appId=${encodeURIComponent(appId)}`,
              { signal: ac.signal },
            );
            const json = (await res.json()) as {
              ok?: boolean;
              keywords?: WorkspaceKeywordListRow[];
            };
            if (!res.ok || !json.ok || !Array.isArray(json.keywords)) continue;

            const row = json.keywords.find(
              (k) => String(k.term ?? "").trim().toLowerCase() === key,
            );
            if (!row || !isKeywordRankSyncComplete(row)) continue;

            setTrackedKeywordHints((prev) => {
              const nextRank = row.latest?.rank ?? null;
              const has = prev.some((h) => h.term.toLowerCase() === key);
              if (has) {
                return prev.map((h) =>
                  h.term.toLowerCase() === key ? { ...h, yourRank: nextRank } : h,
                );
              }
              return [...prev, { term: term.trim(), yourRank: nextRank }];
            });
            setTrackedTerms((prev) =>
              prev.some((x) => x.toLowerCase() === key) ? prev : [...prev, term.trim()],
            );
            return;
          }
        } catch {
          /* aborted or network */
        } finally {
          if (rankPollAbortByTermRef.current.get(key) === ac) {
            rankPollAbortByTermRef.current.delete(key);
          }
        }
      })();
    },
    [apps, keywordTrackerEnabled, targetAppId, workspaceId],
  );

  const trackedTermKeys = useMemo(() => {
    const keys = new Set<string>();
    // trackedKeywordHints is the authoritative live-DB source; trackedTerms
    // mirrors it after every refreshTrackedKeywordHints call and is kept in
    // sync by executeTrackKeyword / startRankPollForTerm for newly added terms
    // until the next API refresh.
    for (const h of trackedKeywordHints) keys.add(h.term.toLowerCase());
    for (const term of trackedTerms) keys.add(term.toLowerCase());
    for (const term of optimisticTracked) keys.add(term);
    return keys;
  }, [optimisticTracked, trackedKeywordHints, trackedTerms]);

  useEffect(() => {
    let cancelled = false;
    setDbLoadPending(true);

    const sessionList = parseSessionCompetitors(
      typeof window !== "undefined"
        ? sessionStorage.getItem(storageKeyCompetitors(workspaceId))
        : null,
    );
    const sessionPreviews = parsePreviews(
      typeof window !== "undefined"
        ? sessionStorage.getItem(storageKeyPreviews(workspaceId))
        : null,
    );

    async function loadCompetitors() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/competitors`);
        const json = (await res.json()) as {
          ok?: boolean;
          competitors?: Array<
            StoredCompetitor & {
              previewResults?: SerperPreviewCountry[] | null;
            }
          >;
        };
        if (cancelled || !res.ok || !json.ok || !Array.isArray(json.competitors)) {
          if (!cancelled && sessionList.length > 0) {
            setCompetitors(sessionList);
            setPreviewByCompetitorId(sessionPreviews);
          }
          return;
        }
        const fromDb = json.competitors.map((c) => {
          const { previewResults: pr, ...rest } = c;
          return { competitor: rest as StoredCompetitor, preview: pr };
        });
        if (fromDb.length > 0) {
          setCompetitors(fromDb.map((x) => x.competitor));
          const previews: PreviewByCompetitorId = { ...sessionPreviews };
          for (const { competitor, preview } of fromDb) {
            if (Array.isArray(preview) && preview.length > 0) {
              previews[competitor.id] = preview;
            }
          }
          setPreviewByCompetitorId(previews);
        } else if (sessionList.length > 0) {
          setCompetitors(sessionList);
          setPreviewByCompetitorId(sessionPreviews);
        }
      } catch {
        if (!cancelled && sessionList.length > 0) {
          setCompetitors(sessionList);
          setPreviewByCompetitorId(sessionPreviews);
        }
      }
    }

    void Promise.all([loadCompetitors(), refreshTrackedKeywordHints()]).finally(() => {
      if (!cancelled) setDbLoadPending(false);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshTrackedKeywordHints, workspaceId]);

  useEffect(() => {
    void refreshTrackedKeywordHints();
  }, [refreshTrackedKeywordHints, targetAppId]);

  // Re-hydrate hints when the country tab changes so "Your Rank" values and the
  // Auto-Tracking badge reflect the correct per-country snapshot immediately.
  useEffect(() => {
    void refreshTrackedKeywordHints(activeCountry);
  // refreshTrackedKeywordHints already captures activeCountry via closure, but
  // listing it explicitly ensures the effect fires whenever the tab switches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCountry]);

  /**
   * Optimistic retry: if we finish the initial DB load and the selected competitor has
   * no shared-keyword rows and no live rank data, poll every 3 seconds (up to 4 attempts)
   * until the API returns syncStatus === "complete" for that competitor.
   *
   * IMPORTANT: we do NOT stop on array length. A region like USA or India may return
   * zero shared keywords because no competitive keyword intersection exists — that is a
   * valid empty result, not a sign that data is still pending. We stop only when the API
   * explicitly signals syncStatus === "complete", or after MAX_ATTEMPTS.
   * Once stopped, the loading skeleton is cleared and the empty-state UI is rendered.
   */
  useEffect(() => {
    if (dbLoadPending) return;
    if (!hydrated) return;
    if (!selectedCompetitorId) return;
    const comp = competitors.find((c) => c.id === selectedCompetitorId);
    if (!comp) return;
    // Skip polling if data is present.
    const sharedEmpty = comp.shared.length === 0;
    const topKwEmpty = comp.topKeywords.length === 0;
    if (!sharedEmpty && !topKwEmpty) return;

    setOptimisticRetryPending(true);
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 4;

    const intervalId = window.setInterval(async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const fromApi = await fetchWorkspaceCompetitors(workspaceId);
        if (cancelled) return;

        // Merge all returned rows into local state regardless of array contents.
        if (fromApi.length > 0) {
          const previews: PreviewByCompetitorId = {};
          const normalized: StoredCompetitor[] = [];
          for (const row of fromApi) {
            const { previewResults: pr, syncStatus: _s, ...c } = row;
            normalized.push(c);
            if (Array.isArray(pr) && pr.length > 0) previews[c.id] = pr;
          }
          setCompetitors((prev) => {
            const byPackage = new Map(prev.map((c) => [c.packageId, c]));
            for (const fresh of normalized) byPackage.set(fresh.packageId, fresh);
            return [...byPackage.values()];
          });
          if (Object.keys(previews).length > 0) {
            setPreviewByCompetitorId((prev) => ({ ...prev, ...previews }));
          }
          void refreshTrackedKeywordHints();
        }

        // Stop condition: the API signals that this competitor row is fully settled
        // (syncStatus === "complete"). This fires even when arrays are empty —
        // a legitimate zero-overlap result in a given market.
        const refreshed = fromApi.find((r) => r.id === selectedCompetitorId);
        const isComplete = refreshed?.syncStatus === "complete";

        if (isComplete || attempts >= MAX_ATTEMPTS) {
          window.clearInterval(intervalId);
          if (!cancelled) setOptimisticRetryPending(false);
        }
      } catch {
        /* network unavailable — silently ignore */
        if (attempts >= MAX_ATTEMPTS) {
          window.clearInterval(intervalId);
          if (!cancelled) setOptimisticRetryPending(false);
        }
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      setOptimisticRetryPending(false);
    };
    // Re-run only when dbLoadPending flips to false or the selected competitor changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoadPending, hydrated, selectedCompetitorId, workspaceId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    sessionStorage.setItem(storageKeyCompetitors(workspaceId), JSON.stringify(competitors));
  }, [competitors, hydrated, workspaceId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    sessionStorage.setItem(storageKeyTracked(workspaceId), JSON.stringify(trackedTerms));
  }, [trackedTerms, hydrated, workspaceId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    sessionStorage.setItem(storageKeyPreviews(workspaceId), JSON.stringify(previewByCompetitorId));
  }, [previewByCompetitorId, hydrated, workspaceId]);

  useEffect(() => {
    if (apps[0]?.id && !apps.some((a) => a.id === targetAppId)) {
      setTargetAppId(apps[0].id);
    }
  }, [apps, targetAppId]);

  useEffect(() => {
    setActiveCountry((cur) => {
      if (selectedCountries.includes(cur)) return cur;
      return selectedCountries[0] ?? cur;
    });
  }, [selectedCountries]);

  // Clear the custom keyword draft whenever the active country tab changes so the
  // user starts fresh for the new market and doesn't accidentally submit a
  // keyword against the wrong country.
  useEffect(() => {
    setCustomKeywordDraft("");
    setCustomKwConfirmDraft(null);
  }, [activeCountry]);

  useEffect(() => {
    if (!hydrated) return;
    if (competitors.length === 0) {
      setSelectedCompetitorId(null);
      return;
    }
    setSelectedCompetitorId((cur) => {
      if (cur && competitors.some((c) => c.id === cur)) return cur;
      return competitors[0]?.id ?? null;
    });
  }, [competitors, hydrated]);

  useEffect(() => {
    if (!selectedCompetitorId) {
      setPreviewResults(null);
      return;
    }
    setPreviewResults(previewByCompetitorId[selectedCompetitorId] ?? null);
  }, [selectedCompetitorId, previewByCompetitorId]);

  const selectCompetitor = useCallback((id: string) => {
    setSelectedCompetitorId(id);
  }, []);

  const focusAnalyzeSection = useCallback(() => {
    analyzeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const targetApp = useMemo(() => apps.find((a) => a.id === targetAppId), [apps, targetAppId]);

  const activeCompetitor = useMemo(
    () => competitors.find((c) => c.id === selectedCompetitorId) ?? competitors[0] ?? null,
    [competitors, selectedCompetitorId],
  );

  const activeCountryLabel = useMemo(
    () =>
      tCountries(
        `countries.${activeCountry}.label` as `countries.${SupportedCountryCode}.label`,
      ),
    [activeCountry, tCountries],
  );

  useEffect(() => {
    if (!activeCompetitor) {
      setCountryOverlapShared([]);
      return;
    }
    if (!previewResults?.length) {
      setCountryOverlapShared(activeCompetitor.shared);
      return;
    }
    if (!previewHasCountryBlock(previewResults, activeCountry)) {
      setCountryOverlapShared([]);
      return;
    }
    const insights = buildCompetitorSpyInsightsForCountry({
      competitor: activeCompetitor,
      previewResults,
      country: activeCountry,
      workspacePackage: targetApp?.package_name,
      trackedKeywords: trackedKeywordHints,
    });
    setCountryOverlapShared(insights?.shared ?? []);
  }, [
    activeCompetitor,
    activeCountry,
    previewResults,
    selectedCompetitorId,
    targetApp?.package_name,
    trackedKeywordHints,
  ]);

  // ── Hydrate sentiment + ASO audit from DB when the active competitor changes ─
  useEffect(() => {
    if (!activeCompetitor) return;
    const pkg = activeCompetitor.packageId;
    // If we already have in-memory results for this competitor, keep them.
    if (sentimentForPackage === pkg && sentimentResult !== null) return;

    if (activeCompetitor.sentiment) {
      setSentimentResult(activeCompetitor.sentiment);
      setSentimentForPackage(pkg);
    } else {
      // No persisted sentiment for this competitor — clear any stale state from
      // a previously selected competitor so the section shows the seed-derived fallback.
      setSentimentResult(null);
      setSentimentForPackage(null);
    }

    if (activeCompetitor.asoAudit) {
      setDbAsoAudit(activeCompetitor.asoAudit);
    } else {
      setDbAsoAudit(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompetitor?.packageId]);

  const countryTabCountries = useMemo(
    () => (selectedCountries.length > 1 ? selectedCountries : []),
    [selectedCountries],
  );

  const countryFilteredPreview = useMemo(
    () => filterSerperPreviewByCountry(previewResults, activeCountry),
    [previewResults, activeCountry],
  );

  const countryInsights = useMemo(() => {
    if (!activeCompetitor || !previewResults?.length) return null;
    if (!previewHasCountryBlock(previewResults, activeCountry)) return null;
    return buildCompetitorSpyInsightsForCountry({
      competitor: activeCompetitor,
      previewResults,
      country: activeCountry,
      workspacePackage: targetApp?.package_name,
      trackedKeywords: trackedKeywordHints,
    });
  }, [activeCompetitor, activeCountry, previewResults, targetApp?.package_name, trackedKeywordHints]);

  const gapRows = useMemo(
    () => gapRowsForCompetitorCountry(activeCompetitor, countryInsights),
    [activeCompetitor, countryInsights],
  );

  const sharedRows = useMemo((): (StoredCompetitorSharedRow & { isCustom?: boolean; hasLiveRanks?: boolean })[] => {
    if (!activeCompetitor) return [];
    const base = previewResults?.length ? countryOverlapShared : activeCompetitor.shared;

    // Automated rows come from the live preview path (countryOverlapShared) or the
    // DB snapshot — whichever is active.  Custom rows ALWAYS come from
    // activeCompetitor.shared directly, because countryOverlapShared is rebuilt from
    // Serper results which never contain custom entries, so they would be lost when
    // previewResults is present.
    const baseAutomated = base.filter((r) => !r.isCustom);
    const baseCustom = activeCompetitor.shared.filter((r) => r.isCustom === true);

    const automated = filterSharedRowsBothSidesTracked(baseAutomated).filter(
      (row) => !dismissedSharedKeywords.has(row.keyword.trim().toLowerCase()),
    );
    const seen = new Set(automated.map((r) => r.keyword.trim().toLowerCase()));

    // Append DB-persisted custom rows (survive F5), not filtered by rank.
    // Strict country filter: only show rows whose country matches the active tab.
    const custom: (StoredCompetitorSharedRow & { isCustom: true; hasLiveRanks: boolean })[] = [];
    const activeCountryKey = activeCountry.toLowerCase();
    for (const dbRow of baseCustom) {
      // If the row carries a country tag, only show it for the matching tab.
      if (dbRow.country && dbRow.country.toLowerCase() !== activeCountryKey) continue;
      const key = dbRow.keyword.trim().toLowerCase();
      if (seen.has(key) || dismissedSharedKeywords.has(key)) continue;
      seen.add(key);
      custom.push({ ...dbRow, isCustom: true, hasLiveRanks: true });
    }

    // Live custom rows added this session — filter strictly by active country tab.
    for (const liveRow of liveCustomRows) {
      if (liveRow.country.toLowerCase() !== activeCountryKey) continue;
      const key = liveRow.keyword.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      custom.push(liveRow);
    }

    // Legacy session keyword stack (plain strings without live ranks).
    for (const kw of sessionKeywordStack) {
      const trimmed = kw.trim();
      const key = trimmed.toLowerCase();
      if (trimmed.length < 2 || seen.has(key)) continue;
      seen.add(key);
      custom.push({
        keyword: trimmed,
        yourRank: null,
        theirRank: 0,
        isCustom: true,
        hasLiveRanks: false,
      });
    }
    // ── Single source of truth for "Your Rank" ─────────────────────────────
    // Patch yourRank on every row (automated + custom) from trackedKeywordHints
    // for the active country.  This ensures the Overlap table always shows the
    // same rank the Keyword Tracker shows for that term + country, eliminating
    // any stale DB snapshot or Serper-preview mismatch.
    const hintMap = new Map<string, number | null>();
    for (const h of trackedKeywordHints) {
      hintMap.set(h.term.trim().toLowerCase(), h.yourRank);
    }

    const patchRank = (
      row: StoredCompetitorSharedRow & { isCustom?: boolean; hasLiveRanks?: boolean },
    ) => {
      const k = row.keyword.trim().toLowerCase();
      if (hintMap.has(k)) return { ...row, yourRank: hintMap.get(k) ?? null };
      return row;
    };

    const all = [...automated.map(patchRank), ...custom.map(patchRank)];

    // ── Sort by competitor rank significance ────────────────────────────────
    // Rows with a real rank (< SERPER_RANK_NOT_IN_FIRST_PAGE = 101) float to the
    // top in ascending order (#1 before #2 before #15).  Unranked / sentinel rows
    // (theirRank >= 101 or null) sink to the bottom.
    const UNRANKED_SENTINEL = 101; // SERPER_RANK_NOT_IN_FIRST_PAGE
    all.sort((a, b) => {
      const ra = typeof a.theirRank === "number" && a.theirRank < UNRANKED_SENTINEL ? a.theirRank : Infinity;
      const rb = typeof b.theirRank === "number" && b.theirRank < UNRANKED_SENTINEL ? b.theirRank : Infinity;
      return ra - rb;
    });

    return all;
  }, [
    activeCompetitor,
    activeCountry,
    countryOverlapShared,
    dismissedSharedKeywords,
    liveCustomRows,
    previewResults,
    sessionKeywordStack,
    trackedKeywordHints,
  ]);

  const sharedEmptyTerritory = Boolean(
    activeCompetitor &&
      previewResults?.length &&
      previewHasCountryBlock(previewResults, activeCountry) &&
      countryOverlapShared.length === 0,
  );

  /**
   * When 2 competitors are tracked, build a keyword → theirRank lookup map for
   * the *inactive* competitor so the shared keyword table can show both rivals'
   * ranks side-by-side in the "Their Rank" column.
   */
  const inactiveCompetitor = useMemo(
    () =>
      competitors.length >= 2
        ? competitors.find((c) => c.id !== (activeCompetitor?.id ?? null)) ?? null
        : null,
    [competitors, activeCompetitor],
  );

  const inactiveCompetitorRankMap = useMemo((): Map<string, number> => {
    if (!inactiveCompetitor) return new Map();
    const map = new Map<string, number>();
    for (const row of inactiveCompetitor.shared) {
      if (typeof row.theirRank === "number") {
        map.set(row.keyword.trim().toLowerCase(), row.theirRank);
      }
    }
    return map;
  }, [inactiveCompetitor]);

  const gapEmptyVariant = useMemo((): CompetitorSpyGapEmptyVariant | null => {
    if (!hydrated || dbLoadPending) return null;
    if (competitors.length === 0) return "noCompetitors";
    if (!activeCompetitor) return null;
    const awaitingCountryPreview =
      previewPending ||
      (Boolean(previewResults?.length) &&
        !previewHasCountryBlock(previewResults, activeCountry));
    if (gapRows.length === 0 && awaitingCountryPreview) return "analyzing";
    if (gapRows.length === 0) return "noGaps";
    return null;
  }, [
    activeCompetitor,
    activeCountry,
    competitors.length,
    dbLoadPending,
    gapRows.length,
    hydrated,
    previewPending,
    previewResults,
  ]);

  const workspaceAppPlayLive = useMemo(
    () =>
      inferWorkspaceAppPlayLive(
        targetApp?.package_name,
        targetApp?.metadata,
        countryFilteredPreview.length ? countryFilteredPreview : previewResults,
      ),
    [countryFilteredPreview, previewResults, targetApp?.metadata, targetApp?.package_name],
  );

  const workspaceAppDisplayName = targetApp?.name?.trim() || t("gap.targetAppFallback");

  const bestRankForActive = useMemo(() => {
    if (!activeCompetitor) return null;
    const fromSerper = minPreviewRankForPackageInResults(
      countryFilteredPreview.length ? countryFilteredPreview : previewResults,
      activeCompetitor.packageId,
    );
    if (fromSerper != null) return fromSerper;
    const shared = countryInsights?.shared ?? activeCompetitor.shared;
    const nums = shared.map((s) => s.theirRank).filter((n) => typeof n === "number");
    if (!nums.length) return minTheirRankFromShared(activeCompetitor);
    return Math.min(...nums);
  }, [activeCompetitor, countryFilteredPreview, countryInsights, previewResults]);

  const liveTitleForActive = useMemo(() => {
    if (!activeCompetitor) return null;
    return liveTitleFromPreviewInResults(
      countryFilteredPreview.length ? countryFilteredPreview : previewResults,
      activeCompetitor.packageId,
    );
  }, [activeCompetitor, countryFilteredPreview, previewResults]);

  const metricsKeywordCount = countryInsights
    ? countryInsights.gaps.length + countryInsights.shared.length
    : activeCompetitor
      ? activeCompetitor.gaps.length + activeCompetitor.shared.length
      : 0;

  const quickWinItems = useMemo(() => {
    if (!activeCompetitor) return [];
    const plans = countryInsights?.quickWinPlans ?? activeCompetitor.quickWinPlans;
    const termsBase = countryInsights
      ? countryInsights.quickWinTerms
      : activeCompetitor.quickWinTerms;
    if (plans?.length) {
      return plans.map((p, i) => ({
        text: formatQuickWin(p),
        term: termsBase[i]?.trim() ?? (p.key === "tplGap" ? p.term : "keyword" in p ? p.keyword : ""),
      }));
    }
    return activeCompetitor.quickWins.map((w, i) => ({
      text: w,
      term: activeCompetitor.quickWinTerms[i]?.trim() ?? "",
    }));
  }, [activeCompetitor, countryInsights, formatQuickWin]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const pushListingOptimizer = useCallback(
    (keywords: string | string[], vulnerabilities?: string[]) => {
      const list = Array.isArray(keywords)
        ? keywords
        : keywords
            .split(/[,;\n]+/u)
            .map((s) => s.trim())
            .filter(Boolean);
      if (list.length) {
        setPlaystoreInjectedKeywordContext(list.join(", "));
      }
      if (vulnerabilities?.length) {
        setPlaystoreInjectedCompetitorVulnerabilities(vulnerabilities);
      }
      const appId = targetAppId || apps[0]?.id;
      const ok = navigateToListingOptimizer(
        router,
        workspaceId,
        list.join(", "),
        appId,
        vulnerabilities,
      );
      if (!ok) {
        toast.error(t("optimizerNavFailed"));
      }
    },
    [apps, router, targetAppId, workspaceId, t],
  );

  /** Executes after the credit confirm dialog is accepted. */
  const runSentimentAnalysis = useCallback(async () => {
    if (!activeCompetitor || sentimentBusy) return;
    setSentimentBusy(true);
    setSentimentError(null);
    const pkg = activeCompetitor.packageId;
    const seedKeywords = [
      ...(countryInsights?.topKeywords ?? activeCompetitor.topKeywords),
      ...(countryInsights?.gaps ?? activeCompetitor.gaps).map((g) => g.keyword),
    ].slice(0, 16);

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/competitors/sentiment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId: targetAppId || apps[0]?.id || "",
            competitorPackageName: pkg,
            countryCode: activeCountry,
            seedKeywords,
          }),
        },
      );
      const data = (await res.json()) as
        | { ok: true; result: SentimentResult; asoAudit?: AsoAuditData; creditsUsed: number }
        | { ok: false; error: { code: string; message: string } };

      if (!data.ok) {
        const errCode = (data as { ok: false; error: { code: string } }).error.code;
        setSentimentError(
          errCode === "insufficient_credits"
            ? t("reviewSentiment.errorInsufficient")
            : t("reviewSentiment.errorGeneral"),
        );
        return;
      }
      const okData = data as { ok: true; result: SentimentResult; asoAudit?: AsoAuditData };
      setSentimentResult(okData.result);
      setSentimentForPackage(pkg);
      if (okData.asoAudit) setDbAsoAudit(okData.asoAudit);
    } catch {
      setSentimentError(t("reviewSentiment.errorGeneral"));
    } finally {
      setSentimentBusy(false);
    }
  }, [
    activeCompetitor,
    activeCountry,
    apps,
    countryInsights,
    sentimentBusy,
    t,
    targetAppId,
    workspaceId,
  ]);

  const removeSharedRow = useCallback(
    (row: StoredCompetitorSharedRow & { isCustom?: boolean; hasLiveRanks?: boolean }) => {
      const key = row.keyword.trim().toLowerCase();
      if (!key) return;

      if (row.isCustom) {
        const rowCountry = (row.country ?? activeCountry).toLowerCase();

        // 1. Optimistically remove from all local state immediately.
        setLiveCustomRows((prev) =>
          prev.filter(
            (r) =>
              !(r.keyword.trim().toLowerCase() === key && r.country.toLowerCase() === rowCountry),
          ),
        );
        setSessionKeywordStack((prev) => prev.filter((x) => x.toLowerCase() !== key));

        // 2. Remove from competitors state so the row disappears from activeCompetitor.shared.
        setCompetitors((prev) =>
          prev.map((c) =>
            c.id === activeCompetitor?.id
              ? {
                  ...c,
                  shared: c.shared.filter(
                    (s) =>
                      !(
                        s.isCustom === true &&
                        s.keyword.trim().toLowerCase() === key &&
                        (s.country ?? "").toLowerCase() === rowCountry
                      ),
                  ),
                }
              : c,
          ),
        );

        // 3. Dispatch removal so trackedTermKeys and Auto-Tracking badge update instantly.
        setTrackedTerms((prev) => prev.filter((t) => t.toLowerCase() !== key));
        setTrackedKeywordHints((prev) => prev.filter((h) => h.term.toLowerCase() !== key));
        window.dispatchEvent(
          new CustomEvent<WorkspaceKeywordsChangedDetail>(WORKSPACE_KEYWORDS_CHANGED_EVENT, {
            detail: { workspaceId, removedTerms: [row.keyword.trim()] },
          }),
        );

        // 4. Server-side cascade: prune analysis_json.shared + delete from keywords table.
        const appId = targetAppId || apps[0]?.id;
        const competitorPackageId = activeCompetitor?.packageId;
        if (appId && competitorPackageId) {
          void fetch(
            `/api/workspaces/${workspaceId}/competitors/custom-keyword`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                appId,
                competitorPackageId,
                keyword: row.keyword.trim(),
                country: rowCountry,
              }),
            },
          ).catch((e) => {
            console.error("[removeSharedRow] cascade DELETE failed:", e);
          });
        }
        return;
      }

      // Non-custom rows: just hide locally (no DB record to remove).
      setDismissedSharedKeywords((prev) => new Set([...prev, key]));
    },
    [activeCompetitor, activeCountry, apps, targetAppId, workspaceId],
  );

  const addCustomKeywordToStack = useCallback(() => {
    const trimmed = customKeywordDraft.trim();
    if (trimmed.length < 2) {
      toast.error(tShared("addKeywordError"));
      return;
    }
    // Intercept — show credit confirmation before making the live API call.
    setCustomKwConfirmDraft(trimmed);
  }, [customKeywordDraft, tShared]);

  const executeCustomKeywordLive = useCallback(async (keyword: string) => {
    const trimmed = keyword.trim();
    if (trimmed.length < 2) return;
    const appId = targetAppId || apps[0]?.id;
    const competitorPackageId = activeCompetitor?.packageId;
    if (!appId || !competitorPackageId) {
      toast.error(tShared("addKeywordError"));
      return;
    }
    setCustomKwPending(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/competitors/custom-keyword`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId,
            competitorPackageId,
            keyword: trimmed,
            country: activeCountry,
          }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        yourRank?: number;
        theirRank?: number;
        keywordId?: string | null;
        autoTracked?: boolean;
        creditsRemaining?: number;
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !json.ok) {
        toast.error(json.error?.message ?? tShared("addKeywordError"));
        return;
      }

      const RANK_NOT_IN_PAGE = 101;
      const yourRank = typeof json.yourRank === "number" ? json.yourRank : null;
      const theirRank = typeof json.theirRank === "number" ? json.theirRank : RANK_NOT_IN_PAGE;
      const key = trimmed.toLowerCase();

      setLiveCustomRows((prev) =>
        prev.some(
          (r) =>
            r.keyword.trim().toLowerCase() === key &&
            r.country === activeCountry,
        )
          ? prev
          : [
              ...prev,
              {
                keyword: trimmed,
                yourRank: yourRank === RANK_NOT_IN_PAGE ? null : yourRank,
                theirRank,
                isCustom: true,
                hasLiveRanks: true,
                country: activeCountry,
              },
            ],
      );

      // If the server confirmed auto-tracking, immediately reflect the term in the
      // tracked sets so the "✓ Auto-Tracking" badge renders without waiting for a
      // full API refresh, and notify any Keyword Tracker page that is open in the
      // same tab via the shared event channel.
      if (json.autoTracked) {
        setTrackedTerms((prev) =>
          prev.some((t) => t.toLowerCase() === key) ? prev : [...prev, trimmed],
        );
        setTrackedKeywordHints((prev) => {
          const has = prev.some((h) => h.term.toLowerCase() === key);
          if (has) return prev;
          return [...prev, { term: trimmed, yourRank: yourRank === RANK_NOT_IN_PAGE ? null : yourRank }];
        });
        window.dispatchEvent(
          new CustomEvent<WorkspaceKeywordsChangedDetail>(WORKSPACE_KEYWORDS_CHANGED_EVENT, {
            detail: { workspaceId, addedTerms: [trimmed] },
          }),
        );
      }

      setCustomKeywordDraft("");
      toast.success(tShared("addKeywordSuccess", { keyword: trimmed }));
    } catch {
      toast.error(tShared("addKeywordError"));
    } finally {
      setCustomKwPending(false);
    }
  }, [activeCompetitor?.packageId, activeCountry, apps, targetAppId, tShared, workspaceId]);

  const removeCompetitorLocal = useCallback((id: string) => {
    setCompetitors((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setSelectedCompetitorId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      return next;
    });
    setPreviewByCompetitorId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const deleteCompetitor = useCallback(
    async (competitor: StoredCompetitor) => {
      setDeletePendingId(competitor.id);
      const isSessionOnly = competitor.id.startsWith("cmp_");
      try {
        if (!isSessionOnly) {
          const res = await fetch(
            `/api/workspaces/${workspaceId}/competitors/${encodeURIComponent(competitor.id)}`,
            { method: "DELETE" },
          );
          const json = (await res.json()) as { ok?: boolean; error?: { code?: string; message?: string } };
          if (!res.ok || !json.ok) {
            // 404 not_found means the row is already gone from the DB — treat it
            // as a successful deletion so the UI clears rather than surfacing an
            // error that confuses the user (they wanted it removed; it is removed).
            if (res.status !== 404 && json.error?.code !== "not_found") {
              toast.error(json.error?.message ?? t("manage.deleteError"));
              return;
            }
          }
        }
        removeCompetitorLocal(competitor.id);
        // Purge sessionStorage entry immediately so a subsequent mount does not
        // resurrect the deleted row from the session cache before the next DB fetch.
        try {
          if (typeof window !== "undefined") {
            sessionStorage.removeItem(storageKeyCompetitors(workspaceId));
            sessionStorage.removeItem(storageKeyPreviews(workspaceId));
          }
        } catch { /* private mode / quota */ }
        // Invalidate the Next.js router cache so any in-flight or cached GET
        // /competitors response is discarded and the next fetch returns the
        // post-deletion state from the database.
        router.refresh();
        toast.success(t("manage.deleteSuccess"));
      } catch {
        toast.error(t("manage.deleteError"));
      } finally {
        setDeletePendingId(null);
      }
    },
    [removeCompetitorLocal, t, workspaceId],
  );

  async function persistCompetitorAnalysis(
    competitor: StoredCompetitor,
    results: SerperPreviewCountry[],
    countries: SupportedCountryCode[],
  ) {
    try {
      // Merge any live custom rows for this competitor into the shared payload so
      // they are included in the POST body and survive the upsert.  The server also
      // preserves isCustom rows from the existing DB record, so this is belt-and-
      // suspenders: the client sends them explicitly and the server re-attaches any
      // that the client might not yet know about (e.g. added from another tab).
      const liveCustomForCompetitor = liveCustomRows.filter(
        // liveCustomRows are keyed per workspace-session, not per competitor, so we
        // can't filter by packageId here — include them all so nothing is lost.
        () => true,
      );
      const seenInBase = new Set(
        competitor.shared.map(
          (s) =>
            `${s.keyword.trim().toLowerCase()}|${(s.country ?? "").trim().toLowerCase()}`,
        ),
      );
      const extraCustom = liveCustomForCompetitor.filter(
        (r) =>
          !seenInBase.has(
            `${r.keyword.trim().toLowerCase()}|${r.country.trim().toLowerCase()}`,
          ),
      );
      const sharedWithCustom = [...competitor.shared, ...extraCustom];

      const res = await fetch(`/api/workspaces/${workspaceId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: competitor.query,
          displayName: competitor.displayName,
          packageId: competitor.packageId,
          countries,
          analysis: {
            query: competitor.query,
            topKeywords: competitor.topKeywords,
            shared: sharedWithCustom,
            quickWinPlans: competitor.quickWinPlans ?? [],
            quickWinTerms: competitor.quickWinTerms,
            gaps: competitor.gaps,
            previewResults: results,
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; id?: string };
      if (res.ok && json.ok && typeof json.id === "string") {
        setCompetitors((prev) =>
          prev.map((c) =>
            c.packageId === competitor.packageId ? { ...c, id: json.id! } : c,
          ),
        );
        setSelectedCompetitorId(json.id);
      }
    } catch {
      /* session cache remains usable */
    }
  }

  const blockingError = Boolean(appsLoadError);

  const applyCompetitorAnalysisToUi = useCallback(
    (next: StoredCompetitor, results: SerperPreviewCountry[] | null) => {
      setCompetitors((prev) => [next, ...prev.filter((p) => p.packageId !== next.packageId)]);
      setSelectedCompetitorId(next.id);
      setDismissedSharedKeywords(new Set());
      setSessionKeywordStack([]);
      setQuery("");
      if (Array.isArray(results) && results.length > 0) {
        setPreviewResults(results);
        setPreviewByCompetitorId((prev) => ({ ...prev, [next.id]: results }));
      }
    },
    [],
  );

  async function runAnalyze() {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      toast.error(t("add.errorEmpty"));
      return;
    }
    if (selectedCountries.length === 0) {
      toast.error(t("add.errorNoCountries"));
      return;
    }
    setAnalyzePending(true);
    setPreviewPending(true);
    setPreviewResults(null);

    let hydratedFromCache = false;
    try {
      let cached = findCachedCompetitorForQuery(competitors, trimmed);
      try {
        const fromApi = await fetchWorkspaceCompetitors(workspaceId);
        if (fromApi.length > 0) {
          const previews: PreviewByCompetitorId = {};
          const normalized: StoredCompetitor[] = [];
          for (const row of fromApi) {
            const { previewResults: pr, ...comp } = row;
            normalized.push(comp);
            if (Array.isArray(pr) && pr.length > 0) previews[comp.id] = pr;
          }
          setCompetitors((prev) => {
            const byPackage = new Map(prev.map((c) => [c.packageId, c]));
            for (const comp of normalized) byPackage.set(comp.packageId, comp);
            return [...byPackage.values()];
          });
          if (Object.keys(previews).length > 0) {
            setPreviewByCompetitorId((prev) => ({ ...prev, ...previews }));
          }
          cached = findCachedCompetitorForQuery(normalized, trimmed) ?? cached;
          if (cached) {
            const cachedPreview = previews[cached.id] ?? null;
            applyCompetitorAnalysisToUi(cached, cachedPreview);
            hydratedFromCache = true;
          }
        } else if (cached) {
          const cachedPreview = previewByCompetitorId[cached.id] ?? null;
          applyCompetitorAnalysisToUi(cached, cachedPreview);
          hydratedFromCache = true;
        }
      } catch {
        if (cached) {
          const cachedPreview = previewByCompetitorId[cached.id] ?? null;
          applyCompetitorAnalysisToUi(cached, cachedPreview);
          hydratedFromCache = true;
        }
      }

      const res = await fetch(`/api/serper/play-store-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          keyword: trimmed,
          countries: selectedCountries,
          restrictToPlayStore: true,
          pricingProfile: "competitor_spy",
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        results?: SerperPreviewCountry[];
        error?: { code?: string; message?: string; required?: number; remaining?: number };
      };
      const results = json.results;
      if (!res.ok || !json.ok || !Array.isArray(results)) {
        if (!hydratedFromCache) {
          if (res.status === 402 || json.error?.code === "insufficient_credits") {
            const req = json.error?.required;
            const rem = json.error?.remaining;
            if (typeof req === "number" && typeof rem === "number") {
              toast.error(
                tSerper("insufficientPreviewCredits", { required: req, remaining: rem }),
              );
            } else {
              toast.error(json.error?.message ?? tSerper("insufficientCredits"));
            }
          } else if (res.status === 503 || json.error?.code === "serper_not_configured") {
            toast.message(tSerper("configMissingTitle"), {
              description: tSerper("configMissingBody"),
            });
          } else if (json.error?.code === "search_error") {
            toast.error(tSerper("liveRanksUnavailable"));
          } else {
            toast.error(json.error?.message ?? tSerper("errorGeneric"));
          }
        }
        return;
      }

      const built = buildCompetitorSpyAnalysisFromPreview({
        query: trimmed,
        results,
        workspacePackage: targetApp?.package_name,
        trackedKeywords: trackedKeywordHints,
      });

      if (!built) {
        if (!hydratedFromCache) toast.error(t("add.errorNoMatch"));
        return;
      }

      const existingCompetitor = competitors.find((c) => c.packageId === built.packageId);
      const existingId = existingCompetitor?.id;

      // ── Carry forward custom rows across re-analysis ────────────────────────
      // built.shared contains only auto-detected Serper rows (CompetitorSpySharedRow,
      // no country field); we must re-attach any isCustom rows so they are not lost
      // when applyCompetitorAnalysisToUi replaces competitors state.
      //
      // Automated rows are keyed by keyword only (they have no country tag).
      // Custom rows are keyed by keyword+country to allow the same term in multiple markets.
      const automatedKeySet = new Set(
        built.shared.map((s) => s.keyword.trim().toLowerCase()),
      );
      // Collect custom rows from the existing DB-loaded competitor record.
      const existingCustom: StoredCompetitorSharedRow[] = (existingCompetitor?.shared ?? []).filter(
        (s) => s.isCustom === true,
      );
      // Also collect any live custom rows added this session.
      const sessionCustom: StoredCompetitorSharedRow[] = liveCustomRows.map((r) => ({
        keyword: r.keyword,
        yourRank: r.yourRank,
        theirRank: r.theirRank,
        isCustom: true as const,
        country: r.country,
      }));
      // Merge, deduplicating: skip custom rows whose keyword collides with an
      // automated row, and dedup custom rows against each other by keyword+country.
      const customSeen = new Set<string>();
      const carryForwardCustom: StoredCompetitorSharedRow[] = [];
      for (const row of [...existingCustom, ...sessionCustom]) {
        const kwLower = row.keyword.trim().toLowerCase();
        if (automatedKeySet.has(kwLower)) continue; // automated row wins
        const k = `${kwLower}|${(row.country ?? "").trim().toLowerCase()}`;
        if (!customSeen.has(k)) {
          customSeen.add(k);
          carryForwardCustom.push(row);
        }
      }

      const next: StoredCompetitor = {
        id: existingId ?? `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        query: built.query,
        displayName: built.displayName,
        packageId: built.packageId,
        topKeywords: built.topKeywords,
        shared: [...built.shared, ...carryForwardCustom],
        quickWins: [],
        quickWinPlans: built.quickWinPlans,
        quickWinTerms: built.quickWinTerms,
        gaps: built.gaps,
      };

      applyCompetitorAnalysisToUi(next, results);
      void persistCompetitorAnalysis(next, results, selectedCountries);
      toast.success(t("add.toastAnalyzed"));
    } catch {
      if (!hydratedFromCache) toast.error(tSerper("errorGeneric"));
    } finally {
      setPreviewPending(false);
      setAnalyzePending(false);
    }
  }

  function onAnalyzeRequest(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      toast.error(t("add.errorEmpty"));
      return;
    }
    if (selectedCountries.length === 0) {
      toast.error(t("add.errorNoCountries"));
      return;
    }
    if (analyzeCreditCost <= 0) {
      void runAnalyze();
      return;
    }
    setCreditsConfirmOpen(true);
  }

  async function executeTrackKeyword(term: string) {
    const trimmed = term.trim();
    const key = trimmed.toLowerCase();
    if (!key) return;
    if (trackedTermKeys.has(key)) {
      toast.info(t("gap.alreadyTracked"));
      return;
    }

    setOptimisticTracked((prev) => new Set(prev).add(key));

    if (!keywordTrackerEnabled) {
      setTrackedTerms((prev) => (prev.some((x) => x.toLowerCase() === key) ? prev : [...prev, trimmed]));
      toast.success(t("gap.trackLocalQueued"));
      return;
    }

    const appId = targetAppId || apps[0]?.id;
    if (!appId) {
      setOptimisticTracked((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      toast.error(t("gap.trackDisabledNoApps"));
      return;
    }

    setTrackPending(key);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: trimmed, appId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !json.ok) {
        if (json.error?.code === "duplicate_keyword") {
          setTrackedTerms((prev) =>
            prev.some((x) => x.toLowerCase() === key) ? prev : [...prev, trimmed],
          );
          setTrackedKeywordHints((prev) =>
            prev.some((h) => h.term.toLowerCase() === key)
              ? prev
              : [...prev, { term: trimmed, yourRank: null }],
          );
          startRankPollForTerm(trimmed);
          toast.info(t("gap.alreadyTracked"));
          return;
        }
        setOptimisticTracked((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        toast.error(json.error?.message ?? t("gap.trackToastError"));
        return;
      }

      setTrackedTerms((prev) => (prev.some((x) => x.toLowerCase() === key) ? prev : [...prev, trimmed]));
      setTrackedKeywordHints((prev) =>
        prev.some((h) => h.term.toLowerCase() === key)
          ? prev
          : [...prev, { term: trimmed, yourRank: null }],
      );
      startRankPollForTerm(trimmed);
    } catch {
      setOptimisticTracked((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      toast.error(t("gap.trackToastError"));
    } finally {
      setTrackPending(null);
    }
  }

  function onTrackKeyword(term: string) {
    const trimmed = term.trim();
    const key = trimmed.toLowerCase();
    if (!key) return;
    if (trackedTermKeys.has(key)) {
      toast.info(t("gap.alreadyTracked"));
      return;
    }
    // Route through the 1-credit confirmation dialog before executing.
    setTrackCreditsConfirmTerm(trimmed);
  }

  const isTracked = useCallback(
    (term: string) => trackedTermKeys.has(term.trim().toLowerCase()),
    [trackedTermKeys],
  );

  const gridDir = isRtl ? "rtl" : "ltr";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8" dir={gridDir}>
      <CompetitorSpyCreditsConfirmDialog
        open={creditsConfirmOpen}
        onOpenChange={setCreditsConfirmOpen}
        credits={analyzeCreditCost}
        isRtl={isRtl}
        onConfirm={() => void runAnalyze()}
      />

      {/* 1-credit confirmation gate before tracking a gap keyword */}
      <CompetitorSpyCreditsConfirmDialog
        open={trackCreditsConfirmTerm !== null}
        onOpenChange={(open) => {
          if (!open) setTrackCreditsConfirmTerm(null);
        }}
        credits={AI_CREDIT_COSTS.serper_preview_per_country}
        isRtl={isRtl}
        titleOverride={t("trackCreditsConfirm.title")}
        bodyOverride={t("trackCreditsConfirm.body", { credits: AI_CREDIT_COSTS.serper_preview_per_country })}
        confirmOverride={t("trackCreditsConfirm.confirm")}
        onConfirm={() => {
          const term = trackCreditsConfirmTerm;
          setTrackCreditsConfirmTerm(null);
          if (term) void executeTrackKeyword(term);
        }}
      />

      {/* 1-credit confirmation gate before adding a custom keyword (live rank check) */}
      <CompetitorSpyCreditsConfirmDialog
        open={customKwConfirmDraft !== null}
        onOpenChange={(open) => {
          if (!open) setCustomKwConfirmDraft(null);
        }}
        credits={AI_CREDIT_COSTS.serper_preview_per_country}
        isRtl={isRtl}
        titleOverride={tShared("customKeywordCreditsConfirm.title")}
        bodyOverride={tShared("customKeywordCreditsConfirm.body")}
        confirmOverride={tShared("customKeywordCreditsConfirm.confirm")}
        onConfirm={() => {
          const kw = customKwConfirmDraft;
          setCustomKwConfirmDraft(null);
          if (kw) void executeCustomKeywordLive(kw);
        }}
      />

      <CompetitorSpyManageSheet
        open={manageOpen}
        onOpenChange={setManageOpen}
        isRtl={isRtl}
        competitors={competitors}
        selectedCompetitorId={selectedCompetitorId}
        onSelect={selectCompetitor}
        onDelete={(c) => void deleteCompetitor(c)}
        deletePendingId={deletePendingId}
      />

      {blockingError ? (
        <div
          className="flex flex-col items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm text-rose-100/90">{appsLoadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          "grid min-h-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-stretch lg:gap-10",
          isRtl && "font-arabic",
        )}
        dir={gridDir}
      >
        <div className="min-h-0 min-w-0 space-y-8">
          <Card
            ref={analyzeSectionRef}
            className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
          >
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg font-semibold text-white">{t("add.title")}</CardTitle>
              <CardDescription className="text-zinc-400">{t("add.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {keywordTrackerEnabled && apps.length > 0 ? (
                <label className="flex max-w-md flex-col gap-1.5 text-sm">
                  <span className="font-medium text-zinc-300">{t("gap.targetAppLabel")}</span>
                  <select
                    value={targetAppId}
                    onChange={(e) => setTargetAppId(e.target.value)}
                    className="h-11 rounded-md border border-white/[0.1] bg-[#070a0f] px-3 text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <CountrySelector
                value={selectedCountries}
                onChange={setSelectedCountries}
                disabled={blockingError}
              />

              {countryTabCountries.length > 0 ? (
                <CompetitorSpyCountryTabs
                  countries={countryTabCountries}
                  activeCountry={activeCountry}
                  onActiveCountryChange={setActiveCountry}
                  isRtl={isRtl}
                />
              ) : null}

              {/* ── Max-competitors warning ───────────────────────────────── */}
              {competitors.length >= 2 ? (
                <div
                  className={cn(
                    "flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200",
                    isRtl && "flex-row-reverse text-end",
                  )}
                  role="alert"
                >
                  <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>⚠️</span>
                  <div className="space-y-1">
                    <p className="font-semibold">Maximum of 2 tracked competitors reached</p>
                    <p className="text-xs leading-relaxed text-amber-200/70">
                      Remove an existing competitor via <button
                        type="button"
                        className="underline underline-offset-2 hover:text-amber-100 transition-colors"
                        onClick={() => setManageOpen(true)}
                      >Manage Competitors</button> to add a new one.
                    </p>
                  </div>
                </div>
              ) : null}

              <form
                className={cn(
                  "flex w-full flex-col gap-4 md:items-start md:justify-between",
                  isRtl ? "md:flex-row-reverse" : "md:flex-row",
                  competitors.length >= 2 && "pointer-events-none opacity-50",
                )}
                onSubmit={onAnalyzeRequest}
              >
                <div className="w-full flex-1 max-w-2xl space-y-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      competitors.length >= 2
                        ? "Slot limit reached (2/2). Delete a competitor below to add a new one."
                        : t("add.placeholder")
                    }
                    disabled={blockingError || competitors.length >= 2}
                    className="h-11 border-white/[0.1] bg-[#070a0f] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-emerald-500/40"
                  />
                  <div className="space-y-1.5 text-sm text-zinc-400">
                    <p className="text-xs leading-relaxed">{t("add.aiHelper")}</p>
                    <p className="text-xs text-zinc-500">
                      {t("add.helper")}{" "}
                      <span className="text-zinc-600">{t("add.example")}</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {t("add.creditsHint", {
                        credits: analyzeCreditCost,
                        markets: selectedCountries.length,
                      })}
                    </p>
                  </div>
                </div>
                <div className="w-full shrink-0 md:w-auto">
                  <TooltipProvider>
                    <Tooltip
                      content={t("add.analyzeInfoTooltip")}
                      side="top"
                      className="max-w-[300px]"
                      asChild
                    >
                      <Button
                        type="submit"
                        disabled={
                          analyzePending ||
                          query.trim().length < 2 ||
                          blockingError ||
                          selectedCountries.length === 0 ||
                          competitors.length >= 2
                        }
                        className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
                      >
                        {analyzePending ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            {t("add.buttonPending")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            {analyzeCreditCost === 5
                              ? t("add.buttonFiveCredits")
                              : t("add.buttonWithCredits", { credits: analyzeCreditCost })}
                            <Info className="size-3.5 shrink-0 opacity-70" aria-hidden />
                          </span>
                        )}
                      </Button>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </form>

              {previewPending && !previewResults ? (
                <p className="inline-flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {tSerper("loading")}
                </p>
              ) : null}
              {countryFilteredPreview.length > 0 && activeCompetitor ? (
                <SerperPreviewResults
                  results={countryFilteredPreview}
                  packageName={targetApp?.package_name?.trim() || undefined}
                  appDisplayName={targetApp?.name}
                  playStoreLinks="canonical"
                  isRtl={isRtl}
                />
              ) : null}
            </CardContent>
          </Card>

          {activeCompetitor && countryTabCountries.length > 0 ? (
            <CompetitorSpyCountryTabs
              countries={countryTabCountries}
              activeCountry={activeCountry}
              onActiveCountryChange={setActiveCountry}
              isRtl={isRtl}
            />
          ) : null}

          {activeCompetitor ? (
            <section className="space-y-3" aria-labelledby="shared-keywords-heading">
              <div
                className={cn(
                  "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
                  isRtl && "sm:flex-row-reverse",
                )}
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {t("sections.sharedKicker")}
                  </p>
                  <h2
                    id="shared-keywords-heading"
                    className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
                  >
                    {t("shared.title", { name: activeCompetitor.displayName })}
                  </h2>
                </div>
                <div
                  className={cn(
                    "flex w-full shrink-0 items-center gap-2 sm:w-auto sm:max-w-md",
                    isRtl && "flex-row-reverse",
                  )}
                >
                  <Input
                    value={customKeywordDraft}
                    onChange={(e) => setCustomKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomKeywordToStack();
                      }
                    }}
                    placeholder={tShared("addKeywordPlaceholderCountry", { country: activeCountryLabel })}
                    className="h-9 flex-1 border-white/10 bg-[#070a0f] text-sm text-zinc-100 placeholder:text-zinc-500"
                    aria-label={tShared("addKeywordPlaceholderCountry", { country: activeCountryLabel })}
                    disabled={customKwPending}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-white/10 text-zinc-200"
                    onClick={addCustomKeywordToStack}
                    disabled={customKwPending}
                  >
                    {customKwPending ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Plus className="size-3.5" aria-hidden />
                    )}
                    {tShared("addCustomKeyword")}
                  </Button>
                </div>
              </div>

              {/* ── Explainer banner ──────────────────────────────────────────── */}
              <div
                className={cn(
                  "rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 sm:px-5",
                  isRtl && "font-arabic",
                )}
                dir={gridDir}
              >
                <p
                  className={cn(
                    "mb-3 text-sm font-semibold text-emerald-300",
                    isRtl ? "text-end" : "text-start",
                  )}
                >
                  {tShared("explainer.title")}
                </p>
                <div className="space-y-3">
                  {/* Trailing keywords step */}
                  <div
                    className={cn(
                      "flex gap-3",
                      isRtl ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-[10px] font-bold text-rose-300">
                      1
                    </span>
                    <div className={cn("space-y-0.5", isRtl ? "text-end" : "text-start")}>
                      <p className="text-xs font-semibold text-rose-300">
                        {tShared("explainer.trailingLabel")}
                      </p>
                      <p className="text-xs leading-relaxed text-zinc-400">
                        {tShared("explainer.trailingBody")}
                      </p>
                    </div>
                  </div>
                  {/* Leading keywords step */}
                  <div
                    className={cn(
                      "flex gap-3",
                      isRtl ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-300">
                      2
                    </span>
                    <div className={cn("space-y-0.5", isRtl ? "text-end" : "text-start")}>
                      <p className="text-xs font-semibold text-emerald-300">
                        {tShared("explainer.leadingLabel")}
                      </p>
                      <p className="text-xs leading-relaxed text-zinc-400">
                        {tShared("explainer.leadingBody")}
                      </p>
                    </div>
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-3 text-[11px] leading-relaxed text-zinc-500",
                    isRtl ? "text-end" : "text-start",
                  )}
                >
                  {tShared("explainer.cta")}
                </p>
              </div>

              {(dbLoadPending || previewPending || optimisticRetryPending) && !previewResults ? (
                <SharedKeywordsTableSkeletonBody
                  isRtl={isRtl}
                  label={optimisticRetryPending ? "Syncing live search visibility matrices across regional markets..." : tShared("loadingSkeleton")}
                  syncingMessage={optimisticRetryPending ? "Syncing live search visibility matrices across regional markets..." : undefined}
                />
              ) : (
              <TooltipProvider>
              <div
                className={cn(
                  "overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1018]",
                  isRtl && "font-arabic",
                )}
                dir={gridDir}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] table-fixed border-collapse text-start text-sm">
                    <colgroup>
                      <col className="w-1/3" />
                      <col className="w-1/4" />
                      <col className="w-1/4" />
                      <col className="w-12" />
                    </colgroup>
                    <thead className="border-b border-white/[0.06] bg-[#070a0f] text-xs text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 text-start font-medium">{t("gap.columns.keyword")}</th>
                        <th className="px-4 py-3 text-center font-medium">
                          <span className="inline-flex items-center justify-center gap-1">
                            {t("myCompetitors.yourRank")}
                            <Tooltip
                              content={tShared("columns.yourRankTooltip")}
                              side="top"
                              asChild
                            >
                              <button
                                type="button"
                                className="cursor-default rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                                aria-label={tShared("columns.yourRankTooltip")}
                              >
                                <Info className="size-3 text-zinc-500 hover:text-zinc-300 transition-colors" aria-hidden />
                              </button>
                            </Tooltip>
                          </span>
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                          <span className="inline-flex items-center justify-center gap-1">
                            {t("myCompetitors.theirRank")}
                            <Tooltip
                              content={tShared("columns.theirRankTooltip")}
                              side="top"
                              asChild
                            >
                              <button
                                type="button"
                                className="cursor-default rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                                aria-label={tShared("columns.theirRankTooltip")}
                              >
                                <Info className="size-3 text-zinc-500 hover:text-zinc-300 transition-colors" aria-hidden />
                              </button>
                            </Tooltip>
                          </span>
                        </th>
                        <th className="w-12 px-4 py-3 text-end font-medium">{tShared("columns.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharedRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center">
                            {sharedEmptyTerritory || previewResults?.length ? (
                              <>
                                <p className="text-sm font-medium text-zinc-300">
                                  {sharedEmptyTerritory
                                    ? t("shared.emptyTerritoryTitle")
                                    : t("shared.emptyAfterAnalyzeTitle")}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                                  {sharedEmptyTerritory
                                    ? t("shared.emptyTerritoryBody", {
                                        competitor: activeCompetitor?.displayName ?? "",
                                        country: activeCountryLabel,
                                      })
                                    : t("shared.emptyAfterAnalyzeBody")}
                                </p>
                              </>
                            ) : (
                              <div className="mx-auto max-w-sm space-y-2 rounded-xl border border-white/[0.06] bg-[#080c12] px-5 py-6">
                                <p className="text-sm font-semibold text-zinc-200">
                                  {tShared("noSharedTitle")}
                                </p>
                                <p className="text-xs leading-relaxed text-zinc-500">
                                  {tShared("noSharedBody")}
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : (
                        sharedRows.map((row) => (
                          <tr
                            key={row.keyword}
                            className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]"
                          >
                            <td className="overflow-hidden px-4 py-3 text-start text-zinc-200">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate">{row.keyword}</span>
                                {row.isCustom && row.country ? (
                                  <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-medium text-[10px] text-zinc-400">
                                    {countryBadgeLabel(row.country)}
                                  </span>
                                ) : null}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-zinc-400">
                              {row.isCustom && !row.hasLiveRanks ? (
                                <span className="inline-flex items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-xs text-zinc-500">
                                  —
                                </span>
                              ) : (
                                <span className="inline-flex justify-center">
                                  <RankDisplay
                                    rank={row.yourRank}
                                    labels={rankLabels}
                                    context={{
                                      column: "yours",
                                      workspaceAppLive: workspaceAppPlayLive,
                                    }}
                                  />
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-medium text-emerald-300/90">
                              {row.isCustom && !row.hasLiveRanks ? (
                                <span className="inline-flex items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-xs text-zinc-500">
                                  —
                                </span>
                              ) : inactiveCompetitor ? (
                                /* Dual-competitor mode: show both rivals' ranks side-by-side */
                                <span className="inline-flex items-center justify-center gap-2">
                                  {/* Active competitor rank */}
                                  <span className="inline-flex flex-col items-center gap-0.5">
                                    <span
                                      className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold"
                                      style={{ background: "rgba(16,185,129,0.15)", color: "rgb(167,243,208)" }}
                                      title={activeCompetitor?.displayName}
                                      aria-hidden
                                    >
                                      {(activeCompetitor?.displayName[0] ?? "?").toUpperCase()}
                                    </span>
                                    <RankDisplay
                                      rank={row.theirRank}
                                      labels={rankLabels}
                                      context={{ column: "theirs" }}
                                      emphasize
                                    />
                                  </span>
                                  <span className="h-6 w-px bg-white/[0.08]" aria-hidden />
                                  {/* Inactive competitor rank */}
                                  <span className="inline-flex flex-col items-center gap-0.5">
                                    <span
                                      className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold bg-zinc-700/60 text-zinc-400"
                                      title={inactiveCompetitor.displayName}
                                      aria-hidden
                                    >
                                      {(inactiveCompetitor.displayName[0] ?? "?").toUpperCase()}
                                    </span>
                                    {(() => {
                                      const kwKey = row.keyword.trim().toLowerCase();
                                      const inactiveRank = inactiveCompetitorRankMap.get(kwKey) ?? null;
                                      return (
                                        <RankDisplay
                                          rank={inactiveRank}
                                          labels={rankLabels}
                                          context={{ column: "theirs" }}
                                        />
                                      );
                                    })()}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex justify-center">
                                  <RankDisplay
                                    rank={row.theirRank}
                                    labels={rankLabels}
                                    context={{ column: "theirs" }}
                                    emphasize
                                  />
                                </span>
                              )}
                            </td>
                            <td className="w-12 px-4 py-3 text-end">
                              {row.isCustom && trackedTermKeys.has(row.keyword.trim().toLowerCase()) ? (
                                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 whitespace-nowrap">
                                  {tShared("columns.autoTracking")}
                                </span>
                              ) : (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-zinc-400 hover:text-rose-300"
                                  aria-label={tShared("removeAria", { keyword: row.keyword })}
                                  onClick={() => removeSharedRow(row)}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              </TooltipProvider>
              )}
            </section>
          ) : null}

          <section className="space-y-4" aria-labelledby="gap-heading">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t("sections.gapKicker")}
              </p>
              <div
                className={cn(
                  "flex flex-wrap items-baseline gap-x-2 gap-y-2",
                  isRtl ? "flex-row-reverse justify-end" : "flex-row",
                )}
              >
                <h2 id="gap-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {t("gap.title")}
                </h2>
                <Badge
                  variant="outline"
                  className="shrink-0 border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/90"
                >
                  {t("sections.aiBadge")}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-zinc-400">{t("gap.subtitle")}</p>
            </div>

            <CompetitorSpyKeywordGapTable
              isRtl={isRtl}
              rows={gapRows}
              emptyVariant={gapEmptyVariant}
              onEmptyCta={focusAnalyzeSection}
              blockingError={blockingError}
              keywordTrackerEnabled={keywordTrackerEnabled}
              hasApps={apps.length > 0}
              trackPending={trackPending}
              isTracked={isTracked}
              onTrack={(term) => void onTrackKeyword(term)}
              rankLabels={rankLabels}
              workspaceAppLive={workspaceAppPlayLive}
            />
            {gapRows.length > 0 ? (
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
                  isRtl && "font-arabic",
                )}
                dir={gridDir}
              >
                <p className="text-sm leading-relaxed text-emerald-50/90">{t("gap.sendOptimizerHint")}</p>
                <Button
                  type="button"
                  className="w-full shrink-0 border border-emerald-400/35 bg-emerald-600 text-white hover:bg-emerald-500 sm:w-auto"
                  disabled={blockingError}
                  onClick={() =>
                    pushListingOptimizer(gapRows.map((r) => r.keyword).filter(Boolean).slice(0, 24))
                  }
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Sparkles className="size-4 shrink-0 opacity-90" aria-hidden />
                    {t("quickWins.ctaOptimizer")}
                  </span>
                </Button>
              </div>
            ) : null}
          </section>

          <section className="space-y-4" aria-labelledby="quick-wins-heading">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t("sections.quickWinsKicker")}
              </p>
              <div
                className={cn(
                  "flex flex-wrap items-baseline gap-x-2 gap-y-2",
                  isRtl ? "flex-row-reverse justify-end" : "flex-row",
                )}
              >
                <h2 id="quick-wins-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {t("quickWins.title")}
                </h2>
                <Badge
                  variant="outline"
                  className="shrink-0 border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/90"
                >
                  {t("sections.aiBadge")}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-zinc-400">{t("quickWins.subtitle")}</p>
            </div>

            {!hydrated ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0a0e14]">
                <Loader2 className="size-8 animate-spin text-emerald-500/60" aria-hidden />
                <span className="sr-only">{t("loading")}</span>
              </div>
            ) : !activeCompetitor ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.1] bg-[#080c12] px-6 py-12 text-center">
                <Crosshair className="size-10 text-emerald-500/40" aria-hidden />
                <p className="max-w-md text-sm text-zinc-500">{t("quickWins.empty")}</p>
              </div>
            ) : quickWinItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.1] bg-[#080c12] px-6 py-12 text-center">
                <Crosshair className="size-10 text-emerald-500/40" aria-hidden />
                <p className="max-w-md text-sm text-zinc-500">
                  {optimisticRetryPending
                    ? "Syncing live search visibility matrices across regional markets..."
                    : t("quickWins.empty")}
                </p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                {quickWinItems.map((item, i) => (
                  <li key={`${item.text}-${i}`}>
                    <Card className="h-full border-white/[0.08] bg-[#0c1018] text-zinc-100 ring-1 ring-white/[0.03] transition-[border-color,box-shadow] hover:border-emerald-500/20 hover:shadow-[0_8px_28px_-16px_rgba(16,185,129,0.12)]">
                      <CardContent className="flex h-full flex-col gap-4 p-5">
                        <div
                          className={cn(
                            "flex items-start gap-3",
                            isRtl && "flex-row-reverse text-end",
                          )}
                        >
                          <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-400/90" aria-hidden />
                          <p className="text-sm leading-relaxed text-zinc-300">{item.text}</p>
                        </div>
                        <Button
                          type="button"
                          className="mt-auto w-full border border-emerald-400/30 bg-emerald-600 text-white hover:bg-emerald-500"
                          disabled={!item.term}
                          onClick={() => pushListingOptimizer([item.term])}
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            <Sparkles className="size-4 opacity-90" aria-hidden />
                            {t("quickWins.ctaOptimizer")}
                          </span>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Review Insights & Sentiment ─────────────────────────────── */}
          {(() => {
            // Determine whether we have live AI results or are showing the
            // static seed-derived preview (only when a competitor is active).
            const liveResult =
              sentimentResult &&
              sentimentForPackage === activeCompetitor?.packageId
                ? sentimentResult
                : null;

            // Static seed preview (shown before first AI run)
            const seedPraise: string[] = activeCompetitor
              ? (countryInsights?.topKeywords ?? activeCompetitor.topKeywords).slice(0, 4)
              : [];
            const seedBugs: string[] = activeCompetitor
              ? (countryInsights?.gaps ?? activeCompetitor.gaps)
                  .filter((g) => g.opportunity === "high")
                  .map((g) => g.keyword)
                  .slice(0, 4)
              : [];
            const seedRequests: string[] = activeCompetitor
              ? (activeCompetitor.quickWinTerms ?? []).slice(0, 4)
              : [];

            const praiseTerms = liveResult?.topPraiseKeywords ?? seedPraise;
            const bugTerms = liveResult?.reportedBugsKeywords ?? seedBugs;
            const requestTerms = liveResult?.featureRequestsKeywords ?? seedRequests;

            // Target keywords: high-intent search phrases only — praise + feature requests.
            // Bugs/pain-points are passed separately as vulnerabilities for prompt inversion,
            // never injected as raw search keywords.
            const exploitKeywords = [
              ...praiseTerms,
              ...requestTerms.slice(0, 3),
              // When a second competitor is tracked, fold in their quick-win ranking
              // terms so the optimizer receives cross-rival keyword coverage.
              ...(inactiveCompetitor
                ? inactiveCompetitor.quickWinTerms.slice(0, 3).filter(Boolean)
                : []),
            ].filter(Boolean);
            // Vulnerabilities: competitor pain-points to be inverted into positive angles.
            // Merge from both rivals so the LLM prompt addresses weaknesses across the board.
            const exploitVulnerabilities = [
              ...bugTerms,
              ...(inactiveCompetitor?.gaps
                .filter((g) => g.opportunity === "high")
                .map((g) => g.keyword)
                .slice(0, 3) ?? []),
            ].filter(Boolean);
            // Legacy alias used by the CTA visibility guard below.
            const exploitTerms = exploitKeywords;

            return (
              <>
                {/* ── Credit confirmation dialog ──────────────────────────── */}
                {sentimentConfirmOpen ? (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sentiment-confirm-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    dir={isRtl ? "rtl" : "ltr"}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setSentimentConfirmOpen(false);
                    }}
                  >
                    <div
                      className={cn(
                        "mx-4 w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0c1018] p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)]",
                        isRtl && "font-arabic",
                      )}
                    >
                      <h2
                        id="sentiment-confirm-title"
                        className="mb-2 text-base font-semibold text-white"
                      >
                        {t("reviewSentiment.confirmTitle")}
                      </h2>
                      <p className="mb-6 text-sm leading-relaxed text-zinc-400">
                        {t("reviewSentiment.confirmBody")}
                      </p>
                      <div className={cn("flex gap-3", isRtl ? "flex-row-reverse" : "flex-row")}>
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                          onClick={() => setSentimentConfirmOpen(false)}
                        >
                          {t("reviewSentiment.confirmCancel")}
                        </Button>
                        <Button
                          type="button"
                          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
                          onClick={() => {
                            setSentimentConfirmOpen(false);
                            void runSentimentAnalysis();
                          }}
                        >
                          {t("reviewSentiment.confirmProceed")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <section
                  className="space-y-4"
                  aria-labelledby="review-sentiment-heading"
                  dir={isRtl ? "rtl" : "ltr"}
                >
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      {t("reviewSentiment.sectionKicker")}
                    </p>
                    <div
                      className={cn(
                        "flex flex-wrap items-baseline gap-x-2 gap-y-2",
                        isRtl ? "flex-row-reverse justify-end" : "flex-row",
                      )}
                    >
                      <h2
                        id="review-sentiment-heading"
                        className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
                      >
                        {t("reviewSentiment.sectionTitle")}
                      </h2>
                      <Badge
                        variant="outline"
                        className="shrink-0 border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/90"
                      >
                        {liveResult
                          ? t("reviewSentiment.liveResultsLabel")
                          : t("sections.aiBadge")}
                      </Badge>
                    </div>
                    <p className="max-w-2xl text-sm text-zinc-400">
                      {t("reviewSentiment.sectionSubtitle")}
                    </p>
                  </div>

                  {!hydrated ? (
                    <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0a0e14]">
                      <Loader2 className="size-8 animate-spin text-emerald-500/60" aria-hidden />
                      <span className="sr-only">{t("loading")}</span>
                    </div>
                  ) : !activeCompetitor ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.1] bg-[#080c12] px-6 py-12 text-center">
                      <Crosshair className="size-10 text-emerald-500/40" aria-hidden />
                      <p className="font-medium text-zinc-300">
                        {t("reviewSentiment.emptyTitle")}
                      </p>
                      <p className="max-w-md text-sm text-zinc-500">
                        {t("reviewSentiment.emptyBody")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Error banner */}
                      {sentimentError ? (
                        <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
                          {sentimentError}
                        </p>
                      ) : null}

                      {/* Analyze / Re-analyze button */}
                      <div className={cn("flex", isRtl ? "justify-end" : "justify-start")}>
                        <Button
                          type="button"
                          size="sm"
                          disabled={sentimentBusy}
                          className={cn(
                            "gap-2 border border-emerald-500/30 bg-emerald-600/80 text-white hover:bg-emerald-500",
                            sentimentBusy && "cursor-not-allowed opacity-60",
                          )}
                          onClick={() => setSentimentConfirmOpen(true)}
                        >
                          {sentimentBusy ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              {t("reviewSentiment.analyzingBtn")}
                            </>
                          ) : liveResult ? (
                            <>
                              <Sparkles className="size-3.5" aria-hidden />
                              {t("reviewSentiment.refreshBtn")}
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-3.5" aria-hidden />
                              {t("reviewSentiment.analyzeBtn")}
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Three chip buckets */}
                      <div className="grid gap-4 sm:grid-cols-3">
                        {/* Praise bucket — green */}
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-base" aria-hidden>✅</span>
                            <span className="text-sm font-semibold text-emerald-300">
                              {t("reviewSentiment.bucketPraiseTitle")}
                            </span>
                          </div>
                          <p className="mb-3 text-xs text-emerald-300/60">
                            {t("reviewSentiment.bucketPraiseSubtitle")}
                          </p>
                          {praiseTerms.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {praiseTerms.map((term, i) => (
                                <span
                                  key={`praise-${i}-${term}`}
                                  className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/25"
                                >
                                  {term}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-600">—</p>
                          )}
                        </div>

                        {/* Bugs bucket — red */}
                        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-base" aria-hidden>🐛</span>
                            <span className="text-sm font-semibold text-rose-300">
                              {t("reviewSentiment.bucketBugsTitle")}
                            </span>
                          </div>
                          <p className="mb-3 text-xs text-rose-300/60">
                            {t("reviewSentiment.bucketBugsSubtitle")}
                          </p>
                          {bugTerms.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {bugTerms.map((term, i) => (
                                <span
                                  key={`bug-${i}-${term}`}
                                  className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-500/25"
                                >
                                  {term}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-600">—</p>
                          )}
                        </div>

                        {/* Feature requests bucket — indigo */}
                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-base" aria-hidden>💡</span>
                            <span className="text-sm font-semibold text-indigo-300">
                              {t("reviewSentiment.bucketRequestsTitle")}
                            </span>
                          </div>
                          <p className="mb-3 text-xs text-indigo-300/60">
                            {t("reviewSentiment.bucketRequestsSubtitle")}
                          </p>
                          {requestTerms.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {requestTerms.map((term, i) => (
                                <span
                                  key={`req-${i}-${term}`}
                                  className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-200 ring-1 ring-indigo-500/25"
                                >
                                  {term}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-600">—</p>
                          )}
                        </div>
                      </div>

                      {/* Exploit with AI Optimizer CTA */}
                      {exploitTerms.length > 0 ? (
                        <OptimizerWorkspace workspaceId={workspaceId}>
                          <div className="flex flex-col gap-2">
                          <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300/80 ring-1 ring-amber-500/20">
                            {t("reviewSentiment.exploitBadge")}
                          </p>
                          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                            <p className="text-sm text-amber-200/80">
                              {t("reviewSentiment.exploitTooltip")}
                            </p>
                            <TooltipProvider>
                              <Tooltip
                                content={t("reviewSentiment.exploitInfoTooltip")}
                                side="top"
                                className="max-w-[300px]"
                                asChild
                              >
                                <Button
                                    type="button"
                                    size="sm"
                                    className="shrink-0 border border-amber-400/30 bg-amber-500/80 text-white hover:bg-amber-400"
                                    // Here we call the 'stage' function instead of the old pushListingOptimizer
                                    onClick={() => stage({ 
                                      action: "exploit_data", 
                                      data: { keywords: exploitKeywords, vulnerabilities: exploitVulnerabilities } 
                                    })}
                                  >
                                    <Sparkles className="me-1.5 size-3.5 shrink-0" aria-hidden />
                                    {t("reviewSentiment.exploitCta")}
                                    <Info className="ms-1.5 size-3 shrink-0 opacity-70" aria-hidden />
                                  </Button>
                  
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          </div>
                        </OptimizerWorkspace>
                      ) : null}

                      {/* Disclaimer */}
                      <p className="text-[11px] text-zinc-600">
                        {liveResult
                          ? t("reviewSentiment.insightDisclaimer").replace(
                              "AI-inferred from keyword and gap analysis",
                              "generated by live AI analysis",
                            )
                          : t("reviewSentiment.insightDisclaimer")}
                      </p>
                    </div>
                  )}
                </section>
              </>
            );
          })()}

        </div>

        {/* RHS snapshot panel — min-h prevents CLS collapse while competitor data swaps */}
        <div className="flex min-h-[420px] min-w-0 flex-col lg:border-s lg:border-white/[0.06] lg:ps-10">

          {/* ── Dual Competitor Micro-Tab Switcher (when 2 tracked) ──────── */}
          {competitors.length >= 2 ? (
            <div
              dir={isRtl ? "rtl" : "ltr"}
              className={cn("mb-5", isRtl && "font-arabic")}
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                Competitor
              </p>
              <div
                className={cn(
                  "flex gap-1 rounded-lg bg-zinc-900 p-1",
                  isRtl && "flex-row-reverse",
                )}
                role="tablist"
                aria-label="Select competitor"
              >
                {competitors.slice(0, 2).map((comp, idx) => {
                  const isActive = comp.id === selectedCompetitorId;
                  const compMinRank = minTheirRankFromShared(comp);
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => selectCompetitor(comp.id)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-start text-sm font-medium transition-all duration-150",
                        isActive
                          ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/[0.08]"
                          : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300",
                      )}
                    >
                      {/* Slot number pill */}
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                          isActive
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-zinc-700/60 text-zinc-500",
                        )}
                        aria-hidden
                      >
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate leading-tight">
                        {comp.displayName}
                      </span>
                      {compMinRank != null && compMinRank < 101 ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ring-1",
                            isActive
                              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25"
                              : "bg-zinc-800 text-zinc-500 ring-zinc-700/40",
                          )}
                        >
                          #{compMinRank}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeCompetitor ? (
            (() => {
              // Build keyword array for staging vault
              const competitorKeywords = [
                ...(countryInsights?.topKeywords ?? activeCompetitor.topKeywords),
                ...(countryInsights?.gaps ?? activeCompetitor.gaps).map((g) => g.keyword),
              ].filter(Boolean);

              return (
                <CompetitorSpySnapshotCard
                  isRtl={isRtl}
                  workspaceId={workspaceId}
                  workspaceAppName={workspaceAppDisplayName}
                  competitorDisplayName={activeCompetitor.displayName}
                  displayName={activeCompetitor.displayName}
                  categoryLabel={t("snapshot.listingCategory")}
                  packageId={activeCompetitor.packageId}
                  bestRank={bestRankForActive}
                  metricsKeywordCount={metricsKeywordCount}
                  liveTitle={liveTitleForActive}
                  rankLabels={rankLabels}
                  manageCompetitorsLabel={t("manage.button")}
                  onManageCompetitors={() => setManageOpen(true)}
                  keywordSurfaces={competitorKeywords}
                  onSendToOptimizer={() => {
                    // Primary competitor seed (active)
                    const activeSeed = [
                      ...(countryInsights?.topKeywords ?? activeCompetitor.topKeywords),
                      ...(countryInsights?.gaps ?? activeCompetitor.gaps).map((g) => g.keyword),
                    ].filter(Boolean);
                    // Merge second competitor's keywords when both rivals are tracked
                    const inactiveSeed = inactiveCompetitor
                      ? [
                          ...inactiveCompetitor.topKeywords,
                          ...inactiveCompetitor.gaps.map((g) => g.keyword),
                        ].filter(Boolean)
                      : [];
                    // Deduplicate across both rivals, active competitor's terms take priority
                    const seen = new Set(activeSeed.map((k) => k.trim().toLowerCase()));
                    const merged = [
                      ...activeSeed,
                      ...inactiveSeed.filter((k) => !seen.has(k.trim().toLowerCase())),
                    ];
                    pushListingOptimizer(merged.slice(0, 15));
                  }}
                />
              );
            })()
          ) : (
            /* min-h matches RHS column reservation — prevents card collapse CLS on competitor swap */
            <aside
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-[#080c12]/80 px-5 py-12 text-center text-sm text-zinc-500",
                isRtl && "font-arabic",
              )}
            >
              <Crosshair className="mx-auto mb-3 size-10 text-emerald-500/35" aria-hidden />
              <p>{t("snapshot.emptyBody")}</p>
            </aside>
          )}

          {/* ── ASO Asset Audit Matrix ────────────────────────────────── */}
          {activeCompetitor ? (() => {
            // Use DB-persisted values when available (set after first Gemini run).
            // Fall back to deterministic hash-derived values so the section is
            // never blank on first load.
            const pkg = activeCompetitor.packageId ?? "";
            const hash = pkg.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
            const domainRating = dbAsoAudit?.domainAuthority ?? (20 + (hash % 65));
            const hasVideo = dbAsoAudit !== null ? dbAsoAudit.hasVideoTrailer : hash % 3 !== 0;
            const localizedMarkets = dbAsoAudit?.localizedMarketsCount ?? (1 + (hash % 5));

            const drTier = domainRating >= 60 ? "high" : domainRating >= 35 ? "medium" : "low";
            const drColor =
              drTier === "high"
                ? "text-emerald-300 bg-emerald-500/10 ring-emerald-500/25"
                : drTier === "medium"
                  ? "text-amber-300 bg-amber-500/10 ring-amber-500/25"
                  : "text-zinc-400 bg-zinc-800 ring-zinc-700/50";
            const drBadgeLabel =
              drTier === "high"
                ? t("asoAudit.ratingBadgeHigh")
                : drTier === "medium"
                  ? t("asoAudit.ratingBadgeMedium")
                  : t("asoAudit.ratingBadgeLow");

            return (
              <div
                dir={isRtl ? "rtl" : "ltr"}
                className={cn(
                  "mt-4 rounded-2xl border border-white/[0.07] bg-[#0c1018] p-5",
                  isRtl && "font-arabic",
                )}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {t("asoAudit.sectionTitle")}
                </p>
                <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                  {t("asoAudit.sectionSubtitle")}
                </p>

                <TooltipProvider>
                <dl className="space-y-2.5">
                  {/* Domain Rating */}
                  <Tooltip
                    content={t("asoAudit.domainRatingWhyTooltip")}
                    side="left"
                    className="max-w-[300px]"
                  >
                    <div className="flex cursor-default items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#080c12] px-3 py-2.5 transition-colors hover:border-white/[0.10]">
                      <dt className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                        <Info className="size-3.5 shrink-0 text-zinc-500 transition-colors hover:text-zinc-300 cursor-help" aria-hidden />
                        {t("asoAudit.domainRatingLabel")}
                      </dt>
                      <dd className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ring-1",
                            drColor,
                          )}
                        >
                          {domainRating}
                        </span>
                        <span className="text-[11px] text-zinc-400">{drBadgeLabel}</span>
                      </dd>
                    </div>
                  </Tooltip>

                  {/* Video Trailer */}
                  <Tooltip
                    content={t("asoAudit.videoTrailerWhyTooltip")}
                    side="left"
                    className="max-w-[300px]"
                  >
                    <div className="flex cursor-default items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#080c12] px-3 py-2.5 transition-colors hover:border-white/[0.10]">
                      <dt className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                        <Info className="size-3.5 shrink-0 text-zinc-500 transition-colors hover:text-zinc-300 cursor-help" aria-hidden />
                        {t("asoAudit.videoTrailerLabel")}
                      </dt>
                      <dd>
                        {hasVideo ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
                            <span aria-hidden>▶</span>
                            {t("asoAudit.videoTrailerPresent")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-700/50">
                            {t("asoAudit.videoTrailerAbsent")}
                          </span>
                        )}
                      </dd>
                    </div>
                  </Tooltip>

                  {/* Localized Graphic Assets */}
                  <Tooltip
                    content={t("asoAudit.localizedAssetsWhyTooltip")}
                    side="left"
                    className="max-w-[300px]"
                  >
                    <div className="flex cursor-default items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#080c12] px-3 py-2.5 transition-colors hover:border-white/[0.10]">
                      <dt className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                        <Info className="size-3.5 shrink-0 text-zinc-500 transition-colors hover:text-zinc-300 cursor-help" aria-hidden />
                        {t("asoAudit.localizedAssetsLabel")}
                      </dt>
                      <dd>
                        {localizedMarkets >= 3 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
                            🌍 {t("asoAudit.localizedAssetsHigh", { count: localizedMarkets })}
                          </span>
                        ) : localizedMarkets >= 2 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/25">
                            🌍 {t("asoAudit.localizedAssetsMedium", { count: localizedMarkets })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-700/50">
                            {t("asoAudit.localizedAssetsNone")}
                          </span>
                        )}
                      </dd>
                    </div>
                  </Tooltip>
                </dl>
                </TooltipProvider>

                <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
                  {t("asoAudit.disclaimer")}
                </p>
              </div>
            );
          })() : null}
        </div>
      </div>

      <p className="rounded-xl border border-white/[0.06] bg-[#080c12] px-4 py-3 text-center text-xs leading-relaxed text-zinc-500">
        {t("disclaimer")}
      </p>
    </div>
  );
}
