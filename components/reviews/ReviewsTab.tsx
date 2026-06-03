"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReviewRow } from "@/components/reviews/ReviewRow";
import { getCompetitorDemoReviews } from "@/components/reviews/review-demo-data";
import {
  draftReplySessionKey,
  fetchListingImprovementReviewIds,
} from "@/components/reviews/review-improvements-queue";
import type {
  ClassificationFilter,
  LocaleFilter,
  ReviewRow as ReviewRowData,
} from "@/components/reviews/reviews-types";

// ─────────────────────────────────────────────────────────────────────────────
// Sentiment chip filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coarse sentiment bucket exposed as inline chip buttons.
 * Replaces the previous per-star Select dropdown with a friendlier UX that
 * maps to the most common ASO review-triage workflows.
 */
type SentimentFilter =
  | "all"       // no star constraint
  | "positive"  // 4–5 ★ — praise & growth signals
  | "negative"  // 1–2 ★ — pain points & churn risks
  | "critical"; // 1 ★ only — highest-urgency issues

type SentimentChipDef = {
  value: SentimentFilter;
  label: string;
  starRange: [number, number] | null; // inclusive [min, max], null = no filter
  colorActive: string;
  colorIdle: string;
};

const SENTIMENT_CHIPS: SentimentChipDef[] = [
  {
    value: "all",
    label: "Show All",
    starRange: null,
    colorActive:
      "bg-zinc-700 text-white ring-1 ring-zinc-500/50",
    colorIdle:
      "border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
  },
  {
    value: "positive",
    label: "Positive Logs (4–5 ★)",
    starRange: [4, 5],
    colorActive:
      "bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/40",
    colorIdle:
      "border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:border-emerald-700/50 hover:text-emerald-300",
  },
  {
    value: "negative",
    label: "Negative Logs (1–2 ★)",
    starRange: [1, 2],
    colorActive:
      "bg-orange-600/20 text-orange-300 ring-1 ring-orange-500/40",
    colorIdle:
      "border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:border-orange-700/50 hover:text-orange-300",
  },
  {
    value: "critical",
    label: "Critical Only (1 ★)",
    starRange: [1, 1],
    colorActive:
      "bg-rose-600/20 text-rose-300 ring-1 ring-rose-500/40",
    colorIdle:
      "border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:border-rose-700/50 hover:text-rose-300",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Progressive render constants
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_VISIBLE = 10;
const PAGE_SIZE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type ReplyDraftState = {
  text: string;
  visible: boolean;
};

function matchesSearch(review: ReviewRowData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    review.text.toLowerCase().includes(q) ||
    review.userName.toLowerCase().includes(q) ||
    review.appVersion.toLowerCase().includes(q)
  );
}

function loadReplyDraftsFromSession(
  reviewIds: string[],
): Record<string, ReplyDraftState> {
  if (typeof window === "undefined") return {};
  const out: Record<string, ReplyDraftState> = {};
  for (const id of reviewIds) {
    try {
      const text = sessionStorage.getItem(draftReplySessionKey(id))?.trim();
      if (text) out[id] = { text, visible: false };
    } catch {
      /* private mode */
    }
  }
  return out;
}

/** Returns true when the review's rating falls inside the chip's star range. */
function matchesSentiment(review: ReviewRowData, sentiment: SentimentFilter): boolean {
  const chip = SENTIMENT_CHIPS.find((c) => c.value === sentiment);
  if (!chip?.starRange) return true; // "all" — no constraint
  const [min, max] = chip.starRange;
  return review.rating >= min && review.rating <= max;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewsTabProps = {
  workspaceId: string;
  appName?: string;
  appId?: string;
  packageName?: string | null;
  reviews?: ReviewRowData[];
  /**
   * When true, `reviews` contains real live data from the Play Store.
   * When false/undefined, own-app mode shows an empty state; competitor mode
   * falls back to the demo dataset.
   */
  hasLiveReviews?: boolean;
  /** "my-app" | packageId of the active competitor tab */
  selectedAppFilter?: string;
  /** Package name of the active competitor (null when my-app is selected) */
  activeCompetitorPackageName?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewsTab({
  workspaceId,
  appName,
  appId,
  packageName,
  reviews,
  hasLiveReviews = false,
  selectedAppFilter = "my-app",
  activeCompetitorPackageName = null,
}: ReviewsTabProps) {
  const t = useTranslations("reviews");

  const isCompetitorMode = selectedAppFilter !== "my-app";

  // ── Resolved dataset ────────────────────────────────────────────────────────
  // Resolution priority:
  //   1. Parent delivered live reviews (own app OR competitor) → use them.
  //   2. Competitor mode, no live data yet → demo dataset as placeholder.
  //   3. Own-app, no live data → empty array → monitoring empty state below.
  const resolvedReviews = useMemo<ReviewRowData[]>(() => {
    if (hasLiveReviews && Array.isArray(reviews) && reviews.length > 0) {
      return reviews;
    }
    if (isCompetitorMode) {
      return getCompetitorDemoReviews(activeCompetitorPackageName ?? selectedAppFilter);
    }
    return [];
  }, [isCompetitorMode, activeCompetitorPackageName, selectedAppFilter, hasLiveReviews, reviews]);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
  const [localeFilter, setLocaleFilter] = useState<LocaleFilter>("all");
  const [classificationFilter, setClassificationFilter] =
    useState<ClassificationFilter>("all");
  const [search, setSearch] = useState("");

  // ── Progressive render ──────────────────────────────────────────────────────
  // Start with INITIAL_VISIBLE items.  "Show More" increments by PAGE_SIZE.
  // Reset to initial when any filter changes so the list starts from the top.
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // ── Queue / reply state ─────────────────────────────────────────────────────
  const [queueAddedIds, setQueueAddedIds] = useState<Set<string>>(() => new Set());
  const [replyDrafts, setReplyDrafts] = useState<Record<string, ReplyDraftState>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = await fetchListingImprovementReviewIds(workspaceId);
      if (!cancelled) setQueueAddedIds(new Set(ids));
    })();
    setReplyDrafts(
      loadReplyDraftsFromSession(resolvedReviews.map((r) => r.id)),
    );
    return () => {
      cancelled = true;
    };
  }, [resolvedReviews, workspaceId]);

  const markAddedToQueue = useCallback((reviewId: string) => {
    setQueueAddedIds((prev) => new Set(prev).add(reviewId));
  }, []);

  const onReplyDraftSuccess = useCallback((reviewId: string, replyText: string) => {
    setReplyDrafts((prev) => ({
      ...prev,
      [reviewId]: { text: replyText, visible: true },
    }));
    try {
      sessionStorage.setItem(draftReplySessionKey(reviewId), replyText);
    } catch {
      /* quota / private mode */
    }
  }, []);

  const onCloseReplyDraft = useCallback((reviewId: string) => {
    setReplyDrafts((prev) => {
      const current = prev[reviewId];
      if (!current) return prev;
      return { ...prev, [reviewId]: { ...current, visible: false } };
    });
  }, []);

  const onShowReplyDraft = useCallback((reviewId: string) => {
    setReplyDrafts((prev) => {
      const current = prev[reviewId];
      if (!current?.text) return prev;
      return { ...prev, [reviewId]: { ...current, visible: true } };
    });
  }, []);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return resolvedReviews.filter((review) => {
      if (!matchesSentiment(review, sentimentFilter)) return false;
      if (localeFilter !== "all" && review.locale !== localeFilter) return false;
      if (
        classificationFilter !== "all" &&
        !review.classifications.includes(classificationFilter)
      ) {
        return false;
      }
      return matchesSearch(review, search);
    });
  }, [resolvedReviews, sentimentFilter, localeFilter, classificationFilter, search]);

  // Reset visible count whenever the filtered set changes (filter / search changed).
  // Use a separate effect instead of resetting inside the filter memo to avoid
  // setState-during-render warnings.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [sentimentFilter, localeFilter, classificationFilter, search]);

  // Slice the filtered list to what's currently visible.
  const visibleReviews = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const showMore = useCallback(() => {
    setVisibleCount((n) => n + PAGE_SIZE);
  }, []);

  // ── Empty state — own app with no live reviews ──────────────────────────────
  if (!isCompetitorMode && !hasLiveReviews) {
    return (
      <section className="space-y-4" aria-labelledby="recent-reviews-heading">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {t("recent.kicker")}
          </p>
          <h2
            id="recent-reviews-heading"
            className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
          >
            {t("recent.title")}
          </h2>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950 px-8 py-12 text-center shadow-[0_0_0_1px_rgba(148,163,184,0.06)]">
          <div
            className="pointer-events-none absolute -top-10 left-1/2 size-48 -translate-x-1/2 rounded-full bg-slate-500/10 blur-3xl"
            aria-hidden
          />
          <div className="relative mx-auto max-w-md">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-slate-600/30 bg-slate-800/60 text-slate-400">
              <PackageOpen className="size-7" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-white">
              {t("recent.noOwnReviewsTitle")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              {t("recent.noOwnReviewsBody")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="recent-reviews-heading">
      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          {t("recent.kicker")}
        </p>
        <h2
          id="recent-reviews-heading"
          className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
        >
          {isCompetitorMode ? t("recent.competitorFeedTitle") : t("recent.title")}
        </h2>
        <p className="max-w-2xl text-sm text-zinc-400">
          {isCompetitorMode
            ? t("recent.competitorFeedSubtitle")
            : t("recent.subtitle")}
        </p>
      </div>

      {/* ── Fix 2: Sentiment chip filters ──────────────────────────────────── */}
      {/*
       * Inline chip buttons replace the old star-rating Select dropdown.
       * Each chip maps to a coarse sentiment bucket (All / Positive / Negative /
       * Critical) that covers the most common ASO triage workflows without
       * requiring the user to select individual star values.
       *
       * Accessibility: role="group" + aria-label on the wrapper, each button
       * carries aria-pressed so screen readers announce the active state.
       */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter reviews by sentiment"
      >
        {SENTIMENT_CHIPS.map((chip) => {
          const isActive = sentimentFilter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSentimentFilter(chip.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c12]",
                isActive ? chip.colorActive : chip.colorIdle,
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* ── Secondary filters row ───────────────────────────────────────────── */}
      <div className="flex w-full flex-col flex-wrap gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
          <Select
            value={localeFilter}
            onValueChange={(v) => setLocaleFilter(v as LocaleFilter)}
          >
            <SelectTrigger className="w-full border-zinc-800 bg-zinc-900 text-zinc-200 sm:w-[160px]">
              <SelectValue placeholder={t("filters.locale.label")} />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
              <SelectItem value="all">{t("filters.locale.all")}</SelectItem>
              <SelectItem value="us-en">{t("filters.locale.usEn")}</SelectItem>
              <SelectItem value="ae-ar">{t("filters.locale.aeAr")}</SelectItem>
              <SelectItem value="in-hi">{t("filters.locale.inHi")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={classificationFilter}
            onValueChange={(v) => setClassificationFilter(v as ClassificationFilter)}
          >
            <SelectTrigger className="w-full border-zinc-800 bg-zinc-900 text-zinc-200 sm:w-[180px]">
              <SelectValue placeholder={t("filters.classification.label")} />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
              <SelectItem value="all">{t("filters.classification.all")}</SelectItem>
              <SelectItem value="bug_crash">
                {t("filters.classification.bugCrash")}
              </SelectItem>
              <SelectItem value="feature_request">
                {t("filters.classification.featureRequest")}
              </SelectItem>
              <SelectItem value="pricing">
                {t("filters.classification.pricing")}
              </SelectItem>
              <SelectItem value="praise">
                {t("filters.classification.praise")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full md:max-w-xs">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="border-zinc-800 bg-zinc-900 ps-9 text-zinc-100 placeholder:text-zinc-500"
            aria-label={t("filters.searchAria")}
          />
        </div>
      </div>

      {/* ── Fix 2: Progressive review list ─────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-8 text-center text-sm text-zinc-500">
          {t("filters.noResults")}
        </p>
      ) : (
        <>
          {/* Result count badge */}
          <p className="text-xs text-zinc-500" aria-live="polite">
            Showing{" "}
            <span className="font-medium text-zinc-300">
              {Math.min(visibleCount, filtered.length)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-zinc-300">{filtered.length}</span> reviews
          </p>

          <ul className="space-y-4">
            {visibleReviews.map((review) => {
              const draftState = replyDrafts[review.id];
              return (
                <li key={review.id}>
                  <ReviewRow
                    review={review}
                    workspaceId={workspaceId}
                    appName={appName}
                    appId={isCompetitorMode ? undefined : appId}
                    packageName={
                      isCompetitorMode
                        ? activeCompetitorPackageName ?? packageName
                        : packageName
                    }
                    isCompetitorMode={isCompetitorMode}
                    isAddedToQueue={queueAddedIds.has(review.id)}
                    onAddedToQueue={() => markAddedToQueue(review.id)}
                    replyDraft={draftState?.text ?? null}
                    replyDraftVisible={draftState?.visible ?? false}
                    onReplyDraftSuccess={(replyText) =>
                      onReplyDraftSuccess(review.id, replyText)
                    }
                    onCloseReplyDraft={() => onCloseReplyDraft(review.id)}
                    onShowReplyDraft={() => onShowReplyDraft(review.id)}
                  />
                </li>
              );
            })}
          </ul>

          {/* Show More footer — only rendered when more items remain */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={showMore}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c12]"
                aria-label={`Show more reviews (${filtered.length - visibleCount} remaining)`}
              >
                <ChevronDown className="size-4" aria-hidden />
                Show More Reviews
                <span className="ml-0.5 rounded-full bg-zinc-800 px-1.5 py-px text-[10px] font-bold text-zinc-400">
                  {filtered.length - visibleCount}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
