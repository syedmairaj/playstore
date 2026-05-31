"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BookOpen, Search, Swords, Sparkles, AlertTriangle } from "lucide-react";

// ── Signal context passed in for listing_generation confirmations ─────────────

export type SynthesisSignalContext = {
  /** Review-issue items (sentimentTag does NOT start with "market_spotlight:") */
  reviewItems: { label: string }[];
  /** Market-spotlight items (sentimentTag starts with "market_spotlight:") */
  marketItems: { keyword: string }[];
  /** Competitor weakness strings */
  competitorItems: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credits: number;
  isRtl: boolean;
  onConfirm: () => void;
  /** When provided, renders the dynamic Synthesis Summary for listing_generation confirms. */
  synthesisContext?: SynthesisSignalContext;
  /** When true, renders a pro-tip block steering the user toward Competitor Spy first. */
  showSpyTip?: boolean;
  /** Which autofill field triggered the dialog — selects field-specific body copy when showSpyTip is true. */
  autofillField?: "keywords" | "features";
  /** href for the "Go to Competitor Spy" link (e.g. `/app/{workspaceId}/competitors`). */
  spyHref?: string;
  /** Called when the user clicks the spy link so the parent can close/reset pending state. */
  onGoToSpy?: () => void;
};

// ── Signal row sub-component ──────────────────────────────────────────────────

