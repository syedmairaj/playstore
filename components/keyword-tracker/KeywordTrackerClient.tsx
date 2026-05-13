"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Minus, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeywordHistoryDialog } from "@/components/keyword-tracker/keyword-history-dialog";
import { Input } from "@/components/ui/input";
import { CountrySelector } from "@/components/country-selector";
import {
  SerperPreviewResults,
  type SerperPreviewCountry,
} from "@/components/serper/serper-preview-results";
import {
  COUNTRY_FLAG_EMOJI,
  countriesForKeywordRankChips,
  primaryMarketCode,
  type SupportedCountryCode,
} from "@/lib/countries";
import { formatRelativePastSince } from "@/lib/intl/format-relative-past";
import type { LatestAiListingKeywordsRow } from "@/lib/keywords/latest-ai-listing-by-app";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import {
  AI_CREDIT_COSTS,
  KEYWORD_TRACK_AI_FREE_PER_GENERATION,
} from "@/lib/features/billing/credit-costs";
import { formatRankForDisplay } from "@/lib/keywords/format-rank-display";
import { cn } from "@/lib/utils";

export type KeywordTrackerClientProps = {
  workspaceId: string;
  initialKeywords: KeywordWithRanks[];
  apps: WorkspaceAppListRow[];
  keywordsLoadError?: string | null;
  appsLoadError?: string | null;
  /** Workspace AI credits (non-mutating); used for Serper preview pre-check UX. */
  aiCreditsRemaining?: number;
  /** Latest AI listing keyword suggestions per app (listing_generations with app_id). */
  latestAiByApp?: Record<string, LatestAiListingKeywordsRow>;
};

const MS_7D = 7 * 24 * 60 * 60 * 1000;

