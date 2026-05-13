"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp, Loader2, MessageSquareQuote, Sparkles, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import { cn } from "@/lib/utils";

const STORAGE_IMPROVEMENTS = "playstore:reviews:listingImprovements";

function storageKeyImprovements(workspaceId: string) {
  return `${STORAGE_IMPROVEMENTS}:${workspaceId}`;
}

type Sentiment = "positive" | "neutral" | "negative";

type DemoReview = {
  id: string;
  rating: number;
  text: string;
  dateIso: string;
  sentiment: Sentiment;
};

type DemoIssueTheme = {
  id: string;
  themeKey: "performance" | "bugs" | "pricing" | "features" | "ux";
  count: number;
};

const DEMO_ISSUES: DemoIssueTheme[] = [
  { id: "iss_perf", themeKey: "performance", count: 34 },
  { id: "iss_bugs", themeKey: "bugs", count: 52 },
  { id: "iss_price", themeKey: "pricing", count: 18 },
  { id: "iss_feat", themeKey: "features", count: 41 },
  { id: "iss_ux", themeKey: "ux", count: 22 },
];

const DEMO_REVIEWS: DemoReview[] = [
  {
    id: "r1",
    rating: 5,
    text: "Finally a calm meditation app without noisy ads every two minutes. The sleep sounds library is huge and the timer UX is thoughtful.",
    dateIso: "2026-05-10",
    sentiment: "positive",
  },
  {
    id: "r2",
    rating: 2,
    text: "Crashes when I switch to offline mode on Pixel. Lost my streak twice. Please fix — I pay for premium and expect stability.",
    dateIso: "2026-05-09",
    sentiment: "negative",
  },
  {
    id: "r3",
    rating: 4,
    text: "Great content overall. Pricing feels a bit steep compared to similar apps but the quality is there.",
    dateIso: "2026-05-08",
    sentiment: "neutral",
  },
  {
    id: "r4",
    rating: 5,
    text: "Love the breathing exercises. Would be perfect if widget showed next session time.",
    dateIso: "2026-05-07",
    sentiment: "positive",
  },
  {
    id: "r5",
    rating: 1,
    text: "Battery drain is insane after the last update. Phone gets warm within 20 minutes.",
    dateIso: "2026-05-06",
    sentiment: "negative",
  },
  {
    id: "r6",
    rating: 4,
    text: "Solid habit tracker. Notifications could be gentler — sometimes they feel pushy late at night.",
    dateIso: "2026-05-04",
    sentiment: "neutral",
  },
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

function StarsRow({ rating }: { rating: number }) {
  const full = Math.round(Math.min(5, Math.max(0, rating)));
  return (
    <div className="flex items-center gap-0.5 text-amber-400" aria-label={`${rating} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn("size-3.5 shrink-0", i < full ? "fill-current" : "fill-none opacity-35")}
          aria-hidden
        />
      ))}
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<DemoReview | null>(null);

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

  const onUseInAso = useCallback(() => {
    toast.message(t("actions.useInAsoToast"));
  }, [t]);

  const previewLen = 120;

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
          <Button
            asChild
            className="mt-6 bg-emerald-600 text-white hover:bg-emerald-500"
          >
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

          <section className="space-y-4" aria-labelledby="recent-reviews-heading">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{t("recent.kicker")}</p>
              <h2 id="recent-reviews-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {t("recent.title")}
              </h2>
              <p className="max-w-2xl text-sm text-zinc-400">{t("recent.subtitle")}</p>
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1018] shadow-[0_0_0_1px_rgba(16,185,129,0.08)] lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.06] bg-[#070a0f] text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("recent.columns.review")}</th>
                    <th className="px-4 py-3 font-medium">{t("recent.columns.rating")}</th>
                    <th className="px-4 py-3 font-medium">{t("recent.columns.date")}</th>
                    <th className="px-4 py-3 font-medium">{t("recent.columns.sentiment")}</th>
                    <th className="px-4 py-3 pe-6 font-medium">{t("recent.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {DEMO_REVIEWS.map((row) => {
                    const expanded = expandedId === row.id;
                    const showToggle = row.text.length > previewLen;
                    const display = expanded || !showToggle ? row.text : `${row.text.slice(0, previewLen).trim()}…`;
                    return (
                      <tr key={row.id} className="align-top text-zinc-200">
                        <td className="px-4 py-4">
                          <p className="max-w-xl leading-relaxed text-zinc-300">{display}</p>
                          {showToggle ? (
                            <button
                              type="button"
                              className="mt-1.5 text-xs font-medium text-emerald-400/90 hover:text-emerald-300"
                              onClick={() => setExpandedId(expanded ? null : row.id)}
                            >
                              {expanded ? t("recent.readLess") : t("recent.readMore")}
                            </button>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          <StarsRow rating={row.rating} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-zinc-500">{row.dateIso}</td>
                        <td className="px-4 py-4">
                          <SentimentBadge sentiment={row.sentiment} />
                        </td>
                        <td className="px-4 py-4 pe-6">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-white/[0.12] bg-[#070a0f] text-zinc-200 hover:bg-white/[0.06] hover:text-white"
                              onClick={onUseInAso}
                            >
                              {t("actions.useInAso")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-500"
                              onClick={() => setReplyFor(row)}
                            >
                              {t("actions.replyDraft")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:hidden">
              {DEMO_REVIEWS.map((row) => {
                const expanded = expandedId === row.id;
                const showToggle = row.text.length > previewLen;
                const display = expanded || !showToggle ? row.text : `${row.text.slice(0, previewLen).trim()}…`;
                return (
                  <Card
                    key={row.id}
                    className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <StarsRow rating={row.rating} />
                        <span className="text-xs text-zinc-500">{row.dateIso}</span>
                      </div>
                      <SentimentBadge sentiment={row.sentiment} />
                      <p className="text-sm leading-relaxed text-zinc-300">{display}</p>
                      {showToggle ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-emerald-400/90 hover:text-emerald-300"
                          onClick={() => setExpandedId(expanded ? null : row.id)}
                        >
                          {expanded ? t("recent.readLess") : t("recent.readMore")}
                        </button>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-white/[0.12] bg-[#070a0f] text-zinc-200"
                          onClick={onUseInAso}
                        >
                          {t("actions.useInAso")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-500"
                          onClick={() => setReplyFor(row)}
                        >
                          {t("actions.replyDraft")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="common-issues-heading">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{t("commonIssues.kicker")}</p>
              <h2 id="common-issues-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
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
              {DEMO_ISSUES.map((issue) => {
                const added = improvementIds.includes(issue.id);
                return (
                  <Card
                    key={issue.id}
                    className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                  >
                    <CardHeader className="space-y-1 pb-2">
                      <CardTitle className="text-base font-semibold text-white">
                        {t(`commonIssues.themes.${issue.themeKey}`)}
                      </CardTitle>
                      <CardDescription className="text-zinc-500">
                        {t("commonIssues.mentions", { count: issue.count })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        type="button"
                        size="sm"
                        disabled={added}
                        className={cn(
                          "w-full sm:w-auto",
                          added
                            ? "border border-white/[0.08] bg-transparent text-zinc-500"
                            : "bg-emerald-600 text-white hover:bg-emerald-500",
                        )}
                        variant={added ? "outline" : "default"}
                        onClick={() => addImprovement(issue.id)}
                      >
                        {added ? t("commonIssues.added") : t("commonIssues.addToListing")}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <p className="rounded-xl border border-white/[0.06] bg-[#070a0f] px-4 py-3 text-center text-xs leading-relaxed text-zinc-500">
            {t("disclaimer")}
          </p>
        </>
      )}

      <Dialog open={replyFor != null} onOpenChange={(open) => !open && setReplyFor(null)}>
        <DialogContent
          className="border-white/[0.08] bg-[#0a0e14] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_24px_80px_-24px_rgba(0,0,0,0.65)] sm:max-w-lg"
          overlayClassName="bg-black/75 backdrop-blur-md"
          closeButtonClassName="text-zinc-500 hover:text-white"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">{t("replyDialog.title")}</DialogTitle>
            <DialogDescription className="text-zinc-400">{t("replyDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-white/[0.08] bg-[#070a0f] p-4 text-sm leading-relaxed text-zinc-300">
            {replyFor ? t("replyDialog.stubBody") : null}
          </div>
          <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => setReplyFor(null)}>
            {t("replyDialog.close")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const t = useTranslations("reviews");
  const label = t(`sentiment.${sentiment}`);
  const styles =
    sentiment === "positive"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : sentiment === "negative"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200/90"
        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", styles)}>{label}</span>
  );
}
