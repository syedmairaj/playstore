"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, ScanLine, Sparkles, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { readPersistedWorkspaceAppId } from "@/lib/client/workspace-app-sync";
import { useWorkspaceApp } from "@/contexts/WorkspaceAppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeywordHistoryDialog } from "@/components/keyword-tracker/keyword-history-dialog";
import { PreviewDismissDialog } from "@/components/keyword-tracker/preview-dismiss-dialog";
import { PreviewHiddenBar } from "@/components/keyword-tracker/preview-hidden-bar";
import { PreviewMarketsModal } from "@/components/keyword-tracker/preview-markets-modal";
import { PreviewPromotePanel } from "@/components/keyword-tracker/preview-promote-panel";
import { PreviewStartNewDialog } from "@/components/keyword-tracker/preview-start-new-dialog";
import { previewCountryCodes } from "@/components/keyword-tracker/save-keyword-modal";
import {
  buildKeywordWatchlistCsv,
  downloadCsvFile,
} from "@/components/keyword-tracker/keyword-watchlist-export";
import {
  filterKeywordsBySearch,
  keywordRowMatchesCountryFilter,
} from "@/components/keyword-tracker/keyword-watchlist-filter";
import {
  flattenKeywordsToRows,
  filterFlatRowsByMarket,
  filterFlatRowsBySearch,
  type FlatKeywordRow,
} from "@/lib/keywords/flatten-keyword-rows";
import { KeywordWatchlistTable } from "@/components/keyword-tracker/keyword-watchlist-table";
import { KeywordWatchlistToolbar } from "@/components/keyword-tracker/keyword-watchlist-toolbar";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { CountrySelector } from "@/components/country-selector";
import {
  SerperPreviewResults,
  type SerperPreviewCountry,
} from "@/components/serper/serper-preview-results";
import { isSupportedCountry, type SupportedCountryCode } from "@/lib/countries";
import { formatRelativePastSince } from "@/lib/intl/format-relative-past";
import { DiscoveryKeywordsPanel } from "@/components/keyword-tracker/discovery-keywords-panel";
import {
  buildContextualDiscoverySuggestions,
  discoveryGenerationId,
  type DiscoveryKeywordSuggestion,
} from "@/lib/keywords/discovery-ai-suggestions";
import type { LatestAiListingKeywordsRow } from "@/lib/keywords/latest-ai-listing-by-app";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";
import {
  buildTrackedKeywordKeySet,
  isKeywordTrackedOnApp,
} from "@/lib/keywords/keyword-tracking-match";
import {
  competitorInitialForDisplay,
  normalizeCompetitorDisplayNameForRank,
} from "@/lib/keywords/serper-snapshot-rank-resolve";
import { parseTrackedCompetitorRankText } from "@/lib/keywords/tracked-competitor-ranks";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import {
  rankForSnapshotInsert,
  resolveRankInCountryForSerperSnapshot,
} from "@/lib/keywords/serper-snapshot-rank-resolve";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { serperAiCreditsForCountryCount } from "@/lib/keywords/keyword-track-ai-pricing";
import { dispatchWorkspaceKeywordsChanged } from "@/lib/client/workspace-keywords-sync";
import {
  isKeywordRankSyncPending,
  KEYWORD_RANK_SYNC_POLL_INTERVAL_MS,
  KEYWORD_RANK_SYNC_POLL_MAX_ATTEMPTS,
  rowsNeedingKeywordRankSyncPoll,
} from "@/lib/keywords/keyword-rank-sync-pending";
import { cn } from "@/lib/utils";
import {
  publishKeywordTrackerValidatorBridge,
} from "@/lib/client/keyword-tracker-validator-bridge";
import {
  buildKeywordTrackerPreviewDraft,
  clearKeywordTrackerPreviewSession,
  parseKeywordTrackerPreviewDraft,
  readKeywordTrackerPreviewFromSession,
  sanitizeDraftCountries,
  writeKeywordTrackerPreviewToSession,
} from "@/lib/keywords/keyword-tracker-preview-cache";

export type KeywordTrackerClientProps = {
  workspaceId: string;
  initialKeywords: KeywordWithRanks[];
  apps: WorkspaceAppListRow[];
  keywordsLoadError?: string | null;
  appsLoadError?: string | null;
  /** Latest AI listing keyword suggestions per app (listing_generations with app_id). */
  latestAiByApp?: Record<string, LatestAiListingKeywordsRow>;
};

const WATCHLIST_PAGE_SIZES = [10, 25, 50] as const;


