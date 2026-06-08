"use client";

import { useCallback, useState } from "react";
import { Copy, Loader2, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { COUNTRY_FLAG_EMOJI } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { sentimentTagFromClassifications } from "@/components/reviews/review-improvements-queue";
import {
  localeToCountryCode,
  localeToReplyLanguage,
  type ReviewClassification,
  type ReviewRow as ReviewRowData,
} from "@/components/reviews/reviews-types";

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

function ClassificationPill({ kind }: { kind: ReviewClassification }) {
  const t = useTranslations("reviews");
  const label = t(`classification.${kind}`);
  const styles: Record<ReviewClassification, string> = {
    bug_crash: "border-rose-500/35 bg-rose-500/10 text-rose-200/90",
    feature_request: "border-sky-500/35 bg-sky-500/10 text-sky-200/90",
    pricing: "border-amber-500/35 bg-amber-500/10 text-amber-200/90",
    praise: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[kind],
      )}
    >
      {label}
    </span>
  );
}

export type ReviewRowProps = {
  review: ReviewRowData;
  workspaceId: string;
  appName?: string;
  appId?: string;
  packageName?: string | null;
  /**
   * When true the review belongs to a competitor's listing:
   * - "Draft AI Reply" button is hidden (can't reply to competitor reviews)
   * - "Add to listing improvements" becomes the amber "Exploit this loophole" CTA
   */
  isCompetitorMode?: boolean;
  isAddedToQueue: boolean;
  onAddedToQueue: () => void;
  replyDraft: string | null;
  replyDraftVisible: boolean;
  onReplyDraftSuccess: (replyText: string) => void;
  onCloseReplyDraft: () => void;
  onShowReplyDraft: () => void;
};

