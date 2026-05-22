"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { ReviewRow } from "@/components/reviews/ReviewRow";
import { DEMO_REVIEWS, getCompetitorDemoReviews } from "@/components/reviews/review-demo-data";
import {
  draftReplySessionKey,
  fetchListingImprovementReviewIds,
} from "@/components/reviews/review-improvements-queue";
import type {
  ClassificationFilter,
  LocaleFilter,
  ReviewRow as ReviewRowData,
  StarFilter,
} from "@/components/reviews/reviews-types";

export type ReviewsTabProps = {
  workspaceId: string;
  appName?: string;
  appId?: string;
  packageName?: string | null;
  reviews?: ReviewRowData[];
  /**
   * When true, `reviews` contains real live data from the Play Store.
   * When false/undefined (staging / no published app), own-app mode shows an
   * empty state instead of the demo dataset.
   */
  hasLiveReviews?: boolean;
  /** "my-app" | packageId of the active competitor tab */
  selectedAppFilter?: string;
  /** Package name of the active competitor (null when my-app is selected) */
  activeCompetitorPackageName?: string | null;
};

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

function loadReplyDraftsFromSession(reviewIds: string[]): Record<string, ReplyDraftState> {
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

  // Resolve which review dataset to display — memoized so the array reference is
  // stable across renders and doesn't cause useEffect to re-run in a loop.
  const resolvedReviews = useMemo<ReviewRowData[]>(() => {
    if (isCompetitorMode) {
      return getCompetitorDemoReviews(activeCompetitorPackageName ?? selectedAppFilter);
    }
    if (hasLiveReviews) return reviews ?? [];
    return [];
  }, [isCompetitorMode, activeCompetitorPackageName, selectedAppFilter, hasLiveReviews, reviews]);

  const [starFilter, setStarFilter] = useState<StarFilter>("all");
  const [localeFilter, setLocaleFilter] = useState<LocaleFilter>("all");
  const [classificationFilter, setClassificationFilter] =
    useState<ClassificationFilter>("all");
  const [search, setSearch] = useState("");
  const [queueAddedIds, setQueueAddedIds] = useState<Set<string>>(() => new Set());
  const [replyDrafts, setReplyDrafts] = useState<Record<string, ReplyDraftState>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = await fetchListingImprovementReviewIds(workspaceId);
      if (!cancelled) {
        setQueueAddedIds(new Set(ids));
      }
    })();
    setReplyDrafts(loadReplyDraftsFromSession(resolvedReviews.map((r) => r.id)));
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

  const filtered = useMemo(() => {
    return resolvedReviews.filter((review) => {
      if (starFilter !== "all" && review.rating !== Number(starFilter)) {
        return false;
      }
      if (localeFilter !== "all" && review.locale !== localeFilter) {
        return false;
      }
      if (
        classificationFilter !== "all" &&
        !review.classifications.includes(classificationFilter)
      ) {
        return false;
      }
      return matchesSearch(review, search);
    });
  }, [resolvedReviews, starFilter, localeFilter, classificationFilter, search]);

  // Own-app with no live reviews → show monitoring empty state, skip all filters/list
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
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -top-10 left-1/2 size-48 -translate-x-1/2 rounded-full bg-slate-500/10 blur-3xl" aria-hidden />
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
          {isCompetitorMode ? t("recent.competitorFeedSubtitle") : t("recent.subtitle")}
        </p>
      </div>

      <div className="mb-6 flex w-full flex-col flex-wrap gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
          <Select
            value={starFilter}
            onValueChange={(v) => setStarFilter(v as StarFilter)}
          >
            <SelectTrigger className="w-full border-zinc-800 bg-zinc-900 text-zinc-200 sm:w-[140px]">
              <SelectValue placeholder={t("filters.stars.label")} />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
              <SelectItem value="all">{t("filters.stars.all")}</SelectItem>
              <SelectItem value="5">{t("filters.stars.star5")}</SelectItem>
              <SelectItem value="4">{t("filters.stars.star4")}</SelectItem>
              <SelectItem value="3">{t("filters.stars.star3")}</SelectItem>
              <SelectItem value="2">{t("filters.stars.star2")}</SelectItem>
              <SelectItem value="1">{t("filters.stars.star1")}</SelectItem>
            </SelectContent>
          </Select>

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
              <SelectItem value="pricing">{t("filters.classification.pricing")}</SelectItem>
              <SelectItem value="praise">{t("filters.classification.praise")}</SelectItem>
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

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-8 text-center text-sm text-zinc-500">
          {t("filters.noResults")}
        </p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((review) => {
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
      )}
    </section>
  );
}
