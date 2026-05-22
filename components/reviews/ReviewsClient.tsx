"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp, Loader2, MessageSquareQuote, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewsTab } from "@/components/reviews/ReviewsTab";
import { ThemeCard, type ThemeCardThemeKey } from "@/components/reviews/ThemeCard";
import { AppSourceSelector, type AppSourceOption } from "@/components/reviews/AppSourceSelector";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import type { ReviewRow } from "@/components/reviews/reviews-types";

/**
 * Strips trailing app store platform labels from competitor display names so
 * tab labels stay clean (e.g. "MyFitnessPal: Calorie Counter" not
 * "MyFitnessPal: Calorie Counter - Apps on Google Play").
 */
function stripStorePlatformSuffix(name: string): string {
  return name
    .replace(/\s*[-–—]\s*(Apps on Google Play|Google Play|iOS App Store|App Store)\s*$/i, "")
    .trim();
}

const STORAGE_IMPROVEMENTS = "playstore:reviews:listingImprovements";

function storageKeyImprovements(workspaceId: string) {
  return `${STORAGE_IMPROVEMENTS}:${workspaceId}`;
}

type DemoIssueTheme = {
  id: string;
  themeKey: ThemeCardThemeKey;
  count: number;
};

const DEMO_ISSUES: DemoIssueTheme[] = [
  { id: "iss_perf", themeKey: "performance", count: 34 },
  { id: "iss_bugs", themeKey: "bugs", count: 52 },
  { id: "iss_price", themeKey: "pricing", count: 18 },
  { id: "iss_feat", themeKey: "features", count: 41 },
  { id: "iss_ux", themeKey: "ux", count: 22 },
];

const RATING_TREND_30D = [4.2, 4.25, 4.3, 4.28, 4.35, 4.4, 4.42, 4.45, 4.48, 4.52, 4.55, 4.58, 4.6];

function parseImprovementIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function RatingSparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return <span className="text-xs text-zinc-500">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.08, max - min);
  return (
    <div className="flex h-10 max-w-[140px] items-end gap-0.5" aria-hidden title={label}>
      {values.map((v, i) => {
        const norm = (v - min) / span;
        const h = 8 + norm * 24;
        return (
          <div
            key={`${i}-${v}`}
            className="w-1.5 shrink-0 rounded-sm bg-emerald-500/80 ring-1 ring-emerald-400/15"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

export type ReviewsClientProps = {
  workspaceId: string;
  apps: WorkspaceAppListRow[];
  appsLoadError?: string | null;
};

export function ReviewsClient({ workspaceId, apps, appsLoadError }: ReviewsClientProps) {
  const t = useTranslations("reviews");
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [improvementIds, setImprovementIds] = useState<string[]>([]);

  // App selector — "my-app" or a competitor's packageId
  const [selectedAppFilter, setSelectedAppFilter] = useState<string>("my-app");
  const [competitorOptions, setCompetitorOptions] = useState<AppSourceOption[]>([]);
  const [competitorsLoading, setCompetitorsLoading] = useState(true);

  // Live reviews fetched from the Play Store sync route for the primary app
  const [liveReviews, setLiveReviews] = useState<ReviewRow[]>([]);
  const [liveReviewsLoading, setLiveReviewsLoading] = useState(false);
  const [hasLiveReviews, setHasLiveReviews] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/competitors`, {
          credentials: "same-origin",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          competitors?: { id: string; displayName: string; packageId: string; iconUrl?: string | null }[];
        };
        if (!cancelled && json.ok && Array.isArray(json.competitors)) {
          setCompetitorOptions(
            json.competitors.map((c) => ({
              id: c.packageId,
              label: stripStorePlatformSuffix(c.displayName),
              packageId: c.packageId,
              iconUrl: c.iconUrl ?? null,
            })),
          );
        }
      } catch {
        // silently ignore — filter just won't show competitors
      } finally {
        if (!cancelled) setCompetitorsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Fetch live Play Store reviews for the primary app when it has a package name.
  // The sync route returns real reviews via google-play-scraper; on failure we
  // fall back gracefully to the empty state (hasLiveReviews stays false).
  useEffect(() => {
    const app = apps[0];
    const packageName =
      typeof app?.package_name === "string" && app.package_name.trim()
        ? app.package_name.trim()
        : null;
    if (!packageName) return;

    let cancelled = false;
    setLiveReviewsLoading(true);

    void (async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/reviews/sync?appId=${encodeURIComponent(app.id)}&num=100`,
          { credentials: "same-origin" },
        );
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { reviews?: ReviewRow[] };
        };
        if (!cancelled && json.ok && Array.isArray(json.data?.reviews)) {
          const rows = json.data.reviews;
          setLiveReviews(rows);
          setHasLiveReviews(rows.length > 0);
        }
      } catch {
        // Network error — empty state shown instead
      } finally {
        if (!cancelled) setLiveReviewsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, apps]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setImprovementIds(parseImprovementIds(sessionStorage.getItem(storageKeyImprovements(workspaceId))));
    setHydrated(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    sessionStorage.setItem(storageKeyImprovements(workspaceId), JSON.stringify(improvementIds));
  }, [hydrated, improvementIds, workspaceId]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const blockingError = Boolean(appsLoadError);
  const noApps = apps.length === 0 && !blockingError;

  const overview = useMemo(
    () => ({
      avgRating: 4.6,
      ratingDelta: 0.12,
      totalReviews: 2847,
      positivePct: 72,
    }),
    [],
  );

  const addImprovement = useCallback(
    (issueId: string) => {
      if (improvementIds.includes(issueId)) {
        toast.info(t("commonIssues.alreadyAdded"));
        return;
      }
      setImprovementIds((prev) => [...prev, issueId]);
      toast.success(t("commonIssues.addedToast"));
    },
    [improvementIds, t],
  );

  const primaryApp = apps[0];
  const primaryAppName = primaryApp?.name ?? undefined;
  const primaryAppId = primaryApp?.id;
  const primaryPackageName = primaryApp?.package_name ?? null;

  if (blockingError) {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <p className="text-sm text-rose-100/90">{appsLoadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refresh()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (noApps) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-emerald-950/[0.18] via-[#0a0e14] to-[#070a0f] p-8 shadow-[0_0_0_1px_rgba(16,185,129,0.1)] sm:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-md text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
            <MessageSquareQuote className="size-7" aria-hidden />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white">{t("empty.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t("empty.body")}</p>
          <Button asChild className="mt-6 bg-emerald-600 text-white hover:bg-emerald-500">
            <Link href={`/app/${workspaceId}/settings`}>{t("empty.cta")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {!hydrated ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0a0e14]">
          <Loader2 className="size-8 animate-spin text-emerald-500/60" aria-hidden />
          <span className="sr-only">{t("loading")}</span>
        </div>
      ) : (
        <>
          <section className="space-y-4" aria-labelledby="reviews-overview-heading">
            <h2 id="reviews-overview-heading" className="sr-only">
              {t("overview.srTitle")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-2">
                  <CardDescription className="text-zinc-500">{t("overview.avgRating")}</CardDescription>
                  <CardTitle className="flex items-baseline gap-2 text-3xl font-semibold text-white">
                    {overview.avgRating.toFixed(1)}
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400">
                      <ArrowUp className="size-4" aria-hidden />
                      <span className="sr-only">{t("overview.trendUpSr")}</span>
                      <span aria-hidden>+{overview.ratingDelta.toFixed(2)}</span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">{t("overview.avgHint")}</CardContent>
              </Card>

              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-2">
                  <CardDescription className="text-zinc-500">{t("overview.totalReviews")}</CardDescription>
                  <CardTitle className="text-3xl font-semibold text-white">
                    {overview.totalReviews.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">{t("overview.totalHint")}</CardContent>
              </Card>

              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-2">
                  <CardDescription className="text-zinc-500">{t("overview.sentiment")}</CardDescription>
                  <CardTitle className="text-3xl font-semibold text-emerald-400">
                    {overview.positivePct}%
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">{t("overview.sentimentHint")}</CardContent>
              </Card>

              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-2">
                  <CardDescription className="text-zinc-500">{t("overview.ratingTrend30")}</CardDescription>
                  <div className="flex items-end justify-between gap-3 pt-1">
                    <RatingSparkline values={RATING_TREND_30D} label={t("overview.ratingTrend30")} />
                    <span className="text-xs font-medium text-emerald-400/90">{t("overview.trendLabel")}</span>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">{t("overview.sparkHint")}</CardContent>
              </Card>
            </div>
          </section>

          <AppSourceSelector
            selected={selectedAppFilter}
            onSelect={setSelectedAppFilter}
            competitors={competitorOptions}
            loading={competitorsLoading}
          />

          <ReviewsTab
            workspaceId={workspaceId}
            appName={primaryAppName}
            appId={primaryAppId}
            packageName={primaryPackageName}
            reviews={liveReviews}
            hasLiveReviews={hasLiveReviews}
            selectedAppFilter={selectedAppFilter}
            activeCompetitorPackageName={
              selectedAppFilter !== "my-app" ? selectedAppFilter : null
            }
          />
          {liveReviewsLoading && selectedAppFilter === "my-app" && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>{t("loading")}</span>
            </div>
          )}

          <section className="space-y-4" aria-labelledby="common-issues-heading">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t("commonIssues.kicker")}
              </p>
              <h2
                id="common-issues-heading"
                className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
              >
                {t("commonIssues.title")}
              </h2>
              <p className="max-w-2xl text-sm text-zinc-400">{t("commonIssues.subtitle")}</p>
            </div>

            {improvementIds.length > 0 ? (
              <p className="flex items-center gap-2 text-xs text-emerald-400/85">
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                {t("commonIssues.queueHint", { count: improvementIds.length })}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DEMO_ISSUES.map((issue) => (
                <ThemeCard
                  key={issue.id}
                  themeKey={issue.themeKey}
                  mentionCount={issue.count}
                  added={improvementIds.includes(issue.id)}
                  onAdd={() => addImprovement(issue.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