export function ReviewRow({
  review,
  workspaceId,
  appName,
  appId,
  packageName,
  isCompetitorMode = false,
  isAddedToQueue,
  onAddedToQueue,
  replyDraft,
  replyDraftVisible,
  onReplyDraftSuccess,
  onCloseReplyDraft,
  onShowReplyDraft,
}: ReviewRowProps) {
  const t = useTranslations("reviews");
  const [loading, setLoading] = useState(false);
  const [addingToQueue, setAddingToQueue] = useState(false);

  const country = localeToCountryCode(review.locale);
  const flag = COUNTRY_FLAG_EMOJI[country];

  const onAddToQueue = useCallback(async () => {
    if (isAddedToQueue || addingToQueue) return;
    if (!appId && !packageName?.trim()) {
      toast.error(t("row.addToQueueError"));
      return;
    }
    setAddingToQueue(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/listing-improvements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: review.id,
          reviewText: review.text,
          userName: review.userName,
          score: review.rating,
          sentimentTag: sentimentTagFromClassifications(review.classifications),
          ...(appId ? { appId } : {}),
          ...(packageName?.trim() ? { packageName: packageName.trim() } : {}),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) {
        toast.error(json.error?.message ?? t("row.addToQueueError"));
        return;
      }
      onAddedToQueue();
      toast.success(
        isCompetitorMode ? t("row.competitorQueueToast") : t("row.addedToQueueToast"),
      );
    } catch {
      toast.error(t("row.addToQueueError"));
    } finally {
      setAddingToQueue(false);
    }
  }, [
    addingToQueue,
    appId,
    isAddedToQueue,
    onAddedToQueue,
    packageName,
    review.classifications,
    review.id,
    review.rating,
    review.text,
    review.userName,
    t,
    workspaceId,
  ]);

  const onDraftReply = useCallback(async () => {
    if (replyDraft?.trim()) {
      onShowReplyDraft();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/reviews/${encodeURIComponent(review.id)}/draft-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewText: review.text,
            rating: review.rating,
            replyLanguage: localeToReplyLanguage(review.locale),
            appName,
            userName: review.userName,
          }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { reply?: string };
        error?: { code?: string; message?: string; required?: number; remaining?: number };
      };

      if (!res.ok || !json.ok || !json.data?.reply) {
        if (res.status === 402 || json.error?.code === "insufficient_credits") {
          const req = json.error?.required ?? AI_CREDIT_COSTS.reviews_ai_reply;
          const rem = json.error?.remaining;
          if (typeof rem === "number") {
            toast.error(t("row.insufficientCredits", { required: req, remaining: rem }));
          } else {
            toast.error(t("row.insufficientCreditsShort"));
          }
        } else {
          toast.error(json.error?.message ?? t("row.draftError"));
        }
        return;
      }

      onReplyDraftSuccess(json.data.reply);
    } catch {
      toast.error(t("row.draftError"));
    } finally {
      setLoading(false);
    }
  }, [
    appName,
    onReplyDraftSuccess,
    onShowReplyDraft,
    replyDraft,
    review,
    t,
    workspaceId,
  ]);

  const onCopy = useCallback(async () => {
    if (!replyDraft?.trim()) return;
    try {
      await navigator.clipboard.writeText(replyDraft);
      toast.success(t("row.copySuccess"));
    } catch {
      toast.error(t("row.copyError"));
    }
  }, [replyDraft, t]);

  const showDraftPanel = Boolean(replyDraft?.trim() && replyDraftVisible);

  return (
    <article className="space-y-3">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:grid-cols-4">
        <div className="space-y-2 text-start">
          <p className="font-medium text-white">{review.userName}</p>
          <StarsRow rating={review.rating} />
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-400">v{review.appVersion}</span>
            <span className="mx-1.5 text-zinc-700" aria-hidden>
              ·
            </span>
            <span aria-hidden>{flag}</span>
            <span className="sr-only">{review.locale}</span>
          </p>
          <p className="text-xs text-zinc-600">{review.dateIso}</p>
        </div>

        <div className="text-start md:col-span-2">
          <p className="w-full text-sm leading-relaxed text-zinc-300">{review.text}</p>
          {review.classifications.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {review.classifications.map((c) => (
                <ClassificationPill key={c} kind={c} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-stretch justify-start gap-2 md:items-end">
          {/* Draft AI Reply — hidden in competitor mode (can't reply to their reviews) */}
          {!isCompetitorMode && (
            <Button
              type="button"
              size="sm"
              disabled={loading}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-500 md:w-auto"
              onClick={() => void onDraftReply()}
            >
              {loading ? (
                <>
                  <Loader2 className="me-1.5 size-3.5 animate-spin" aria-hidden />
                  {t("row.drafting")}
                </>
              ) : (
                t("row.draftAiReply", { credits: AI_CREDIT_COSTS.reviews_ai_reply })
              )}
            </Button>
          )}

          {/* Queue button — own app: standard; competitor: amber "exploit" variant */}
          <Button
            type="button"
            size="sm"
            disabled={isAddedToQueue || addingToQueue}
            className={cn(
              "w-full md:w-auto",
              isAddedToQueue
                ? isCompetitorMode
                  ? "cursor-not-allowed border border-orange-800/40 bg-orange-950/50 text-orange-400/80 hover:bg-orange-950/50"
                  : "cursor-not-allowed border border-slate-700 bg-slate-800 text-emerald-400/90 hover:bg-slate-800"
                : isCompetitorMode
                  ? "border border-orange-500/40 bg-orange-500/10 font-semibold text-orange-300 hover:border-orange-400/60 hover:bg-orange-500/20"
                  : "border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800",
            )}
            onClick={() => void onAddToQueue()}
          >
            {addingToQueue ? (
              <>
                <Loader2 className="me-1.5 size-3.5 animate-spin" aria-hidden />
                {t("row.drafting")}
              </>
            ) : isAddedToQueue ? (
              isCompetitorMode ? t("row.addedToCompetitorQueue") : t("row.addedToQueue")
            ) : isCompetitorMode ? (
              t("row.exploitLoophole")
            ) : (
              t("row.addToListing")
            )}
          </Button>

          {!isCompetitorMode && replyDraft && !replyDraftVisible ? (
            <p className="text-center text-xs text-zinc-500 md:text-end">{t("row.draftCachedHint")}</p>
          ) : null}
          {!isCompetitorMode && showDraftPanel ? (
            <p className="text-center text-xs text-zinc-500 md:text-end">{t("row.draftReadyHint")}</p>
          ) : null}
        </div>
      </div>
      {showDraftPanel ? (
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
          <textarea
            readOnly
            value={replyDraft ?? ""}
            rows={4}
            className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-start text-sm leading-relaxed text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            aria-label={t("row.draftLabel")}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-slate-800 text-zinc-200 hover:bg-slate-700"
              onClick={onCloseReplyDraft}
            >
              {t("row.closeReply")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              onClick={() => void onCopy()}
            >
              <Copy className="me-1.5 size-3.5" aria-hidden />
              {t("row.copyReply")}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