export function KeywordTrackerClient({
  workspaceId,
  initialKeywords,
  apps,
  keywordsLoadError,
  appsLoadError,
  latestAiByApp = {},
}: KeywordTrackerClientProps) {
  const t = useTranslations("keywordTracker");
  const locale = useLocale();
  const tSerper = useTranslations("serperPreview");
  const tCountrySel = useTranslations("countrySelector");
  const router = useRouter();
  const { workspaceAppId, setWorkspaceAppId } = useWorkspaceApp();
  const [isRefreshing, startTransition] = useTransition();
  const [mutationPending, setMutationPending] = useState(false);
  const [rows, setRows] = useState<KeywordWithRanks[]>(initialKeywords);
  const [term, setTerm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<KeywordWithRanks | null>(null);
  const [filterAppId, setFilterAppId] = useState<string | "all">(() => {
    const persisted = readPersistedWorkspaceAppId(workspaceId);
    if (persisted && apps.some((a) => a.id === persisted)) return persisted;
    return "all";
  });
  const [tableSearch, setTableSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<Set<SupportedCountryCode>>(
    () => new Set(),
  );
  const [watchlistPage, setWatchlistPage] = useState(1);
  const [watchlistPageSize, setWatchlistPageSize] =
    useState<(typeof WATCHLIST_PAGE_SIZES)[number]>(25);
  const [addTargetAppId, setAddTargetAppId] = useState<string>(() => {
    const persisted = readPersistedWorkspaceAppId(workspaceId);
    if (persisted && apps.some((a) => a.id === persisted)) return persisted;
    return apps[0]?.id ?? "";
  });

  useEffect(() => {
    if (!workspaceAppId || workspaceAppId === addTargetAppId) return;
    if (!apps.some((a) => a.id === workspaceAppId)) return;
    setAddTargetAppId(workspaceAppId);
    if (filterAppId !== "all") {
      setFilterAppId(workspaceAppId);
    }
  }, [workspaceAppId, apps, addTargetAppId, filterAppId]);

  const [trackingAiTerm, setTrackingAiTerm] = useState<string | null>(null);
  /** Optimistic keys after Add to tracker — merged until router.refresh() reloads rows. */
  const [optimisticTrackedKeys, setOptimisticTrackedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [saveSerperPending, setSaveSerperPending] = useState(false);
  const [previewDismissOpen, setPreviewDismissOpen] = useState(false);
  const [previewMarketsModalOpen, setPreviewMarketsModalOpen] = useState(false);
  const [previewMarketsPending, setPreviewMarketsPending] = useState(false);
  const [previewStartNewOpen, setPreviewStartNewOpen] = useState(false);
  const [serperRowRefreshId, setSerperRowRefreshId] = useState<string | null>(null);
  /** Row pending credit-confirm modal: holds { id, term } until user confirms or cancels. */
  const [pendingRefreshRow, setPendingRefreshRow] = useState<{ id: string; term: string } | null>(null);
  type CompetitorSlot = {
    name: string;
    packageId: string;
    initial?: string;
    iconUrl?: string | null;
    rankByTerm: ReadonlyMap<string, number>;
  };
  const [competitorSlots, setCompetitorSlots] = useState<[CompetitorSlot | null, CompetitorSlot | null]>([null, null]);
  // Live Play Store preview state. Default to the Arabic-first market when the
  const isRtl = locale === "ar";
  // user's locale is Arabic so previews feel relevant out of the box.
  const defaultCountry: SupportedCountryCode =
    locale === "ar" ? "sa" : "us";
  const [selectedCountries, setSelectedCountries] = useState<SupportedCountryCode[]>(
    () => [defaultCountry],
  );
  const [previewPending, setPreviewPending] = useState(false);
  const [previewResults, setPreviewResults] = useState<SerperPreviewCountry[] | null>(null);
  /** True after preview data was promoted to the watchlist without clearing the preview UI. */
  const [previewPromoted, setPreviewPromoted] = useState(false);
  /** Collapses preview UI only — does not delete paid preview data from draft/session. */
  const [previewHidden, setPreviewHidden] = useState(false);
  /** Credits charged for the current on-screen preview session (non-refundable). */
  const [previewCreditsUsed, setPreviewCreditsUsed] = useState(0);
  /** After Add keyword, pin row id for Save so snapshots attach to that row (add → preview → save). */
  const [saveAttach, setSaveAttach] = useState<{
    id: string;
    termNorm: string;
    appId: string;
  } | null>(null);

  const initialKeywordsSyncKey = useMemo(
    () =>
      initialKeywords
        .map(
          (k) =>
            `${k.id}:${k.lastSyncedAt ?? ""}:${k.latest?.rank ?? ""}:${k.ranks?.length ?? 0}`,
        )
        .sort()
        .join("|"),
    [initialKeywords],
  );

  const initialKeywordsRef = useRef(initialKeywords);
  initialKeywordsRef.current = initialKeywords;

  useEffect(() => {
    setRows(initialKeywordsRef.current);
    setOptimisticTrackedKeys(new Set());
  }, [initialKeywordsSyncKey]);

  /**
   * IDs that have been polled to max-attempts without a Serper snapshot appearing.
   * Excluded from rankSyncPollKey so a subsequent initialKeywords re-render (e.g. after
   * router.refresh()) cannot restart the loop for rows that never resolved.
   * Cleared only when the component unmounts or the row's ID is removed from rows.
   */
  const syncGaveUpRef = useRef<Set<string>>(new Set());

  const rankSyncPollKey = useMemo(() => {
    const gaveUp = syncGaveUpRef.current;
    return rowsNeedingKeywordRankSyncPoll(rows)
      .filter((r) => !gaveUp.has(r.id))
      .map((r) => r.id)
      .sort()
      .join(",");
  }, [rows]);

  const rankSyncPollGenRef = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!rankSyncPollKey) return;

    const generation = ++rankSyncPollGenRef.current;
    let attempts = 0;
    let intervalId: number | undefined;

    const stop = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const poll = async () => {
      if (rankSyncPollGenRef.current !== generation) return;
      attempts += 1;

      const pending = rowsNeedingKeywordRankSyncPoll(rowsRef.current).filter(
        (r) => !syncGaveUpRef.current.has(r.id),
      );
      if (pending.length === 0) {
        stop();
        return;
      }
      const appIds = [...new Set(pending.map((r) => r.app_id).filter(Boolean))];
      if (appIds.length === 0) {
        stop();
        return;
      }

      try {
        const responses = await Promise.all(
          appIds.map(async (appId) => {
            const res = await fetch(
              `/api/workspaces/${workspaceId}/keywords?appId=${encodeURIComponent(appId)}`,
              { credentials: "include" },
            );
            const json = (await res.json()) as {
              ok?: boolean;
              keywords?: KeywordWithRanks[];
            };
            if (!res.ok || !json.ok || !Array.isArray(json.keywords)) return [];
            return json.keywords;
          }),
        );
        if (rankSyncPollGenRef.current !== generation) return;

        const byId = new Map<string, KeywordWithRanks>();
        for (const list of responses) {
          for (const row of list) byId.set(row.id, row);
        }
        if (byId.size === 0) return;

        setRows((prev) => {
          let changed = false;
          const next = prev.map((row) => {
            const fresh = byId.get(row.id);
            if (!fresh) return row;
            const wasPending = isKeywordRankSyncPending(row);
            if (wasPending) {
              if (!isKeywordRankSyncPending(fresh)) {
                // Serper snapshot arrived — remove from gave-up set in case it was added
                syncGaveUpRef.current.delete(row.id);
                changed = true;
                return fresh;
              }
              // Still pending: do NOT touch the row so rankSyncPollKey stays stable
              return row;
            }
            if (
              fresh.lastSyncedAt !== row.lastSyncedAt ||
              fresh.latest?.rank !== row.latest?.rank
            ) {
              changed = true;
              return fresh;
            }
            return row;
          });
          if (!rowsNeedingKeywordRankSyncPoll(next).filter((r) => !syncGaveUpRef.current.has(r.id)).length) stop();
          return changed ? next : prev;
        });
      } catch {
        /* network — retry until max attempts */
      }

      if (attempts >= KEYWORD_RANK_SYNC_POLL_MAX_ATTEMPTS) {
        // Mark all still-pending rows as gave-up so they are excluded from future rankSyncPollKey
        // computations (prevents infinite restart when initialKeywords prop re-renders).
        const stillPending = rowsNeedingKeywordRankSyncPoll(rowsRef.current);
        for (const r of stillPending) syncGaveUpRef.current.add(r.id);
        stop();
      }
    };

    void poll();
    intervalId = window.setInterval(() => void poll(), KEYWORD_RANK_SYNC_POLL_INTERVAL_MS);

    return () => {
      rankSyncPollGenRef.current += 1;
      stop();
    };
  }, [rankSyncPollKey, workspaceId]);

  useEffect(() => {
    setHistoryFor((prev) => {
      if (!prev?.id) return prev;
      const next = initialKeywords.find((k) => k.id === prev.id);
      return next ?? prev;
    });
  }, [initialKeywords]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sessionDraft = readKeywordTrackerPreviewFromSession(workspaceId);
      let serverDraft: ReturnType<typeof parseKeywordTrackerPreviewDraft> = null;
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/keywords/serper-preview-draft`,
          { credentials: "include" },
        );
        const json = (await res.json()) as { ok?: boolean; draft?: unknown };
        if (res.ok && json.ok === true && json.draft != null) {
          serverDraft = parseKeywordTrackerPreviewDraft(json.draft);
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const best =
        !sessionDraft
          ? serverDraft
          : !serverDraft
            ? sessionDraft
            : new Date(sessionDraft.updatedAt).getTime() >= new Date(serverDraft.updatedAt).getTime()
              ? sessionDraft
              : serverDraft;
      if (!best) return;
      setPreviewResults(best.results);
      setPreviewHidden(false);
      setPreviewCreditsUsed(
        serperAiCreditsForCountryCount(sanitizeDraftCountries(best.selectedCountries).length),
      );
      setTerm(best.term);
      const sc = sanitizeDraftCountries(best.selectedCountries);
      if (sc.length > 0) {
        setSelectedCountries(sc);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Fetch up to two competitors' shared rows to populate dual Competitor Rank column
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/competitors`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          ok?: boolean;
          competitors?: {
            displayName?: string;
            packageId?: string;
            iconUrl?: string | null;
            shared?: { keyword: string; theirRank: number }[];
          }[];
        };
        if (cancelled || !json.ok || !Array.isArray(json.competitors) || json.competitors.length === 0) return;

        const slots: [CompetitorSlot | null, CompetitorSlot | null] = [null, null];
        for (let i = 0; i < 2; i++) {
          const comp = json.competitors[i];
          if (!comp?.packageId) continue;
          const map = new Map<string, number>();
          for (const row of comp.shared ?? []) {
            if (typeof row.keyword === "string" && typeof row.theirRank === "number") {
              const key = row.keyword.trim().toLowerCase();
              const existing = map.get(key);
              if (existing == null || row.theirRank < existing) map.set(key, row.theirRank);
            }
          }
          const displayName =
            normalizeCompetitorDisplayNameForRank(comp.displayName) ??
            comp.displayName ??
            comp.packageId;
          slots[i as 0 | 1] = {
            name: displayName,
            packageId: comp.packageId,
            initial: competitorInitialForDisplay(displayName, comp.packageId),
            iconUrl: typeof comp.iconUrl === "string" && comp.iconUrl.length > 0 ? comp.iconUrl : null,
            rankByTerm: map,
          };
        }
        if (!cancelled) setCompetitorSlots(slots);
      } catch {
        /* ignore — competitor rank column is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const clearSerperPreviewPersistence = useCallback(() => {
    clearKeywordTrackerPreviewSession(workspaceId);
    void fetch(`/api/workspaces/${workspaceId}/keywords/serper-preview-draft`, {
      method: "DELETE",
      credentials: "include",
    });
  }, [workspaceId]);

  const persistSerperPreviewDraft = useCallback(
    (args: { term: string; countries: SupportedCountryCode[]; results: SerperPreviewCountry[] }) => {
      const draft = buildKeywordTrackerPreviewDraft({
        term: args.term,
        selectedCountries: args.countries,
        results: args.results,
      });
      writeKeywordTrackerPreviewToSession(workspaceId, draft);
      void fetch(`/api/workspaces/${workspaceId}/keywords/serper-preview-draft`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    },
    [workspaceId],
  );

  useEffect(() => {
    if (apps[0]?.id && !apps.some((a) => a.id === addTargetAppId)) {
      setAddTargetAppId(apps[0].id);
    }
  }, [apps, addTargetAppId]);

  useEffect(() => {
    const scope =
      filterAppId !== "all"
        ? filterAppId
        : addTargetAppId || apps[0]?.id || "";
    const n = term.trim().toLowerCase();
    setSaveAttach((prev) => {
      if (!prev) return prev;
      if (prev.termNorm !== n || prev.appId !== scope) return null;
      return prev;
    });
  }, [term, filterAppId, addTargetAppId, apps]);

  const appNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of apps) m.set(a.id, a.name);
    return m;
  }, [apps]);

  const appRowById = useMemo(() => {
    const m = new Map<string, WorkspaceAppListRow>();
    for (const a of apps) m.set(a.id, a);
    return m;
  }, [apps]);

  const countryLabel = useCallback(
    (code: SupportedCountryCode) => tCountrySel(`countries.${code}.label`),
    [tCountrySel],
  );

  // ── Keyword rows filtered by app ──────────────────────────────────────────
  const appFilteredRows = useMemo(() => {
    if (filterAppId === "all") return rows;
    return rows.filter((r) => r.app_id === filterAppId);
  }, [rows, filterAppId]);

  // ── Flatten: one FlatKeywordRow per (keyword × country) ───────────────────
  // This is the data shape the table consumes. Each row has a single country,
  // a single yourRank, and a single competitorRank — no multi-badge merging.
  const flatRows = useMemo(
    () => flattenKeywordsToRows(appFilteredRows),
    [appFilteredRows],
  );

  // ── Search filter operates on flat rows ───────────────────────────────────
  const searchFilteredFlatRows = useMemo(
    () => filterFlatRowsBySearch(flatRows, tableSearch, appNameById),
    [flatRows, tableSearch, appNameById],
  );

  // ── Market chip filter: exact country match on flat row ───────────────────
  const countryFilteredRows = useMemo(
    () => filterFlatRowsByMarket(searchFilteredFlatRows, marketFilter),
    [searchFilteredFlatRows, marketFilter],
  );

  const watchlistPageCount = Math.max(
    1,
    Math.ceil(countryFilteredRows.length / watchlistPageSize),
  );

  const safeWatchlistPage = Math.min(watchlistPage, watchlistPageCount);

  const paginatedWatchlistRows = useMemo(() => {
    const start = (safeWatchlistPage - 1) * watchlistPageSize;
    return countryFilteredRows.slice(start, start + watchlistPageSize);
  }, [countryFilteredRows, safeWatchlistPage, watchlistPageSize]);

  useEffect(() => {
    setWatchlistPage(1);
  }, [tableSearch, marketFilter, filterAppId, watchlistPageSize]);

  useEffect(() => {
    if (watchlistPage !== safeWatchlistPage) {
      setWatchlistPage(safeWatchlistPage);
    }
  }, [watchlistPage, safeWatchlistPage]);

  const countryLabelsForExport = useMemo(() => {
    const codes: SupportedCountryCode[] = ["us", "sa", "ae", "in", "cn"];
    return Object.fromEntries(
      codes.map((c) => [c, countryLabel(c)]),
    ) as Record<SupportedCountryCode, string>;
  }, [countryLabel]);

  const onExportWatchlistCsv = useCallback(() => {
    if (countryFilteredRows.length === 0) return;
    // Deduplicate source keyword rows for CSV (the CSV builder works on KeywordWithRanks[])
    const seen = new Set<string>();
    const sourceRows = countryFilteredRows.reduce<typeof appFilteredRows>((acc, fr) => {
      if (!seen.has(fr.source.id)) { seen.add(fr.source.id); acc.push(fr.source); }
      return acc;
    }, []);
    const csv = buildKeywordWatchlistCsv({
      rows: sourceRows,
      appNameById,
      rankFmt: { notInTop: t("table.rankNotInTop") },
      countryLabels: countryLabelsForExport,
      headers: {
        keyword: t("table.csvKeyword"),
        app: t("table.csvApp"),
        currentRank: t("table.csvCurrentRank"),
        bestRank: t("table.csvBestRank"),
        lastSync: t("table.csvLastSync"),
      },
      formatSyncAt: (iso) =>
        iso
          ? formatRelativePastSince(iso, locale, { justNow: t("table.justNow") })
          : "—",
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`keyword-watchlist-${stamp}.csv`, csv);
    toast.success(t("table.exportCsvSuccess"));
  }, [
    countryFilteredRows,
    appFilteredRows,
    appNameById,
    countryLabelsForExport,
    locale,
    t,
  ]);

  const toggleMarketFilter = useCallback((code: SupportedCountryCode) => {
    setMarketFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const showWatchlistSkeleton = isRefreshing && appFilteredRows.length > 0;

  const scopeAppId =
    filterAppId !== "all"
      ? filterAppId
      : addTargetAppId || apps[0]?.id || "";

  useEffect(() => {
    publishKeywordTrackerValidatorBridge({
      selectedCountries,
      scopeAppId: scopeAppId || undefined,
    });
  }, [selectedCountries, scopeAppId]);

  const scopePackageName = useMemo(() => {
    if (!scopeAppId) return null;
    const row = apps.find((a) => a.id === scopeAppId);
    const p = row?.package_name?.trim();
    return p && p.length > 0 ? p : null;
  }, [apps, scopeAppId]);

  const tooltipAppName =
    (scopeAppId && appNameById.get(scopeAppId)) || t("add.yourAppFallback");

  const previewCreditCost = useMemo(
    () => serperAiCreditsForCountryCount(selectedCountries.length),
    [selectedCountries],
  );

  const livePreviewIssueBanner = useMemo(() => {
    if (!previewResults?.length) return null;
    const failed = previewResults.filter((r) => Boolean(r.error?.trim()));
    if (failed.length === 0) return null;
    if (failed.length === previewResults.length) return "all" as const;
    return "partial" as const;
  }, [previewResults]);

  /** Prefer row for the user's first selected market when the same term exists on multiple `keywords.market` rows. */
  const keywordIdForSerperSave = useMemo(() => {
    const trimmed = term.trim();
    const norm = trimmed.toLowerCase();
    if (norm.length < 2 || !scopeAppId) return undefined;
    if (saveAttach && saveAttach.termNorm === norm && saveAttach.appId === scopeAppId) {
      return saveAttach.id;
    }
    const primaryM = (selectedCountries[0] ?? "us").toLowerCase();
    const termRows = rows.filter(
      (r) => r.app_id === scopeAppId && r.term.trim().toLowerCase() === norm,
    );
    const primaryRow = termRows.find((r) => String(r.market ?? "").trim().toLowerCase() === primaryM);
    return (primaryRow ?? termRows[0])?.id;
  }, [term, scopeAppId, saveAttach, rows, selectedCountries]);

  const scopeAppRow = useMemo(
    () => (scopeAppId ? apps.find((a) => a.id === scopeAppId) : undefined),
    [apps, scopeAppId],
  );

  const aiPack = scopeAppId ? latestAiByApp[scopeAppId] : undefined;

  const discoveryGenerationIdValue = useMemo(
    () => (scopeAppId ? discoveryGenerationId(scopeAppId, aiPack?.generationId) : ""),
    [scopeAppId, aiPack?.generationId],
  );

  const trackedTermKeysForApp = useMemo(() => {
    if (!scopeAppId) return new Set<string>();
    const terms: string[] = [];
    for (const r of rows) {
      if (r.app_id !== scopeAppId) continue;
      terms.push(r.term);
    }
    const fromRows = buildTrackedKeywordKeySet(terms);
    if (optimisticTrackedKeys.size === 0) return fromRows;
    return new Set([...fromRows, ...optimisticTrackedKeys]);
  }, [rows, scopeAppId, optimisticTrackedKeys]);

  const discoverySuggestionsResolved = useMemo((): DiscoveryKeywordSuggestion[] => {
    if (!scopeAppId || !scopeAppRow) return [];
    return buildContextualDiscoverySuggestions({
      app: {
        appId: scopeAppId,
        appName: scopeAppRow.name,
        category: scopeAppRow.category,
        shortDescription: scopeAppRow.short_description,
      },
      aiListingKeywords: aiPack?.keywordSuggestions ?? [],
      excludeNormalized: trackedTermKeysForApp,
    });
  }, [scopeAppId, scopeAppRow, aiPack, trackedTermKeysForApp]);

  const previewMarketCodes = useMemo(
    () => (previewResults?.length ? previewCountryCodes(previewResults) : []),
    [previewResults],
  );

  const hasActivePreview = Boolean(previewResults?.length);

  const countriesOutOfSync = useMemo(() => {
    if (!hasActivePreview) return false;
    const previewKey = [...previewMarketCodes].sort().join(",");
    const selectedKey = [...selectedCountries].sort().join(",");
    return previewKey !== selectedKey;
  }, [hasActivePreview, previewMarketCodes, selectedCountries]);

  const isCurrentTermTracked = useMemo(() => {
    const k = term.trim();
    return k.length >= 2 && isKeywordTrackedOnApp(k, trackedTermKeysForApp);
  }, [term, trackedTermKeysForApp]);

  const isPreviewOnWatchlist = isCurrentTermTracked || previewPromoted;

  const hidePreview = useCallback(() => {
    setPreviewHidden(true);
    toast.message(t("previewHidden.hideToastTitle"), {
      description: t("previewHidden.hideToastBody"),
    });
  }, [t]);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setFormError(t("add.errorEmpty"));
      return;
    }
    const targetApp =
      filterAppId !== "all" ? filterAppId : addTargetAppId || apps[0]?.id;
    if (!targetApp) {
      setFormError(t("add.errorNoApp"));
      return;
    }

    setMutationPending(true);
    try {
      // Primary selected country drives `keywords.market` for now — the schema
      // tracks one market per keyword, so multi-country fan-out only affects
      // the Serper preview today, not persistence.
      const primaryMarket = selectedCountries[0] ?? "us";
      const body: Record<string, unknown> = {
        term: trimmed,
        appId: targetApp,
        market: primaryMarket,
      };
      if (previewResults?.length && scopePackageName) {
        const initialRanks = selectedCountries
          .map((country) => {
            const hasBlock = previewResults.some(
              (b) => String(b.country ?? "").trim().toLowerCase() === country,
            );
            if (!hasBlock) return null;
            return {
              country,
              rank: rankForSnapshotInsert(
                resolveRankInCountryForSerperSnapshot(
                  previewResults,
                  scopePackageName,
                  country,
                ),
              ),
            };
          })
          .filter((x): x is { country: SupportedCountryCode; rank: number } => x != null);
        if (initialRanks.length > 0) {
          body.initialRanks = initialRanks;
        }
      }
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        keyword?: { id: string; term?: string };
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !json.ok) {
        if (json.error?.code === "duplicate_keyword" || res.status === 409) {
          setFormError(t("add.errorDuplicate"));
        } else if (json.error?.code === "no_package_name") {
          toast.error(t("serper.saveNeedsPackage"));
        } else {
          setFormError(json.error?.message ?? t("add.errorGeneric"));
        }
        return;
      }

      toast.success(t("add.toastSuccess"));
      if (body.initialRanks) {
        setPreviewPromoted(true);
      }
      if (json.keyword?.id && targetApp) {
        setSaveAttach({
          id: json.keyword.id,
          termNorm: trimmed.toLowerCase(),
          appId: targetApp,
        });
      }
      refresh();
    } finally {
      setMutationPending(false);
    }
  }

  async function onTrackAiSuggested(
    term: string,
    options?: { background?: boolean },
  ) {
    if (!scopeAppId || !aiPack) return;
    const trimmed = term.trim();
    if (trimmed.length < 2) return;

    setTrackingAiTerm(trimmed);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terms: [trimmed],
          appId: scopeAppId,
          listingGenerationId: aiPack.generationId,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: { code?: string; message?: string; remaining?: number; required?: number };
      };

      if (!res.ok || !json.ok) {
        toast.error(json.error?.message ?? t("aiSuggestedKeywords.trackError"));
        return;
      }

      setOptimisticTrackedKeys((prev) => {
        const next = new Set(prev);
        for (const key of buildTrackedKeywordKeySet([trimmed])) {
          next.add(key);
        }
        return next;
      });
      if (options?.background) {
        toast.message(t("aiSuggestedKeywords.trackBackgroundToast", { term: trimmed }));
      } else {
        toast.success(t("aiSuggestedKeywords.toastTracked", { term: trimmed }));
      }
      refresh();
    } finally {
      setTrackingAiTerm(null);
    }
  }

  async function onDelete(id: string) {
    const deletedRow = rows.find((r) => r.id === id);
    setMutationPending(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        toast.error(t("delete.error"));
        return;
      }
      toast.success(t("delete.toastSuccess"));
      if (historyFor?.id === id) setHistoryFor(null);
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (deletedRow?.term?.trim()) {
        dispatchWorkspaceKeywordsChanged({
          workspaceId,
          removedTerms: [deletedRow.term.trim()],
        });
      }
      refresh();
    } finally {
      setMutationPending(false);
    }
  }

  const blockingError = Boolean(keywordsLoadError || appsLoadError);

  const showAiSuggested =
    discoverySuggestionsResolved.length > 0 && Boolean(scopeAppId && scopeAppRow);

  const runPreviewFetch = useCallback(
    async (
      countries: SupportedCountryCode[],
      options?: { mergeInto?: SerperPreviewCountry[] | null; persistCountries?: SupportedCountryCode[] },
    ): Promise<boolean> => {
      const trimmed = term.trim();
      if (trimmed.length < 2 || countries.length === 0) return false;

      try {
        const res = await fetch(`/api/serper/play-store-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            keyword: trimmed,
            countries,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          results?: SerperPreviewCountry[];
          creditsCharged?: number;
          error?: { code?: string; message?: string; required?: number; remaining?: number };
        };

        if (!res.ok || !json.ok || !Array.isArray(json.results)) {
          if (res.status === 402 || json.error?.code === "insufficient_credits") {
            const req = json.error?.required;
            const rem = json.error?.remaining;
            if (typeof req === "number" && typeof rem === "number") {
              toast.error(t("serper.previewInsufficient", { required: req, remaining: rem }));
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
          return false;
        }

        const merged = options?.mergeInto?.length
          ? [...options.mergeInto, ...json.results]
          : json.results;
        const persistCountries = options?.persistCountries ?? countries;

        const charged =
          typeof json.creditsCharged === "number"
            ? json.creditsCharged
            : serperAiCreditsForCountryCount(countries.length);

        setPreviewResults(merged);
        setPreviewHidden(false);
        setPreviewCreditsUsed((prev) => (options?.mergeInto?.length ? prev + charged : charged));
        setSelectedCountries(persistCountries);
        persistSerperPreviewDraft({
          term: trimmed,
          countries: persistCountries,
          results: merged,
        });
        return true;
      } catch {
        toast.error(tSerper("errorGeneric"));
        return false;
      }
    },
    [term, workspaceId, t, tSerper, persistSerperPreviewDraft],
  );

  const onPreviewRanks = useCallback(async () => {
    if (previewPending) return;
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setFormError(t("add.errorEmpty"));
      return;
    }
    if (selectedCountries.length === 0) return;

    setPreviewPromoted(false);
    setPreviewPending(true);
    setFormError(null);
    try {
      const ok = await runPreviewFetch(selectedCountries);
      if (!ok && !previewResults?.length) {
        setPreviewResults(null);
      }
    } finally {
      setPreviewPending(false);
    }
  }, [previewPending, term, selectedCountries, t, runPreviewFetch, previewResults]);

  const onConfirmStartNewSearch = useCallback(async () => {
    setPreviewResults(null);
    setPreviewPromoted(false);
    setPreviewHidden(false);
    setPreviewCreditsUsed(0);
    clearSerperPreviewPersistence();
    await onPreviewRanks();
  }, [clearSerperPreviewPersistence, onPreviewRanks]);

  const onApplyPreviewMarkets = useCallback(
    async (nextCountries: SupportedCountryCode[]) => {
      if (previewMarketsPending || !previewResults?.length || nextCountries.length === 0) return;

      const currentCodes = previewCountryCodes(previewResults);
      const toAdd = nextCountries.filter((c) => !currentCodes.includes(c));
      const keep = new Set(nextCountries);
      const trimmed = term.trim();

      const filtered = previewResults.filter((block) => {
        const raw = String(block.country ?? "").trim().toLowerCase();
        return isSupportedCountry(raw) && keep.has(raw);
      });

      if (toAdd.length === 0) {
        setPreviewResults(filtered);
        setSelectedCountries(nextCountries);
        persistSerperPreviewDraft({
          term: trimmed,
          countries: nextCountries,
          results: filtered,
        });
        setPreviewMarketsModalOpen(false);
        toast.success(t("serper.marketsUpdated"));
        return;
      }

      setPreviewMarketsPending(true);
      try {
        const ok = await runPreviewFetch(toAdd, {
          mergeInto: filtered,
          persistCountries: nextCountries,
        });
        if (ok) {
          setPreviewMarketsModalOpen(false);
          toast.success(t("serper.marketsUpdated"));
        }
      } finally {
        setPreviewMarketsPending(false);
      }
    },
    [
      previewMarketsPending,
      previewResults,
      term,
      runPreviewFetch,
      persistSerperPreviewDraft,
      t,
    ],
  );

  const onPreviewButtonClick = useCallback(() => {
    if (hasActivePreview) {
      setPreviewStartNewOpen(true);
      return;
    }
    void onPreviewRanks();
  }, [hasActivePreview, onPreviewRanks]);

  const onSaveSerperPreview = useCallback(
    async (countries: SupportedCountryCode[]) => {
      if (saveSerperPending || !previewResults?.length || countries.length === 0) return;
      const trimmed = term.trim();
      if (trimmed.length < 2) {
        setFormError(t("add.errorEmpty"));
        return;
      }
      const targetApp = scopeAppId;
      if (!targetApp) {
        setFormError(t("add.errorNoApp"));
        return;
      }
      if (!scopePackageName) {
        toast.error(t("serper.saveNeedsPackage"));
        return;
      }

      setSaveSerperPending(true);
      try {
        const primarySave = selectedCountries[0];
        const body: Record<string, unknown> = {
          term: trimmed,
          appId: targetApp,
          countries,
          results: previewResults,
        };
        if (primarySave && countries.includes(primarySave)) {
          body.primaryCountry = primarySave;
        }
        if (keywordIdForSerperSave) {
          body.keywordId = keywordIdForSerperSave;
        }
        if (scopePackageName && previewResults.length > 0) {
          body.snapshotRanks = countries.map((country) => ({
            country,
            rank: rankForSnapshotInsert(
              resolveRankInCountryForSerperSnapshot(
                previewResults,
                scopePackageName,
                country,
              ),
            ),
          }));
        }
        const res = await fetch(`/api/workspaces/${workspaceId}/keywords/serper-save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          keywordId?: string;
          createdKeyword?: boolean;
          error?: { code?: string; message?: string };
        };
        if (!res.ok || !json.ok) {
          if (json.error?.code === "duplicate_keyword" || res.status === 409) {
            toast.error(t("add.errorDuplicate"));
          } else if (json.error?.code === "no_package_name") {
            toast.error(t("serper.saveNeedsPackage"));
          } else if (json.error?.code === "invalid_keyword") {
            toast.error(t("serper.saveInvalidKeyword"));
          } else {
            toast.error(json.error?.message ?? t("serper.saveError"));
          }
          return;
        }
        toast.success(
          json.createdKeyword
            ? t("serper.promoteToastNew")
            : t("serper.promoteToastUpdated"),
        );
        setPreviewPromoted(true);
        setFormError(null);
        if (json.keywordId && targetApp) {
          setSaveAttach({
            id: String(json.keywordId),
            termNorm: trimmed.toLowerCase(),
            appId: targetApp,
          });
        }
        refresh();
      } catch {
        toast.error(t("serper.saveError"));
      } finally {
        setSaveSerperPending(false);
      }
    },
    [
      saveSerperPending,
      previewResults,
      selectedCountries,
      term,
      scopeAppId,
      scopePackageName,
      workspaceId,
      keywordIdForSerperSave,
      t,
      refresh,
    ],
  );

  const onSerperRefreshRow = useCallback(
    async (keywordId: string) => {
      if (serperRowRefreshId || blockingError) return;
      setSerperRowRefreshId(keywordId);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/keywords/${keywordId}/serper-refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale }),
          },
        );
        type RefreshCompetitorPayload = {
          slot?: "competitor_1" | "competitor_2";
          packageId: string;
          displayName?: string;
          initial?: string;
          iconUrl?: string | null;
          rank?: string | null;
          rankNumeric?: number | null;
          matchKind?: string;
          matchScore?: number | null;
          matchedSerpTitle?: string | null;
        };
        const json = (await res.json()) as {
          ok?: boolean;
          rank?: number | null;
          snapshotAt?: string | null;
          creditsCharged?: number;
          countries?: string[];
          yourApp?: {
            matchKind?: string;
            matchScore?: number | null;
          };
          competitor1?: RefreshCompetitorPayload | null;
          competitor2?: RefreshCompetitorPayload | null;
          error?: { code?: string; message?: string; required?: number; remaining?: number };
        };
        if (!res.ok || !json.ok) {
          if (res.status === 402 || json.error?.code === "insufficient_credits") {
            const req = json.error?.required;
            const rem = json.error?.remaining;
            if (typeof req === "number" && typeof rem === "number") {
              toast.error(t("serper.rowRefreshInsufficient", { required: req, remaining: rem }));
            } else {
              toast.error(tSerper("errorGeneric"));
            }
          } else if (
            res.status === 503 ||
            json.error?.code === "serper_not_configured"
          ) {
            toast.message(tSerper("configMissingTitle"), {
              description: tSerper("configMissingBody"),
            });
          } else {
            toast.error(json.error?.message ?? t("serper.rowRefreshError"));
          }
          return;
        }

        // ── Optimistic local state patch ─────────────────────────────────────
        // The serper-refresh route returns the primary-market rank + snapshotAt.
        // Merge them directly into the matching row so isKeywordRankSyncPending()
        // immediately returns false and the "Syncing…" rank placeholder clears
        // without waiting for the full router.refresh() re-render cycle to land.
        const freshRank = json.rank;
        const freshAt = json.snapshotAt;
        if (typeof freshAt === "string" && freshAt.length > 0) {
          // Evict the row from the gave-up set so the poll loop can resume if
          // needed (handles the edge case where max-attempts was hit earlier).
          syncGaveUpRef.current.delete(keywordId);

          setRows((prev) =>
            prev.map((row) => {
              if (row.id !== keywordId) return row;
              const storedRank =
                typeof freshRank === "number"
                  ? freshRank
                  : SERPER_RANK_NOT_IN_FIRST_PAGE;
              const snapshotRow = {
                rank: storedRank,
                captured_at: freshAt,
              };
              // Build a minimal latestPerCountry entry for the primary market so
              // flattenKeywordsToRows picks it up and capturedAt / yourRank are set.
              const market = String(row.market ?? "us").trim().toLowerCase();
              const yourMatchKind =
                json.yourApp?.matchKind === "package" ||
                json.yourApp?.matchKind === "title" ||
                json.yourApp?.matchKind === "none"
                  ? json.yourApp.matchKind
                  : null;
              const patchedPerCountry: typeof row.latestPerCountry = [
                ...(row.latestPerCountry?.filter((e) => e.country !== market) ?? []),
                {
                  country: market as import("@/lib/countries").SupportedCountryCode,
                  rank: storedRank,
                  captured_at: freshAt,
                  rank_match_kind: yourMatchKind,
                },
              ];
              const trackedFromRefresh: NonNullable<
                KeywordWithRanks["trackedCompetitorsByCountry"]
              >[string] = [];
              const { competitor1, competitor2 } = json;
              if (competitor1?.packageId) {
                trackedFromRefresh.push({
                  package_name: competitor1.packageId.trim().toLowerCase(),
                  name: competitor1.displayName ?? null,
                  rank:
                    competitor1.rankNumeric ??
                    parseTrackedCompetitorRankText(competitor1.rank),
                  match_kind:
                    competitor1.matchKind === "package" ||
                    competitor1.matchKind === "title" ||
                    competitor1.matchKind === "none"
                      ? competitor1.matchKind
                      : null,
                  match_score:
                    typeof competitor1.matchScore === "number"
                      ? competitor1.matchScore
                      : null,
                  serp_display_name:
                    typeof competitor1.matchedSerpTitle === "string"
                      ? competitor1.matchedSerpTitle
                      : null,
                });
              }
              if (competitor2?.packageId) {
                trackedFromRefresh.push({
                  package_name: competitor2.packageId.trim().toLowerCase(),
                  name: competitor2.displayName ?? null,
                  rank:
                    competitor2.rankNumeric ??
                    parseTrackedCompetitorRankText(competitor2.rank),
                  match_kind:
                    competitor2.matchKind === "package" ||
                    competitor2.matchKind === "title" ||
                    competitor2.matchKind === "none"
                      ? competitor2.matchKind
                      : null,
                  match_score:
                    typeof competitor2.matchScore === "number"
                      ? competitor2.matchScore
                      : null,
                  serp_display_name:
                    typeof competitor2.matchedSerpTitle === "string"
                      ? competitor2.matchedSerpTitle
                      : null,
                });
              }
              const patchedTrackedByCountry =
                trackedFromRefresh.length > 0
                  ? {
                      ...(row.trackedCompetitorsByCountry ?? {}),
                      [market]: trackedFromRefresh,
                    }
                  : row.trackedCompetitorsByCountry;
              return {
                ...row,
                latest: snapshotRow,
                latestPerCountry: patchedPerCountry.length > 0 ? patchedPerCountry : row.latestPerCountry,
                trackedCompetitorsByCountry: patchedTrackedByCountry,
                lastSyncedAt: freshAt,
                // Inject a minimal synthetic rank history entry so ranks[] is
                // non-empty, which also clears isKeywordRankSyncPending.
                ranks: [
                  ...row.ranks,
                  { rank: storedRank, captured_at: freshAt },
                ],
              };
            }),
          );
        }

        // ── Patch competitorSlots with freshly-resolved ranks ────────────────
        // The route now returns competitor1/competitor2 with the live rank string
        // ("7", "100+", or null).  Merge into the in-memory rankByTerm maps so
        // the COMPETITORS column updates instantly for this keyword's term.
        const term = rows.find((r) => r.id === keywordId)?.term ?? "";
        const termKey = term.trim().toLowerCase();
        if (termKey) {
          const { competitor1, competitor2 } = json;
          setCompetitorSlots((prev) => {
            const next: [CompetitorSlot | null, CompetitorSlot | null] = [prev[0], prev[1]];

            // Helper: patch a slot's rankByTerm for this keyword's term.
            const patchSlot = (
              slot: CompetitorSlot | null,
              fresh: RefreshCompetitorPayload | null | undefined,
            ): CompetitorSlot | null => {
              if (!fresh?.packageId) return slot;
              const pkgNorm = fresh.packageId.trim().toLowerCase();
              const rankNum =
                typeof fresh.rankNumeric === "number"
                  ? fresh.rankNumeric
                  : fresh.rank && fresh.rank !== "100+"
                    ? Number.parseInt(fresh.rank, 10)
                    : null;
              const newMap = new Map(slot?.rankByTerm ?? []);
              if (rankNum != null && Number.isFinite(rankNum)) {
                newMap.set(termKey, rankNum);
              } else {
                newMap.delete(termKey);
              }
              const displayName =
                fresh.displayName ??
                slot?.name ??
                fresh.packageId;
              return {
                name: displayName,
                packageId: fresh.packageId,
                initial: fresh.initial,
                iconUrl: fresh.iconUrl ?? slot?.iconUrl ?? null,
                rankByTerm: newMap,
              };
            };

            next[0] = patchSlot(prev[0], competitor1);
            next[1] = patchSlot(prev[1], competitor2);
            return next;
          });
        }

        const charged = json.creditsCharged ?? 0;
        toast.success(t("serper.rowRefreshToast", { credits: charged }));
        refresh();
      } catch {
        toast.error(t("serper.rowRefreshError"));
      } finally {
        setSerperRowRefreshId(null);
      }
    },
    [
      serperRowRefreshId,
      blockingError,
      workspaceId,
      locale,
      rows,
      t,
      tSerper,
      refresh,
    ],
  );

  return (
    <div className={cn("space-y-6", isRtl && "font-arabic")} dir={isRtl ? "rtl" : "ltr"}>

      {blockingError ? (
        <div
          className={cn(
            "flex flex-col items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 sm:items-center sm:justify-between",
            isRtl ? "sm:flex-row-reverse" : "sm:flex-row",
          )}
          role="alert"
        >
          <div className="space-y-1 text-sm text-rose-100/90">
            {keywordsLoadError ? <p>{keywordsLoadError}</p> : null}
            {appsLoadError ? <p>{appsLoadError}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
        <CardHeader className="pb-4">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold text-white">{t("add.title")}</CardTitle>
            <CardDescription className="text-zinc-400">{t("add.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {apps.length > 0 ? (
            <div
              className={cn(
                "flex flex-col gap-2 sm:items-center sm:justify-between",
                isRtl ? "sm:flex-row-reverse" : "sm:flex-row",
              )}
            >
              <label className="flex flex-col gap-1.5 text-sm sm:max-w-xs">
                <span className="font-medium text-zinc-300">{t("filter.label")}</span>
                <select
                  value={filterAppId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setFilterAppId(e.target.value === "all" ? "all" : id);
                    if (id !== "all") {
                      setWorkspaceAppId(id);
                    }
                  }}
                  className="h-11 rounded-md border border-white/[0.1] bg-[#070a0f] px-3 text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                >
                  <option value="all">{t("filter.allApps")}</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {filterAppId === "all" ? (
                <label className="flex flex-col gap-1.5 text-sm sm:max-w-xs">
                  <span className="font-medium text-zinc-300">{t("add.targetAppLabel")}</span>
                  <select
                    value={addTargetAppId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setAddTargetAppId(id);
                      setWorkspaceAppId(id || null);
                    }}
                    className="h-11 rounded-md border border-white/[0.1] bg-[#070a0f] px-3 text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-zinc-500 sm:pt-8">
                  {t("add.lockedToFilteredApp", {
                    app: appNameById.get(filterAppId) ?? "",
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-amber-200/90">{t("add.noAppsInWorkspace")}</p>
          )}

          <CountrySelector
            value={selectedCountries}
            onChange={setSelectedCountries}
            disabled={apps.length === 0 || blockingError || previewPending || previewMarketsPending}
          />
          {hasActivePreview ? (
            <p className="text-xs leading-relaxed text-zinc-500" role="note">
              {countriesOutOfSync
                ? t("serper.previewCountriesOutOfSync")
                : t("serper.previewCountriesSynced")}
            </p>
          ) : null}

          <form className="space-y-4" onSubmit={onAdd}>
            <div className="min-w-0 space-y-2">
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t("add.placeholder")}
                className="h-10 border-white/[0.1] bg-[#070a0f] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-emerald-500/40"
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "kw-add-error" : "kw-add-helper"}
                disabled={apps.length === 0 || blockingError}
              />
              <p id="kw-add-helper" className="text-xs text-zinc-500">
                {t("add.helper")}
              </p>
              {formError ? (
                <p id="kw-add-error" className="text-xs text-rose-400" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>

            {selectedCountries.length > 0 && apps.length > 0 && !blockingError ? (
              <div className="space-y-1.5 text-xs leading-relaxed text-zinc-400">
                <p>{t("serper.previewCreditsWillUse", {
                  credits: previewCreditCost,
                  per: AI_CREDIT_COSTS.serper_preview_per_country,
                })}</p>
                <p className="text-zinc-500" role="note">
                  {t("serper.creditsRules")}
                </p>
              </div>
            ) : null}

            <TooltipProvider>
              <div className="flex flex-wrap items-center gap-3">
                <Tooltip
                  content={
                    <span className="block max-w-[280px] leading-snug text-zinc-200">
                      {tSerper("previewButtonTooltip", { appName: tooltipAppName })}
                    </span>
                  }
                  side="top"
                  className="max-w-[300px] border border-white/[0.12] bg-[#0a0d12] px-3 py-2.5 text-xs leading-relaxed text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.04]"
                  asChild
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onPreviewButtonClick()}
                    disabled={
                      previewPending ||
                      previewMarketsPending ||
                      term.trim().length < 2 ||
                      selectedCountries.length === 0 ||
                      blockingError
                    }
                    aria-label={
                      hasActivePreview
                        ? t("serper.startNewSearchTooltip")
                        : tSerper("previewButtonTooltip", { appName: tooltipAppName })
                    }
                    className="h-10 min-h-10 shrink-0 gap-2 border-emerald-500/30 bg-emerald-500/[0.07] px-4 text-emerald-100 hover:bg-emerald-500/15 hover:text-white disabled:opacity-40"
                  >
                    {previewPending ? (
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="size-4 shrink-0" aria-hidden />
                    )}
                    {previewPending
                      ? tSerper("previewPending")
                      : hasActivePreview
                        ? t("serper.startNewSearch")
                        : tSerper("previewButton")}
                  </Button>
                </Tooltip>
                <Tooltip
                  content={
                    <span className="block max-w-[280px] leading-snug text-zinc-200">
                      {t("add.buttonTooltip", { appName: tooltipAppName })}
                    </span>
                  }
                  side="top"
                  className="max-w-[300px] border border-white/[0.12] bg-[#0a0d12] px-3 py-2.5 text-xs leading-relaxed text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.04]"
                  asChild
                >
                  <Button
                    type="submit"
                    disabled={
                      mutationPending ||
                      term.trim().length < 2 ||
                      apps.length === 0 ||
                      blockingError
                    }
                    aria-label={t("add.buttonTooltip", { appName: tooltipAppName })}
                    className="h-10 min-h-10 shrink-0 bg-emerald-600 px-4 text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {mutationPending ? t("add.buttonPending") : t("add.button")}
                  </Button>
                </Tooltip>
              </div>
            </TooltipProvider>
          </form>

          {previewResults && previewResults.length > 0 && previewHidden ? (
            <div className="mt-1">
              <PreviewHiddenBar
                term={term}
                marketCount={previewMarketCodes.length}
                creditsUsed={previewCreditsUsed}
                promotePending={saveSerperPending}
                canPromote={Boolean(scopePackageName && scopeAppId && !blockingError)}
                onShowPreview={() => setPreviewHidden(false)}
                onPromote={() => void onSaveSerperPreview(previewMarketCodes)}
                isRtl={isRtl}
              />
            </div>
          ) : null}

          {previewResults && previewResults.length > 0 && !previewHidden ? (
            <div className="mt-1 space-y-4">
              <PreviewPromotePanel
                term={term}
                isOnWatchlist={isPreviewOnWatchlist}
                promotePending={saveSerperPending}
                canPromote={Boolean(scopePackageName && scopeAppId && !blockingError)}
                needsPackageMessage={!scopePackageName ? t("serper.saveNeedsPackage") : null}
                creditsUsed={previewCreditsUsed}
                onPromote={() => void onSaveSerperPreview(previewMarketCodes)}
                onAdjustMarkets={() => setPreviewMarketsModalOpen(true)}
                onRequestDismiss={() => setPreviewDismissOpen(true)}
                isRtl={isRtl}
              />
              {livePreviewIssueBanner ? (
                <div
                  className="rounded-xl border border-rose-500/35 bg-rose-500/[0.12] px-4 py-3 text-sm leading-relaxed text-rose-50/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-rose-400/15"
                  role="alert"
                >
                  {livePreviewIssueBanner === "all"
                    ? tSerper("previewAllMarketsUnavailable")
                    : tSerper("previewSomeMarketsUnavailable")}
                </div>
              ) : null}
              <SerperPreviewResults
                results={previewResults}
                packageName={scopePackageName ?? undefined}
                appDisplayName={
                  scopeAppId ? (appNameById.get(scopeAppId) ?? undefined) : undefined
                }
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showAiSuggested && scopeAppId && scopeAppRow ? (
        <DiscoveryKeywordsPanel
          workspaceId={workspaceId}
          appId={scopeAppId}
          appName={scopeAppRow.name}
          appCategory={scopeAppRow.category}
          generationId={discoveryGenerationIdValue}
          hasAiListingSource={Boolean(aiPack)}
          suggestions={discoverySuggestionsResolved}
          trackedKeys={trackedTermKeysForApp}
          market={selectedCountries[0] || "us"}
          locale={locale}
          isRtl={isRtl}
          mutationPending={mutationPending}
          trackingAiTerm={trackingAiTerm}
          blockingError={blockingError}
          onTrack={onTrackAiSuggested}
          onWorkflowChange={() => refresh()}
        />
      ) : null}

      {showAiSuggested ? (
        <div className="relative py-1" aria-hidden>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        </div>
      ) : null}

      <Card
        className={cn(
          "overflow-hidden border-white/[0.08] bg-[#0c1018] text-zinc-100 ring-1 ring-white/[0.03]",
          showAiSuggested && "shadow-[0_-12px_40px_-32px_rgba(16,185,129,0.25)]",
        )}
      >
        <CardHeader className="space-y-4 border-b border-white/[0.06] pb-5">
          <div
            className={cn(
              "flex w-full flex-col gap-4 sm:items-start sm:justify-between sm:gap-6",
              isRtl ? "sm:flex-row-reverse" : "sm:flex-row",
            )}
          >
            <div className="min-w-0 flex-1 space-y-2 text-start">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t("sections.trackedKicker")}
              </p>
              <CardTitle className="text-xl font-semibold text-white sm:text-2xl">{t("table.title")}</CardTitle>
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{t("sections.trackedSubtitle")}</p>
              <p className="text-xs leading-relaxed text-zinc-500">{t("table.rankLegend")}</p>
            </div>
            <div className="shrink-0 self-stretch sm:self-start">
              <div
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-1.5 text-[11px] font-medium text-emerald-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-emerald-500/10 sm:inline-flex sm:w-auto sm:justify-start sm:ps-1 sm:pe-3"
                role="status"
              >
                <span className="relative flex size-2 shrink-0" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/50" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]" />
                </span>
                <span className="text-start leading-snug">{t("sections.liveRankEngineBadge")}</span>
              </div>
            </div>
          </div>
          <p
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2.5 text-start text-xs leading-relaxed text-emerald-100/90"
            role="note"
          >
            {t("table.liveRankingsNote", {
              per: AI_CREDIT_COSTS.serper_preview_per_country,
            })}
          </p>
          <p
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-start text-xs leading-relaxed text-zinc-400"
            role="note"
          >
            {t("table.estimatedRanksDisclaimer")}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {appFilteredRows.length === 0 ? (
            <div className="px-6 py-16 text-center sm:px-10 sm:py-20">
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400 shadow-[0_0_48px_-16px_rgba(16,185,129,0.45)]">
                <TrendingUp className="size-8" aria-hidden />
              </div>
              <p className="text-lg font-semibold tracking-tight text-white">{t("empty.title")}</p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">{t("empty.body")}</p>
              <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-zinc-500">{t("empty.hint")}</p>
            </div>
          ) : (
            <>
              <KeywordWatchlistToolbar
                search={tableSearch}
                onSearchChange={setTableSearch}
                marketFilter={marketFilter}
                onToggleMarket={toggleMarketFilter}
                onSelectAllMarkets={() => setMarketFilter(new Set())}
                onExportCsv={onExportWatchlistCsv}
                exportDisabled={countryFilteredRows.length === 0 || blockingError}
                countryLabel={countryLabel}
              />
              {countryFilteredRows.length === 0 && !showWatchlistSkeleton ? (
                <p className="px-6 py-12 text-center text-sm text-zinc-400">
                  {t("table.noFilterResults")}
                </p>
              ) : (
                <KeywordWatchlistTable
                  rows={paginatedWatchlistRows}
                  totalFilteredCount={countryFilteredRows.length}
                  page={safeWatchlistPage}
                  pageSize={watchlistPageSize}
                  pageCount={watchlistPageCount}
                  onPageChange={setWatchlistPage}
                  onPageSizeChange={setWatchlistPageSize}
                  appNameById={appNameById}
                  filterAppId={filterAppId}
                  showSkeleton={showWatchlistSkeleton}
                  blockingError={blockingError}
                  mutationPending={mutationPending}
                  serperRowRefreshId={serperRowRefreshId}
                  countryLabel={countryLabel}
                  isRtl={isRtl}
                  onHistory={setHistoryFor}
                  onDelete={(id) => void onDelete(id)}
                  onSerperRefresh={(id) => {
                    const term = flatRows.find((r) => r.source.id === id)?.source.term ?? id;
                    setPendingRefreshRow({ id, term });
                  }}
                  competitorSlots={competitorSlots}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <KeywordHistoryDialog
        workspaceId={workspaceId}
        keyword={historyFor}
        apps={apps}
        open={historyFor != null}
        onOpenChange={(next) => !next && setHistoryFor(null)}
      />

      <PreviewDismissDialog
        open={previewDismissOpen}
        onOpenChange={setPreviewDismissOpen}
        onConfirm={hidePreview}
        creditsUsed={previewCreditsUsed}
        marketCount={previewMarketCodes.length}
      />

      <PreviewStartNewDialog
        open={previewStartNewOpen}
        onOpenChange={setPreviewStartNewOpen}
        pending={previewPending}
        onConfirm={() => void onConfirmStartNewSearch()}
      />

      <PreviewMarketsModal
        open={previewMarketsModalOpen}
        onOpenChange={setPreviewMarketsModalOpen}
        term={term}
        previewCountries={
          countriesOutOfSync ? selectedCountries : previewMarketCodes
        }
        pending={previewMarketsPending}
        onApply={(countries) => void onApplyPreviewMarkets(countries)}
      />

      {/* ── Serper Refresh Credit Confirmation Modal ─────────────────────── */}
      {pendingRefreshRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPendingRefreshRow(null)}
        >
          <div
            className="mx-4 w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0c1018] p-6 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.75)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
              <ScanLine className="size-5 text-emerald-400" aria-hidden />
            </div>

            {/* Title */}
            <h2 className="text-base font-semibold tracking-tight text-white">
              Confirm Marketplace Scan for &ldquo;{pendingRefreshRow.term}&rdquo;?
            </h2>

            {/* Body */}
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              This will execute a live Play Store index query for{" "}
              <span className="font-semibold text-emerald-300">
                &ldquo;{pendingRefreshRow.term}&rdquo;
              </span>{" "}
              and record the current rank position for your app in the specified market.
            </p>

            {/* Credit protection tooltip block */}
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs leading-relaxed text-zinc-400">
                💡 This operation costs exactly{" "}
                <span className="font-semibold text-zinc-200">
                  {AI_CREDIT_COSTS.serper_preview_per_country} credit
                </span>
                . Please note: if your app&apos;s rank position has not shifted on the live
                store charts since your last update, your rank score will remain the same.
              </p>
            </div>

            {/* Insufficient credits warning (if blocked) */}
            {blockingError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rose-400" aria-hidden />
                <p className="text-xs text-rose-400/90">
                  An error is preventing operations. Please refresh the page and try again.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPendingRefreshRow(null)}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/80 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={blockingError || serperRowRefreshId != null}
                onClick={() => {
                  const { id } = pendingRefreshRow;
                  setPendingRefreshRow(null);
                  void onSerperRefreshRow(id);
                }}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition-[background-color,box-shadow]",
                  "bg-emerald-600 shadow-[0_2px_12px_-4px_rgba(34,197,94,0.5)]",
                  "hover:bg-emerald-500 hover:shadow-[0_4px_18px_-4px_rgba(34,197,94,0.55)]",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                Confirm &amp; Deduct {AI_CREDIT_COSTS.serper_preview_per_country} Credit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

