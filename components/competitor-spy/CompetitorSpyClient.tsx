"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, Loader2, Sparkles, Target } from "lucide-react";
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
import { type SupportedCountryCode } from "@/lib/countries";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import { cn } from "@/lib/utils";

const STORAGE_COMPETITORS = "playstore:competitorSpy:competitors";
const STORAGE_TRACKED = "playstore:competitorSpy:tracked";

export type CompetitorSpyClientProps = {
  workspaceId: string;
  apps: WorkspaceAppListRow[];
  appsLoadError?: string | null;
  keywordTrackerEnabled: boolean;
};

type SharedRow = { keyword: string; yourRank: number | null; theirRank: number };

export type StoredCompetitor = {
  id: string;
  query: string;
  displayName: string;
  packageId: string;
  topKeywords: string[];
  shared: SharedRow[];
  quickWins: string[];
  gaps: { keyword: string; opportunity: "high" | "medium" }[];
};

function storageKeyCompetitors(workspaceId: string) {
  return `${STORAGE_COMPETITORS}:${workspaceId}`;
}

function storageKeyTracked(workspaceId: string) {
  return `${STORAGE_TRACKED}:${workspaceId}`;
}

function parseCompetitors(raw: string | null): StoredCompetitor[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is StoredCompetitor => x && typeof x === "object" && "id" in x);
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

function mockFromQuery(query: string): StoredCompetitor {
  const trimmed = query.trim();
  const isPackage = trimmed.includes(".");
  const segments = trimmed.split(/[.\s_/]+/).filter(Boolean);
  const tail = (segments[segments.length - 1] ?? "rival").replace(/[^a-zA-Z0-9-]/g, "");
  const titleBase = tail.length > 0 ? tail.charAt(0).toUpperCase() + tail.slice(1) : "Rival";
  const displayName = isPackage ? `${titleBase} (Play)` : titleBase;
  const packageId = isPackage ? trimmed : `com.example.${tail.toLowerCase() || "fitnessapp"}`;

  const topKeywords = ["meditation", "sleep sounds", "habit tracker", "mindfulness", "daily goals"];
  const shared: SharedRow[] = [
    { keyword: "meditation app", yourRank: 14, theirRank: 3 },
    { keyword: "sleep sounds free", yourRank: null, theirRank: 6 },
    { keyword: "mindfulness timer", yourRank: 22, theirRank: 11 },
    { keyword: "calm breathing", yourRank: 9, theirRank: 4 },
  ];
  const quickWins = [
    "They outrank you on “meditation app” — tighten short description + screenshots.",
    "You are closer on “calm breathing” — refresh title keywords this week.",
  ];
  const gaps: { keyword: string; opportunity: "high" | "medium" }[] = [
    { keyword: "white noise mixer", opportunity: "high" },
    { keyword: "guided body scan", opportunity: "medium" },
    { keyword: "focus pomodoro", opportunity: "high" },
    { keyword: "ambient rain sleep", opportunity: "medium" },
  ];

  return {
    id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    query: trimmed,
    displayName,
    packageId,
    topKeywords,
    shared,
    quickWins,
    gaps,
  };
}

function aggregateGaps(competitors: StoredCompetitor[]): { keyword: string; opportunity: "high" | "medium" }[] {
  const best = new Map<string, { keyword: string; opportunity: "high" | "medium" }>();
  for (const c of competitors) {
    for (const g of c.gaps) {
      const key = g.keyword.toLowerCase();
      const cur = best.get(key);
      if (!cur) {
        best.set(key, { keyword: g.keyword, opportunity: g.opportunity });
      } else if (g.opportunity === "high" && cur.opportunity === "medium") {
        best.set(key, { keyword: cur.keyword, opportunity: "high" });
      }
    }
  }
  return [...best.values()];
}