function bestRankFromRanks(ranks: { rank: number | null }[]): number | null {
  const nums = ranks.map((r) => r.rank).filter((n): n is number => n != null);
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

function trendWindowRanks(
  ranksChronological: { rank: number | null; captured_at: string }[],
): number[] {
  const now = Date.now();
  const inWindow = ranksChronological.filter((r) => {
    if (r.rank == null) return false;
    return now - new Date(r.captured_at).getTime() <= MS_7D;
  });
  const values = inWindow.map((r) => r.rank as number);
  if (values.length >= 2) return values.slice(-7);
  const fallback = ranksChronological
    .filter((r) => r.rank != null)
    .map((r) => r.rank as number);
  return fallback.slice(-7);
}

function TrendBars({ values, title }: { values: number[]; title: string }) {
  if (values.length === 0) {
    return <span className="text-xs text-zinc-500">—</span>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  return (
    <div className="flex h-9 max-w-[120px] items-end gap-0.5" aria-hidden title={title}>
      {values.map((v, i) => {
        const norm = (max - v) / span;
        const h = 6 + norm * 26;
        return (
          <div
            key={`${i}-${v}`}
            title={`#${v}`}
            className="w-1.5 shrink-0 rounded-sm bg-emerald-500/75 ring-1 ring-emerald-400/20"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

function RankDelta7d({
  values,
  labels,
}: {
  values: number[];
  labels: { improved: string; worse: string; same: string };
}) {
  if (values.length < 2) {
    return <span className="text-xs text-zinc-500">—</span>;
  }
  const prev = values[0];
  const curr = values[values.length - 1];
  if (curr < prev) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
        <ArrowUp className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{labels.improved}</span>
        <span aria-hidden>{prev - curr}</span>
      </span>
    );
  }
  if (curr > prev) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400/90">
        <ArrowDown className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{labels.worse}</span>
        <span aria-hidden>{curr - prev}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      <Minus className="size-3.5" aria-hidden />
      <span>{labels.same}</span>
    </span>
  );
}

export function KeywordTrackerClient({
  workspaceId,
  initialKeywords,
  apps,
  keywordsLoadError,
  appsLoadError,
  latestAiByApp = {},
  aiCreditsRemaining,
}: KeywordTrackerClientProps) {
  const t = useTranslations("keywordTracker");
  const tSerper = useTranslations("serperPreview");
  const tCountrySel = useTranslations("countrySelector");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mutationPending, setMutationPending] = useState(false);
  const [rows, setRows] = useState<KeywordWithRanks[]>(initialKeywords);
  const [term, setTerm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<KeywordWithRanks | null>(null);
  const [filterAppId, setFilterAppId] = useState<string | "all">("all");
  const [addTargetAppId, setAddTargetAppId] = useState<string>(() => apps[0]?.id ?? "");
  const [trackingAiTerm, setTrackingAiTerm] = useState<string | null>(null);
  const [saveSerperPending, setSaveSerperPending] = useState(false);
  const [serperRowRefreshId, setSerperRowRefreshId] = useState<string | null>(null);
  // Live Play Store preview state. Default to the Arabic-first market when the
  // user's locale is Arabic so previews feel relevant out of the box.
  const defaultCountry: SupportedCountryCode =
    locale === "ar" ? "sa" : "us";
  const [selectedCountries, setSelectedCountries] = useState<SupportedCountryCode[]>(
    () => [defaultCountry],
  );
  const [previewPending, setPreviewPending] = useState(false);
  const [previewResults, setPreviewResults] = useState<SerperPreviewCountry[] | null>(null);

  useEffect(() => {
    setRows(initialKeywords);
  }, [initialKeywords]);

  useEffect(() => {
    if (apps[0]?.id && !apps.some((a) => a.id === addTargetAppId)) {
      setAddTargetAppId(apps[0].id);
    }
  }, [apps, addTargetAppId]);

  const visibleRows = useMemo(() => {
    if (filterAppId === "all") return rows;
    return rows.filter((r) => r.app_id === filterAppId);
  }, [rows, filterAppId]);

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

  const scopeAppId =
    filterAppId !== "all"
      ? filterAppId
      : addTargetAppId || apps[0]?.id || "";

  const scopePackageName = useMemo(() => {
    if (!scopeAppId) return null;
    const row = apps.find((a) => a.id === scopeAppId);
    const p = row?.package_name?.trim();
    return p && p.length > 0 ? p : null;
  }, [apps, scopeAppId]);

  const aiPack = scopeAppId ? latestAiByApp[scopeAppId] : undefined;

  const trackedTermKeysForApp = useMemo(() => {
    const set = new Set<string>();
    if (!scopeAppId) return set;
    for (const r of rows) {
      if (r.app_id !== scopeAppId) continue;
      set.add(r.term.trim().toLowerCase());
    }
    return set;
  }, [rows, scopeAppId]);

  const aiSuggestedRows = useMemo(() => {
    if (!aiPack?.keywordSuggestions?.length) return [];
    return aiPack.keywordSuggestions.filter((term) => {
      const k = term.trim().toLowerCase();
      return k.length > 0 && !trackedTermKeysForApp.has(k);
    });
  }, [aiPack, trackedTermKeysForApp]);

  const serperPreviewCredits = useMemo(
    () => selectedCountries.length * AI_CREDIT_COSTS.serper_preview_per_country,
    [selectedCountries.length],
  );

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
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: trimmed,
          appId: targetApp,
          market: primaryMarket,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !json.ok) {
        if (json.error?.code === "duplicate_keyword" || res.status === 409) {
          setFormError(t("add.errorDuplicate"));
        } else {
          setFormError(json.error?.message ?? t("add.errorGeneric"));
        }
        return;
      }

      toast.success(t("add.toastSuccess"));
      setTerm("");
      refresh();
    } finally {
      setMutationPending(false);
    }
  }

  async function onTrackAiSuggested(term: string) {
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
        creditsCharged?: number;
        creditsRemaining?: number;
        error?: { code?: string; message?: string; remaining?: number; required?: number };
      };

      if (!res.ok || !json.ok) {
        if (res.status === 402 || json.error?.code === "insufficient_credits") {
          const rem = json.error?.remaining;
          const req = json.error?.required;
          const suffix =
            typeof rem === "number" && typeof req === "number"
              ? ` (${rem} / ${req})`
              : "";
          toast.error(`${t("aiSuggestedKeywords.insufficientCredits")}${suffix}`);
        } else {
          toast.error(json.error?.message ?? t("aiSuggestedKeywords.trackError"));
        }
        return;
      }

      const charged = json.creditsCharged ?? 0;
      if (charged > 0) {
        toast.success(
          t("aiSuggestedKeywords.toastTrackedPaid", {
            term: trimmed,
            credits: charged,
          }),
        );
      } else {
        toast.success(t("aiSuggestedKeywords.toastTrackedFree", { term: trimmed }));
      }
      refresh();
    } finally {
      setTrackingAiTerm(null);
    }
  }

  async function onDelete(id: string) {
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
      refresh();
    } finally {
      setMutationPending(false);
    }
  }

  const blockingError = Boolean(keywordsLoadError || appsLoadError);

  const showAiSuggested = aiSuggestedRows.length > 0 && Boolean(aiPack);

  const onPreviewRanks = useCallback(async () => {
    if (previewPending) return;
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setFormError(t("add.errorEmpty"));
      return;
    }
    if (selectedCountries.length === 0) return;

    const creditCost = selectedCountries.length * AI_CREDIT_COSTS.serper_preview_per_country;
    if (typeof aiCreditsRemaining === "number" && aiCreditsRemaining < creditCost) {
      toast.error(
        tSerper("insufficientCredits", {
          credits: creditCost,
          count: selectedCountries.length,
        }),
      );
      return;
    }

    setPreviewPending(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/serper/play-store-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          keyword: trimmed,
          countries: selectedCountries,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        results?: SerperPreviewCountry[];
        error?: { code?: string; message?: string; required?: number; remaining?: number };
      };

      if (!res.ok || !json.ok || !Array.isArray(json.results)) {
        if (res.status === 402 || json.error?.code === "insufficient_credits") {
          const req = json.error?.required ?? creditCost;
          const count = selectedCountries.length;
          toast.error(tSerper("insufficientCredits", { credits: req, count }));
        } else if (
          res.status === 503 ||
          json.error?.code === "serper_not_configured"
        ) {
          toast.message(tSerper("configMissingTitle"), {
            description: tSerper("configMissingBody"),
          });
        } else {
          toast.error(json.error?.message ?? tSerper("errorGeneric"));
        }
        setPreviewResults(null);
        return;
      }
      setPreviewResults(json.results);
    } catch {
      toast.error(tSerper("errorGeneric"));
      setPreviewResults(null);
    } finally {
      setPreviewPending(false);
    }
  }, [
    previewPending,
    term,
    selectedCountries,
    workspaceId,
    t,
    tSerper,
    aiCreditsRemaining,
  ]);

  const onSaveSerperPreview = useCallback(async () => {
    if (saveSerperPending || !previewResults?.length) return;
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

    const market = (selectedCountries[0] ?? "us") as SupportedCountryCode;
    setSaveSerperPending(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords/serper-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: trimmed,
          appId: targetApp,
          market,
          results: previewResults,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        createdKeyword?: boolean;
        error?: { code?: string; message?: string };
      };
      if (!res.ok || !json.ok) {
        if (json.error?.code === "duplicate_keyword" || res.status === 409) {
          toast.error(t("add.errorDuplicate"));
        } else if (json.error?.code === "no_package_name") {
          toast.error(t("serper.saveNeedsPackage"));
        } else {
          toast.error(json.error?.message ?? t("serper.saveError"));
        }
        return;
      }
      toast.success(
        json.createdKeyword ? t("serper.saveToastNew") : t("serper.saveToastUpdated"),
      );
      setPreviewResults(null);
      refresh();
    } catch {
      toast.error(t("serper.saveError"));
    } finally {
      setSaveSerperPending(false);
    }
  }, [
    saveSerperPending,
    previewResults,
    term,
    scopeAppId,
    scopePackageName,
    selectedCountries,
    workspaceId,
    t,
    refresh,
  ]);

  const onSerperRefreshRow = useCallback(
    async (keywordId: string) => {
      if (serperRowRefreshId || blockingError) return;
      setSerperRowRefreshId(keywordId);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/keywords/${keywordId}/serper-refresh`,
          { method: "POST" },
        );
        const json = (await res.json()) as {
          ok?: boolean;
          creditsCharged?: number;
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
        const charged = json.creditsCharged ?? 0;
        toast.success(
          charged > 0
            ? t("serper.rowRefreshToast", { credits: charged })
            : t("serper.rowRefreshToastFree"),
        );
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
      t,
      tSerper,
      refresh,
    ],
  );

  return (
    <div className="space-y-8">
      {blockingError ? (
        <div
          className="flex flex-col items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
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
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg font-semibold text-white">{t("add.title")}</CardTitle>
          <CardDescription className="text-zinc-400">{t("add.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apps.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex flex-col gap-1.5 text-sm sm:max-w-xs">
                <span className="font-medium text-zinc-300">{t("filter.label")}</span>
                <select
                  value={filterAppId}
                  onChange={(e) =>
                    setFilterAppId(e.target.value === "all" ? "all" : e.target.value)
                  }
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
                    onChange={(e) => setAddTargetAppId(e.target.value)}
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
            disabled={apps.length === 0 || blockingError}
          />

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
              <p className="text-xs leading-relaxed text-zinc-400">
                {t("serper.costPreview", {
                  credits: serperPreviewCredits,
                  count: selectedCountries.length,
                })}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void onPreviewRanks()}
                disabled={
                  previewPending ||
                  term.trim().length < 2 ||
                  selectedCountries.length === 0 ||
                  blockingError
                }
                className="h-10 min-h-10 shrink-0 gap-2 border-emerald-500/30 bg-emerald-500/[0.07] px-4 text-emerald-100 hover:bg-emerald-500/15 hover:text-white disabled:opacity-40"
              >
                {previewPending ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                )}
                {previewPending ? tSerper("previewPending") : tSerper("previewButton")}
              </Button>
              <Button
                type="submit"
                disabled={
                  mutationPending ||
                  term.trim().length < 2 ||
                  apps.length === 0 ||
                  blockingError
                }
                className="h-10 min-h-10 shrink-0 bg-emerald-600 px-4 text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {mutationPending ? t("add.buttonPending") : t("add.button")}
              </Button>
            </div>
          </form>

          {previewResults && previewResults.length > 0 ? (
            <div className="mt-1 space-y-4">
              <SerperPreviewResults results={previewResults} />
              <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.08] p-4 sm:p-5">
                <p className="text-sm font-medium text-emerald-50">{t("serper.saveTitle")}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-emerald-100/80">
                  {t("serper.saveHint", { market: (selectedCountries[0] ?? "us").toUpperCase() })}
                </p>
                {!scopePackageName ? (
                  <p className="mt-3 text-xs text-amber-200/90">{t("serper.saveNeedsPackage")}</p>
                ) : null}
                <Button
                  type="button"
                  className="mt-4 h-11 w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400 sm:w-auto"
                  disabled={
                    saveSerperPending ||
                    !scopePackageName ||
                    !scopeAppId ||
                    blockingError ||
                    mutationPending
                  }
                  onClick={() => void onSaveSerperPreview()}
                >
                  {saveSerperPending ? (
                    <Loader2 className="me-2 size-4 shrink-0 animate-spin" aria-hidden />
                  ) : null}
                  {saveSerperPending ? t("serper.savePending") : t("serper.saveButton")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showAiSuggested ? (
        <section
          className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/[0.28] via-[#0a0f14] to-[#060a0f] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_28px_56px_-28px_rgba(16,185,129,0.4)]"
          aria-labelledby="ai-suggested-kw-heading"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_100%_0%,rgba(16,185,129,0.16),transparent_52%)]"
            aria-hidden
          />
          <div className="relative space-y-6 px-5 pb-6 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
            <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                  {t("sections.aiSuggestedKicker")}
                </p>
                <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-50/95 ring-1 ring-emerald-500/25">
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.95)]" aria-hidden />
                  <span className="min-w-0 leading-snug">{t("aiSuggestedKeywords.sourceLabel")}</span>
                </p>
                <div className="space-y-2">
                  <h2
                    id="ai-suggested-kw-heading"
                    className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
                  >
                    {t("aiSuggestedKeywords.title")}
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
                    {t("aiSuggestedKeywords.subtitle")}
                  </p>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {t("aiSuggestedKeywords.pricingNote", {
                    free: KEYWORD_TRACK_AI_FREE_PER_GENERATION,
                    per: AI_CREDIT_COSTS.keyword_track_ai_per_keyword,
                  })}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-emerald-500/15 bg-[#04070a]/95 shadow-inner ring-1 ring-emerald-500/10 backdrop-blur-sm">
              {aiSuggestedRows.map((kw) => (
                <li
                  key={kw}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:flex-nowrap sm:gap-4 sm:px-5"
                >
                  <span className="min-w-0 flex-1 text-[15px] font-medium text-zinc-50">{kw}</span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={mutationPending || Boolean(trackingAiTerm) || blockingError}
                    className="h-10 shrink-0 rounded-xl border border-emerald-300/35 bg-emerald-500 px-5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(16,185,129,0.45),0_8px_24px_-6px_rgba(16,185,129,0.65)] transition hover:border-emerald-200/50 hover:bg-emerald-400 hover:text-emerald-950 hover:shadow-[0_0_0_1px_rgba(167,243,208,0.5),0_12px_32px_-8px_rgba(16,185,129,0.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[#04070a] disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => void onTrackAiSuggested(kw)}
                  >
                    {trackingAiTerm === kw.trim()
                      ? t("aiSuggestedKeywords.tracking")
                      : t("aiSuggestedKeywords.track")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>
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
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
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
            {t("table.liveRankingsNote")}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {visibleRows.length === 0 ? (
            <div className="px-6 py-16 text-center sm:px-10 sm:py-20">
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400 shadow-[0_0_48px_-16px_rgba(16,185,129,0.45)]">
                <TrendingUp className="size-8" aria-hidden />
              </div>
              <p className="text-lg font-semibold tracking-tight text-white">{t("empty.title")}</p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">{t("empty.body")}</p>
              <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-zinc-500">{t("empty.demoHint")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-start text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-3.5">{t("table.keyword")}</th>
                    <th className="px-4 py-3.5" title={t("table.rankTooltip")}>
                      {t("table.currentRank")}
                    </th>
                    <th className="px-4 py-3.5" title={t("table.rankTooltip")}>
                      {t("table.bestRank")}
                    </th>
                    <th className="px-4 py-3.5" title={t("table.trendTooltip")}>
                      {t("table.trend")}
                    </th>
                    <th className="px-4 py-3.5">{t("table.lastSync")}</th>
                    <th className="px-5 py-3.5 text-end">{t("table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const trendVals = trendWindowRanks(row.ranks);
                    const best = bestRankFromRanks(row.ranks);
                    const latest = row.latest;
                    const rankFmt = { notInTop: t("table.rankNotInTop") };
                    const chipCodes = countriesForKeywordRankChips({
                      market: row.market,
                      targetCountries: appRowById.get(row.app_id)?.target_countries ?? null,
                    });
                    const primary = primaryMarketCode(row.market);
                    const rankAuthenticityTitle =
                      primary != null
                        ? t("table.rankAuthenticityTooltip", {
                            country: countryLabel(primary),
                          })
                        : t("table.rankTooltip");
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                      >
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            className="text-start font-medium text-emerald-300/95 underline-offset-4 hover:text-emerald-200 hover:underline"
                            onClick={() => setHistoryFor(row)}
                          >
                            {row.term}
                          </button>
                          {filterAppId === "all" ? (
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {appNameById.get(row.app_id) ?? row.app_id}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 font-mono text-zinc-100">
                          <span
                            className="inline-flex max-w-full flex-wrap items-center gap-2"
                            title={rankAuthenticityTitle}
                          >
                            {chipCodes.length > 0 ? (
                              <span className="inline-flex shrink-0 items-center gap-1" aria-hidden>
                                {chipCodes.map((c) => (
                                  <span
                                    key={c}
                                    className="inline-flex items-center rounded-md border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 text-[13px] leading-none tabular-nums shadow-sm"
                                    title={countryLabel(c)}
                                  >
                                    {COUNTRY_FLAG_EMOJI[c]}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                            <span>{formatRankForDisplay(latest?.rank ?? null, rankFmt)}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-zinc-300" title={t("table.rankTooltip")}>
                          {best != null ? formatRankForDisplay(best, rankFmt) : "—"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <TrendBars values={trendVals} title={t("table.trendTooltip")} />
                            <RankDelta7d
                              values={trendVals}
                              labels={{
                                improved: t("delta.improved"),
                                worse: t("delta.worse"),
                                same: t("delta.same"),
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-start text-zinc-300">
                          {latest?.captured_at ? (
                            <span className="text-sm tabular-nums text-zinc-200">
                              {formatRelativePastSince(latest.captured_at, locale)}
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-emerald-300/90 hover:bg-emerald-500/10 hover:text-emerald-200"
                              disabled={
                                blockingError ||
                                mutationPending ||
                                serperRowRefreshId === row.id
                              }
                              onClick={() => void onSerperRefreshRow(row.id)}
                            >
                              {serperRowRefreshId === row.id ? (
                                <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                              ) : (
                                <RefreshCw className="size-3.5 shrink-0" aria-hidden />
                              )}
                              {serperRowRefreshId === row.id
                                ? t("actions.syncingPlayStore")
                                : t("actions.refreshSerper")}
                            </Button>
                            <span className="text-zinc-600" aria-hidden>
                              ·
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-emerald-300/90 hover:bg-emerald-500/10 hover:text-emerald-200"
                              onClick={() => setHistoryFor(row)}
                            >
                              {t("actions.viewHistory")}
                            </Button>
                            <span className="text-zinc-600" aria-hidden>
                              ·
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300"
                              onClick={() => onDelete(row.id)}
                            >
                              {t("actions.delete")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}