function SignalRow({
  icon,
  label,
  detail,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  color: "rose" | "emerald" | "violet";
}) {
  const bg = {
    rose: "bg-rose-500/10 ring-rose-500/20 text-rose-300",
    emerald: "bg-emerald-500/10 ring-emerald-500/20 text-emerald-300",
    violet: "bg-violet-500/10 ring-violet-500/20 text-violet-300",
  }[color];

  return (
    <li className="flex items-start gap-2.5">
      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1", bg)}>
        {icon}
      </span>
      <div className="min-w-0">
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        {detail && (
          <span className="block truncate text-xs text-zinc-500">{detail}</span>
        )}
      </div>
    </li>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function OptimizerCreditsConfirmDialog({
  open,
  onOpenChange,
  credits,
  isRtl,
  onConfirm,
  synthesisContext,
  showSpyTip,
  autofillField,
  spyHref,
  onGoToSpy,
}: Props) {
  const t = useTranslations("optimizer");

  // ── Resolve what to render in the dialog body ─────────────────────────────

  const isSynthesis = Boolean(synthesisContext);
  const hasSignals =
    isSynthesis &&
    ((synthesisContext?.reviewItems.length ?? 0) > 0 ||
      (synthesisContext?.marketItems.length ?? 0) > 0 ||
      (synthesisContext?.competitorItems.length ?? 0) > 0);

  function resolveBodyText(): string {
    if (showSpyTip) {
      if (autofillField === "keywords") return t("form.confirmCreditsBodyKeywords");
      if (autofillField === "features") return t("form.confirmCreditsBodyFeatures");
      return t("form.confirmCreditsBodyWithTip", { credits });
    }
    if (!isSynthesis) return t("form.confirmCreditsBody", { credits });
    // Synthesis path — body rendered as JSX below, return empty
    return "";
  }

  const bodyText = resolveBodyText();

  // ── Credit cost label ─────────────────────────────────────────────────────

  const creditLabel = t("form.confirmCreditsCost", { credits });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          "border border-zinc-800 bg-[#0B0E14] text-white sm:max-w-md",
          isRtl && "font-arabic",
        )}
        closeButtonClassName="text-white/60 hover:text-white"
        closeButtonSrText={t("form.confirmCreditsCancel")}
      >
        <DialogHeader className={cn(isRtl ? "text-end sm:text-end" : "text-start sm:text-start")}>
          <DialogTitle className="text-lg font-semibold text-white">
            {isSynthesis
              ? t("form.confirmSynthesisTitle")
              : t("form.confirmCreditsTitle")}
          </DialogTitle>
        </DialogHeader>

        {/* ── Synthesis Summary (listing_generation with signals) ─────────── */}
        {isSynthesis ? (
          <div className="space-y-4">
            {/* Credit cost — visible but secondary */}
            <p className={cn("text-xs text-zinc-500", isRtl && "text-end")}>
              {creditLabel}
            </p>

            {hasSignals ? (
              <>
                <p className={cn("text-sm text-zinc-300", isRtl && "text-end")}>
                  {t("form.confirmSynthesisIntro")}
                </p>
                <ul className="space-y-2.5">
                  {/* Review Issues */}
                  {(synthesisContext?.reviewItems.length ?? 0) > 0 && (
                    <SignalRow
                      icon={<BookOpen className="size-3.5" aria-hidden />}
                      label={t("form.confirmSynthesisReview", {
                        count: synthesisContext!.reviewItems.length,
                      })}
                      detail={
                        synthesisContext!.reviewItems[0]?.label
                          ? `e.g. "${synthesisContext!.reviewItems[0].label}"`
                          : undefined
                      }
                      color="rose"
                    />
                  )}
                  {/* Market Keywords */}
                  {(synthesisContext?.marketItems.length ?? 0) > 0 && (
                    <SignalRow
                      icon={<Search className="size-3.5" aria-hidden />}
                      label={t("form.confirmSynthesisMarket", {
                        count: synthesisContext!.marketItems.length,
                      })}
                      detail={
                        synthesisContext!.marketItems[0]?.keyword
                          ? `targeting "${synthesisContext!.marketItems[0].keyword}"`
                          : undefined
                      }
                      color="emerald"
                    />
                  )}
                  {/* Competitor Intelligence */}
                  {(synthesisContext?.competitorItems.length ?? 0) > 0 && (
                    <SignalRow
                      icon={<Swords className="size-3.5" aria-hidden />}
                      label={t("form.confirmSynthesisCompetitor", {
                        count: synthesisContext!.competitorItems.length,
                      })}
                      detail={
                        synthesisContext!.competitorItems[0]
                          ? `positioning against "${synthesisContext!.competitorItems[0].slice(0, 40)}${synthesisContext!.competitorItems[0].length > 40 ? "…" : ""}"`
                          : undefined
                      }
                      color="violet"
                    />
                  )}
                </ul>
              </>
            ) : (
              /* No signals — standard ASO fallback */
              <div className={cn("flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3.5 py-3", isRtl && "flex-row-reverse")}>
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-amber-300">
                    {t("form.confirmSynthesisNoSignalsTitle")}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-amber-400/70">
                    {t("form.confirmSynthesisNoSignalsBody")}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Standard autofill / other body text ──────────────────────── */
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/60">
            {bodyText}
          </p>
        )}

        {/* Spy tip link */}
        {showSpyTip && spyHref ? (
          <div className={cn(isRtl ? "text-end" : "text-start")}>
            <a
              href={spyHref}
              onClick={() => {
                onGoToSpy?.();
                onOpenChange(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              {t("form.confirmCreditsSpyLink")}
            </a>
          </div>
        ) : null}

        <DialogFooter
          className={cn(
            "gap-2 sm:gap-2",
            isRtl ? "sm:flex-row-reverse sm:justify-start" : "sm:justify-end",
          )}
        >
          <Button
            type="button"
            variant="outline"
            className="border-zinc-700 bg-zinc-900/80 text-white/85 hover:bg-zinc-800"
            onClick={() => onOpenChange(false)}
          >
            {t("form.confirmCreditsCancel")}
          </Button>
          <Button
            type="button"
            className={cn(
              "font-semibold text-white",
              isSynthesis && hasSignals
                ? "bg-indigo-600 hover:bg-indigo-500"
                : "bg-emerald-500 hover:bg-emerald-400",
            )}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {isSynthesis ? (
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5" aria-hidden />
                {t("form.confirmSynthesisGenerate")}
              </span>
            ) : (
              t("form.confirmCreditsYes")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