export function CompetitorSpyClient({
  workspaceId,
  apps,
  appsLoadError,
  keywordTrackerEnabled,
}: CompetitorSpyClientProps) {
  const t = useTranslations("competitorSpy");
  const tSerper = useTranslations("serperPreview");
  const locale = useLocale();
  const router = useRouter();
  const [competitors, setCompetitors] = useState<StoredCompetitor[]>([]);
  const [trackedTerms, setTrackedTerms] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [analyzePending, setAnalyzePending] = useState(false);
  const [trackPending, setTrackPending] = useState<string | null>(null);
  const [targetAppId, setTargetAppId] = useState(() => apps[0]?.id ?? "");
  const [selectedCountries, setSelectedCountries] = useState<SupportedCountryCode[]>(
    () => [locale === "ar" ? "sa" : "us"],
  );
  const [previewPending, setPreviewPending] = useState(false);
  const [previewResults, setPreviewResults] = useState<SerperPreviewCountry[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCompetitors(parseCompetitors(sessionStorage.getItem(storageKeyCompetitors(workspaceId))));
    setTrackedTerms(parseTracked(sessionStorage.getItem(storageKeyTracked(workspaceId))));
    setHydrated(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    sessionStorage.setItem(storageKeyCompetitors(workspaceId), JSON.stringify(competitors));
  }, [competitors, hydrated, workspaceId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    sessionStorage.setItem(storageKeyTracked(workspaceId), JSON.stringify(trackedTerms));
  }, [trackedTerms, hydrated, workspaceId]);

  useEffect(() => {
    if (apps[0]?.id && !apps.some((a) => a.id === targetAppId)) {
      setTargetAppId(apps[0].id);
    }
  }, [apps, targetAppId]);

  const gapRows = useMemo(() => aggregateGaps(competitors), [competitors]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const blockingError = Boolean(appsLoadError);

  async function onAnalyze(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      toast.error(t("add.errorEmpty"));
      return;
    }
    setAnalyzePending(true);
    setPreviewResults(null);

    // Fan out: (1) instant illustrative card so the UI never blocks on Serper,
    // (2) live Play Store-only Serper preview in parallel when keys are configured.
    const mockPromise = new Promise<void>((r) => setTimeout(r, 900)).then(() => {
      const next = mockFromQuery(trimmed);
      setCompetitors((prev) => [next, ...prev.filter((p) => p.packageId !== next.packageId)]);
      toast.success(t("add.toastAnalyzed"));
    });

    const livePromise = (async () => {
      if (selectedCountries.length === 0) return;
      setPreviewPending(true);
      try {
        const res = await fetch(`/api/serper/play-store-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            keyword: trimmed,
            countries: selectedCountries,
            restrictToPlayStore: true,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          results?: SerperPreviewCountry[];
          error?: { code?: string; message?: string; required?: number; remaining?: number };
        };
        if (!res.ok || !json.ok || !Array.isArray(json.results)) {
          if (res.status === 402 || json.error?.code === "insufficient_credits") {
            const defaultCost =
              selectedCountries.length * AI_CREDIT_COSTS.serper_preview_per_country;
            const req = json.error?.required ?? defaultCost;
            const count = selectedCountries.length;
            toast.error(tSerper("insufficientCredits", { credits: req, count }));
          } else if (res.status === 503 || json.error?.code === "serper_not_configured") {
            toast.message(tSerper("configMissingTitle"), {
              description: tSerper("configMissingBody"),
            });
          } else {
            toast.error(json.error?.message ?? tSerper("errorGeneric"));
          }
          return;
        }
        setPreviewResults(json.results);
      } catch {
        toast.error(tSerper("errorGeneric"));
      } finally {
        setPreviewPending(false);
      }
    })();

    await Promise.all([mockPromise, livePromise]);
    setQuery("");
    setAnalyzePending(false);
  }

  async function onTrackKeyword(term: string) {
    const key = term.trim().toLowerCase();
    if (trackedTerms.some((x) => x.toLowerCase() === key)) {
      toast.info(t("gap.alreadyTracked"));
      return;
    }

    if (!keywordTrackerEnabled) {
      setTrackedTerms((prev) => [...prev, term.trim()]);
      toast.success(t("gap.trackMockQueued"));
      return;
    }

    const appId = targetAppId || apps[0]?.id;
    if (!appId) {
      toast.error(t("gap.trackDisabledNoApps"));
      return;
    }

    setTrackPending(term);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: term.trim(), appId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !json.ok) {
        setTrackedTerms((prev) => (prev.some((x) => x.toLowerCase() === key) ? prev : [...prev, term.trim()]));
        toast.error(json.error?.message ?? t("gap.trackToastError"));
        toast.message(t("gap.trackQueuedLocally"));
        return;
      }

      setTrackedTerms((prev) => [...prev, term.trim()]);
      toast.success(t("gap.trackToastSuccess"));
      refresh();
    } catch {
      setTrackedTerms((prev) => [...prev, term.trim()]);
      toast.error(t("gap.trackToastError"));
      toast.message(t("gap.trackQueuedLocally"));
    } finally {
      setTrackPending(null);
    }
  }

  const isTracked = (term: string) =>
    trackedTerms.some((x) => x.toLowerCase() === term.trim().toLowerCase());

  return (
    <div className="space-y-8">
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

      <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
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

          <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={(e) => void onAnalyze(e)}>
            <div className="min-w-0 flex-1 space-y-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("add.placeholder")}
                disabled={blockingError}
                className="h-11 border-white/[0.1] bg-[#070a0f] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-emerald-500/40"
              />
              <p className="text-xs text-zinc-500">
                {t("add.helper")}{" "}
                <span className="text-zinc-600">{t("add.example")}</span>
              </p>
            </div>
            <Button
              type="submit"
              disabled={analyzePending || query.trim().length < 2 || blockingError}
              className="h-11 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {analyzePending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("add.buttonPending")}
                </span>
              ) : (
                t("add.button")
              )}
            </Button>
          </form>

          {previewPending && !previewResults ? (
            <p className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {tSerper("loading")}
            </p>
          ) : null}
          {previewResults && previewResults.length > 0 ? (
            <SerperPreviewResults results={previewResults} />
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="my-competitors-heading">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{t("sections.myKicker")}</p>
          <h2 id="my-competitors-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {t("myCompetitors.title")}
          </h2>
          <p className="max-w-2xl text-sm text-zinc-400">{t("myCompetitors.subtitle")}</p>
        </div>

        {!hydrated ? (
          <div className="flex min-h-[140px] items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0a0e14]">
            <Loader2 className="size-8 animate-spin text-emerald-500/60" aria-hidden />
            <span className="sr-only">{t("loading")}</span>
          </div>
        ) : competitors.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.1] bg-[#080c12] px-6 py-14 text-center">
            <Crosshair className="size-10 text-emerald-500/40" aria-hidden />
            <div className="space-y-1">
              <p className="text-base font-medium text-zinc-200">{t("myCompetitors.emptyTitle")}</p>
              <p className="max-w-md text-sm text-zinc-500">{t("myCompetitors.emptyBody")}</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {competitors.map((c) => (
              <li key={c.id}>
                <Card className="h-full overflow-hidden border-white/[0.08] bg-[#0c1018] text-zinc-100 ring-1 ring-white/[0.03]">
                  <CardHeader className="border-b border-white/[0.06] pb-4">
                    <div className="flex gap-4">
                      <div
                        className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-lg font-semibold text-emerald-200"
                        aria-hidden
                      >
                        {c.displayName.slice(0, 1)}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="truncate text-lg text-white">{c.displayName}</CardTitle>
                        <p className="truncate font-mono text-xs text-zinc-500">{c.packageId}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {t("myCompetitors.mainKeywords")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {c.topKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-full border border-white/[0.08] bg-[#070a0f] px-3 py-1 text-xs text-zinc-300"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <Target className="size-3.5 text-emerald-500/80" aria-hidden />
                        {t("myCompetitors.sharedTitle")}
                      </p>
                      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                        <table className="w-full min-w-[280px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-[#070a0f] text-xs text-zinc-500">
                              <th className="px-3 py-2 font-medium">{t("gap.columns.keyword")}</th>
                              <th className="px-3 py-2 font-medium">{t("myCompetitors.yourRank")}</th>
                              <th className="px-3 py-2 font-medium">{t("myCompetitors.theirRank")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.shared.map((row) => (
                              <tr key={row.keyword} className="border-b border-white/[0.04] last:border-0">
                                <td className="px-3 py-2.5 text-zinc-200">{row.keyword}</td>
                                <td className="px-3 py-2.5 text-zinc-400">
                                  {row.yourRank != null ? `#${row.yourRank}` : "—"}
                                </td>
                                <td className="px-3 py-2.5 font-medium text-emerald-300/90">#{row.theirRank}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <Sparkles className="size-3.5 text-amber-400/90" aria-hidden />
                        {t("myCompetitors.quickWins")}
                      </p>
                      <ul className="space-y-2 text-sm leading-relaxed text-zinc-400">
                        {c.quickWins.map((w) => (
                          <li key={w} className="flex gap-2">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500/70" aria-hidden />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="gap-heading">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{t("sections.gapKicker")}</p>
          <h2 id="gap-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {t("gap.title")}
          </h2>
          <p className="max-w-2xl text-sm text-zinc-400">{t("gap.subtitle")}</p>
        </div>

        <Card className="overflow-hidden border-white/[0.08] bg-[#0c1018] text-zinc-100">
          <CardContent className="p-0">
            {gapRows.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-zinc-500">{t("gap.empty")}</div>
            ) : (
              <>
                <div className="hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-[#070a0f] text-xs text-zinc-500">
                        <th className="px-5 py-3 font-medium">{t("gap.columns.keyword")}</th>
                        <th className="px-5 py-3 font-medium">{t("gap.columns.opportunity")}</th>
                        <th className="px-5 py-3 font-medium text-right">{t("gap.columns.action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapRows.map((row) => (
                        <tr key={row.keyword} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-5 py-4 font-medium text-zinc-100">{row.keyword}</td>
                          <td className="px-5 py-4">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                row.opportunity === "high"
                                  ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                                  : "border-amber-400/30 bg-amber-500/10 text-amber-100/90",
                              )}
                            >
                              {row.opportunity === "high" ? t("gap.opportunityHigh") : t("gap.opportunityMedium")}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                Boolean(trackPending) ||
                                blockingError ||
                                isTracked(row.keyword) ||
                                (keywordTrackerEnabled && apps.length === 0)
                              }
                              onClick={() => void onTrackKeyword(row.keyword)}
                              className="border border-emerald-400/30 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
                            >
                              {trackPending === row.keyword ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                  {t("gap.tracking")}
                                </span>
                              ) : isTracked(row.keyword) ? (
                                t("gap.tracked")
                              ) : (
                                t("gap.track")
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-white/[0.06] md:hidden">
                  {gapRows.map((row) => (
                    <li key={row.keyword} className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-zinc-100">{row.keyword}</p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            row.opportunity === "high"
                              ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                              : "border-amber-400/30 bg-amber-500/10 text-amber-100/90",
                          )}
                        >
                          {row.opportunity === "high" ? t("gap.opportunityHigh") : t("gap.opportunityMedium")}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full border border-emerald-400/30 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
                        disabled={
                          Boolean(trackPending) ||
                          blockingError ||
                          isTracked(row.keyword) ||
                          (keywordTrackerEnabled && apps.length === 0)
                        }
                        onClick={() => void onTrackKeyword(row.keyword)}
                      >
                        {trackPending === row.keyword ? t("gap.tracking") : isTracked(row.keyword) ? t("gap.tracked") : t("gap.track")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <p className="rounded-xl border border-white/[0.06] bg-[#080c12] px-4 py-3 text-center text-xs leading-relaxed text-zinc-500">
        {t("disclaimer")}
      </p>
    </div>
  );
}
