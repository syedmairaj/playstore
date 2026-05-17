"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
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
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STORAGE_COMPETITORS = "playstore:competitorSpy:competitors";
const STORAGE_TRACKED = "playstore:competitorSpy:tracked";
const STORAGE_PREVIEWS = "playstore:competitorSpy:previews";

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
  latestPerCountry?: unknown[];
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

function SharedKeywordsTableSkeletonBody({ isRtl, label }: { isRtl: boolean; label: string }) {
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
  const [customKeywordDraft, setCustomKeywordDraft] = useState("");
  const [selectedCountries, setSelectedCountriesRaw] = useState<SupportedCountryCode[]>(
    () => [defaultMarket],
  );
  const [activeCountry, setActiveCountry] = useState<SupportedCountryCode>(defaultMarket);
  const [manageOpen, setManageOpen] = useState(false);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [countriesHydrated, setCountriesHydrated] = useState(false);

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
  const [trackedKeywordHints, setTrackedKeywordHints] = useState<TrackedKeywordRankHint[]>([]);
  const [dbLoadPending, setDbLoadPending] = useState(false);
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

  const refreshTrackedKeywordHints = useCallback(async () => {
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
      const hints = json.keywords
        .map((k) => ({
          term: String(k.term ?? "").trim(),
          yourRank: k.latest?.rank ?? null,
        }))
        .filter((k) => k.term.length >= 2)
        .slice(0, 40);
      setTrackedKeywordHints(hints);
      const apiKeys = new Set(hints.map((h) => h.term.toLowerCase()));
      setTrackedTerms((prev) => {
        const merged = [...hints.map((h) => h.term)];
        for (const term of prev) {
          const key = term.toLowerCase();
          if (!apiKeys.has(key)) merged.push(term);
        }
        return merged;
      });
    } catch {
      setTrackedKeywordHints([]);
    }
  }, [apps, keywordTrackerEnabled, targetAppId, workspaceId]);

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
        setTrackedTerms((prev) => prev.filter((t) => !removed.has(t.toLowerCase())));
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

  const sharedRows = useMemo((): (StoredCompetitorSharedRow & { isCustom?: boolean })[] => {
    if (!activeCompetitor) return [];
    const base = previewResults?.length ? countryOverlapShared : activeCompetitor.shared;
    const automated = filterSharedRowsBothSidesTracked(base).filter(
      (row) => !dismissedSharedKeywords.has(row.keyword.trim().toLowerCase()),
    );
    const seen = new Set(automated.map((r) => r.keyword.trim().toLowerCase()));
    const custom: (StoredCompetitorSharedRow & { isCustom: boolean })[] = [];
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
      });
    }
    return [...automated, ...custom];
  }, [
    activeCompetitor,
    activeCountry,
    countryOverlapShared,
    dismissedSharedKeywords,
    previewResults,
    sessionKeywordStack,
  ]);

  const sharedEmptyTerritory = Boolean(
    activeCompetitor &&
      previewResults?.length &&
      previewHasCountryBlock(previewResults, activeCountry) &&
      countryOverlapShared.length === 0,
  );

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
    (keywords: string | string[]) => {
      const list = Array.isArray(keywords)
        ? keywords
        : keywords
            .split(/[,;\n]+/u)
            .map((s) => s.trim())
            .filter(Boolean);
      if (list.length) {
        setPlaystoreInjectedKeywordContext(list.join(", "));
      }
      const appId = targetAppId || apps[0]?.id;
      const ok = navigateToListingOptimizer(
        router,
        workspaceId,
        list.join(", "),
        appId,
      );
      if (!ok) {
        toast.error(t("optimizerNavFailed"));
      }
    },
    [apps, router, targetAppId, workspaceId, t],
  );

  const removeSharedRow = useCallback(
    (row: StoredCompetitorSharedRow & { isCustom?: boolean }) => {
      const key = row.keyword.trim().toLowerCase();
      if (!key) return;
      if (row.isCustom) {
        setSessionKeywordStack((prev) => prev.filter((x) => x.toLowerCase() !== key));
        return;
      }
      setDismissedSharedKeywords((prev) => new Set([...prev, key]));
    },
    [],
  );

  const addCustomKeywordToStack = useCallback(() => {
    const trimmed = customKeywordDraft.trim();
    if (trimmed.length < 2) {
      toast.error(tShared("addKeywordError"));
      return;
    }
    const key = trimmed.toLowerCase();
    setSessionKeywordStack((prev) =>
      prev.some((x) => x.toLowerCase() === key) ? prev : [...prev, trimmed],
    );
    setCustomKeywordDraft("");
  }, [customKeywordDraft, tShared]);

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
          const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
          if (!res.ok || !json.ok) {
            toast.error(json.error?.message ?? t("manage.deleteError"));
            return;
          }
        }
        removeCompetitorLocal(competitor.id);
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
            shared: competitor.shared,
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

      const existingId = competitors.find((c) => c.packageId === built.packageId)?.id;
      const next: StoredCompetitor = {
        id: existingId ?? `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        query: built.query,
        displayName: built.displayName,
        packageId: built.packageId,
        topKeywords: built.topKeywords,
        shared: built.shared,
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

  async function onTrackKeyword(term: string) {
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

              <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={onAnalyzeRequest}>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("add.placeholder")}
                    disabled={blockingError}
                    className="h-11 border-white/[0.1] bg-[#070a0f] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-emerald-500/40"
                  />
                  <p className="text-xs leading-relaxed text-zinc-400">{t("add.aiHelper")}</p>
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
                <Button
                  type="submit"
                  disabled={
                    analyzePending ||
                    query.trim().length < 2 ||
                    blockingError ||
                    selectedCountries.length === 0
                  }
                  className="h-11 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  {analyzePending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t("add.buttonPending")}
                    </span>
                  ) : analyzeCreditCost === 5 ? (
                    t("add.buttonFiveCredits")
                  ) : (
                    t("add.buttonWithCredits", { credits: analyzeCreditCost })
                  )}
                </Button>
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
                  <p className="max-w-2xl text-sm text-zinc-400">{t("shared.subtitle")}</p>
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
                    placeholder={tShared("addKeywordPlaceholder")}
                    className="h-9 flex-1 border-white/10 bg-[#070a0f] text-sm text-zinc-100 placeholder:text-zinc-500"
                    aria-label={tShared("addKeywordPlaceholder")}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-white/10 text-zinc-200"
                    onClick={addCustomKeywordToStack}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {tShared("addCustomKeyword")}
                  </Button>
                </div>
              </div>
              {(dbLoadPending || previewPending) && !previewResults ? (
                <SharedKeywordsTableSkeleton isRtl={isRtl} />
              ) : (
              <div
                className={cn(
                  "overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1018]",
                  isRtl && "font-arabic",
                )}
                dir={gridDir}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-start text-sm">
                    <thead className="border-b border-white/[0.06] bg-[#070a0f] text-xs text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">{t("gap.columns.keyword")}</th>
                        <th className="px-4 py-3 font-medium">{t("myCompetitors.yourRank")}</th>
                        <th className="px-4 py-3 font-medium">{t("myCompetitors.theirRank")}</th>
                        <th className="px-4 py-3 text-end font-medium">{tShared("columns.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharedRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center">
                            <p className="text-sm font-medium text-zinc-300">
                              {sharedEmptyTerritory
                                ? t("shared.emptyTerritoryTitle")
                                : previewResults?.length
                                  ? t("shared.emptyAfterAnalyzeTitle")
                                  : t("shared.emptyTitle")}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                              {sharedEmptyTerritory
                                ? t("shared.emptyTerritoryBody", {
                                    competitor: activeCompetitor?.displayName ?? "",
                                    country: activeCountryLabel,
                                  })
                                : previewResults?.length
                                  ? t("shared.emptyAfterAnalyzeBody")
                                  : t("shared.emptyBody")}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        sharedRows.map((row) => (
                          <tr
                            key={row.keyword}
                            className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]"
                          >
                            <td className="px-4 py-3 text-zinc-200">{row.keyword}</td>
                            <td className="px-4 py-3 text-zinc-400">
                              {row.isCustom ? (
                                <span className="text-zinc-500">—</span>
                              ) : (
                                <RankDisplay
                                  rank={row.yourRank}
                                  labels={rankLabels}
                                  context={{
                                    column: "yours",
                                    workspaceAppLive: workspaceAppPlayLive,
                                  }}
                                />
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-emerald-300/90">
                              {row.isCustom ? (
                                <span className="text-zinc-500">—</span>
                              ) : (
                              <RankDisplay
                                rank={row.theirRank}
                                labels={rankLabels}
                                context={{ column: "theirs" }}
                                emphasize
                              />
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
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
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
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
                <p className="max-w-md text-sm text-zinc-500">{t("quickWins.empty")}</p>
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

        </div>

        <div className="flex min-h-0 min-w-0 flex-col lg:border-s lg:border-white/[0.06] lg:ps-10">
          {activeCompetitor ? (
            <CompetitorSpySnapshotCard
              isRtl={isRtl}
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
              onSendToOptimizer={() => {
                const seed = [
                  ...(countryInsights?.topKeywords ?? activeCompetitor.topKeywords),
                  ...(countryInsights?.gaps ?? activeCompetitor.gaps).map((g) => g.keyword),
                ].filter(Boolean);
                pushListingOptimizer(seed.slice(0, 12));
              }}
            />
          ) : (
            <aside
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "rounded-2xl border border-dashed border-white/[0.12] bg-[#080c12]/80 px-5 py-12 text-center text-sm text-zinc-500",
                isRtl && "font-arabic",
              )}
            >
              <Crosshair className="mx-auto mb-3 size-10 text-emerald-500/35" aria-hidden />
              <p>{t("snapshot.emptyBody")}</p>
            </aside>
          )}
        </div>
      </div>

      <p className="rounded-xl border border-white/[0.06] bg-[#080c12] px-4 py-3 text-center text-xs leading-relaxed text-zinc-500">
        {t("disclaimer")}
      </p>
    </div>
  );
}
