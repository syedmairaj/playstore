"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { OptimizerSparkleTextarea } from "@/components/listing/optimizer/optimizer-sparkle-textarea";
import type { DiscoveryWorkflowMode } from "@/lib/client/growth-orchestrator";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { cn } from "@/lib/utils";

type AutofillField = "keywords" | "features";

type Props = {
  mode: DiscoveryWorkflowMode;
  onModeChange: (mode: DiscoveryWorkflowMode) => void;
  /** When true, hide the first-run Auto-Fill vs Scratch choice cards. */
  workflowChosen?: boolean;
  isRtl: boolean;
  keywords: string;
  features: string;
  onKeywordsChange: (value: string) => void;
  onFeaturesChange: (value: string) => void;
  isFetchingSpyContext: boolean;
  showMissingContextAlert: boolean;
  disableScratchAutofill: boolean;
  autofillBusy: AutofillField | null;
  isProcessingCredits: boolean;
  workspaceReady: boolean;
  onRequestAutofill: (field: AutofillField) => void;
  onNavigateToCompetitorSpy: () => void;
  onNavigateToReviews: () => void;
};

export function MarketDiscoveryWorkflow({
  mode,
  onModeChange,
  workflowChosen = false,
  isRtl,
  keywords,
  features,
  onKeywordsChange,
  onFeaturesChange,
  isFetchingSpyContext,
  showMissingContextAlert,
  disableScratchAutofill,
  autofillBusy,
  isProcessingCredits,
  workspaceReady,
  onRequestAutofill,
  onNavigateToCompetitorSpy,
  onNavigateToReviews,
}: Props) {
  const t = useTranslations("optimizer.marketDiscoveryWorkflow");
  const tForm = useTranslations("optimizer.form");
  const tSmart = useTranslations("optimizer.smartWorkflow");

  const isRecommended = mode === "recommended";
  const scratchDisabled =
    disableScratchAutofill ||
    Boolean(autofillBusy) ||
    isProcessingCredits ||
    !workspaceReady;
  const fieldDisabled =
    Boolean(autofillBusy) || isProcessingCredits || !workspaceReady;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          isRtl && "sm:flex-row-reverse",
        )}
      >
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400/95">
            {t("pathToggleLabel")}
          </p>
          <p className="text-xs leading-relaxed text-white/50">{t("pathToggleHint")}</p>
        </div>
        <div
          role="group"
          aria-label={t("pathToggleAria")}
          className={cn(
            "inline-flex rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-1",
            isRtl && "flex-row-reverse",
          )}
        >
          <WorkflowToggleButton
            active={isRecommended}
            onClick={() => onModeChange("recommended")}
            icon={<Wand2 className="size-3.5" aria-hidden />}
            label={t("recommended")}
          />
          <WorkflowToggleButton
            active={!isRecommended}
            onClick={() => onModeChange("manual")}
            icon={<Sparkles className="size-3.5" aria-hidden />}
            label={t("manual")}
          />
        </div>
      </div>

      {!workflowChosen ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DiscoveryPathCard
            selected={!isRecommended}
            title={t("manualCardTitle")}
            subtitle={t("manualCardSubtitle")}
            badge={t("manualBadge")}
            tone="neutral"
          />
          <DiscoveryPathCard
            selected={isRecommended}
            title={t("recommendedCardTitle")}
            subtitle={t("recommendedCardSubtitle")}
            badge={t("recommendedBadge")}
            tone="emerald"
          />
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-2xl border p-4 sm:p-5",
          isRecommended
            ? "border-emerald-500/35 bg-emerald-500/[0.07]"
            : "border-zinc-700/80 bg-zinc-900/40",
        )}
      >
        {isRecommended && showMissingContextAlert ? (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4"
          >
            <div className={cn("flex gap-3", isRtl && "flex-row-reverse")}>
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-amber-300"
                aria-hidden
              />
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-amber-100">
                    {t("missingContextTitle")}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
                    {t("missingContextBody")}
                  </p>
                </div>
                <div className={cn("flex flex-wrap gap-2", isRtl && "flex-row-reverse")}>
                  <button
                    type="button"
                    onClick={onNavigateToCompetitorSpy}
                    className="inline-flex items-center justify-center rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-50 ring-1 ring-amber-400/35 transition hover:bg-amber-500/30"
                  >
                    {t("linkCompetitorSpy")}
                  </button>
                  <button
                    type="button"
                    onClick={onNavigateToReviews}
                    className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
                  >
                    {t("linkReviews")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {isRecommended && isFetchingSpyContext ? (
          <div
            role="status"
            className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          >
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            <span>{t("fetchingFromSpy")}</span>
          </div>
        ) : null}

        <div className="space-y-6">
          <div className="space-y-1.5">
            <OptimizerSparkleTextarea
              id="lo-keywords"
              label={tForm("keywords")}
              labelTitle={tForm("keywordsFieldTitle")}
              value={keywords}
              onChange={onKeywordsChange}
              placeholder={
                isRecommended
                  ? t("recommendedKeywordsPlaceholder")
                  : tForm("keywordsPlaceholder")
              }
              rows={4}
              minHeightClass="min-h-[92px]"
              disabled={isRecommended ? fieldDisabled || disableScratchAutofill : scratchDisabled}
              busy={
                autofillBusy === "keywords" ||
                (isRecommended && isFetchingSpyContext)
              }
              onAutofill={() => onRequestAutofill("keywords")}
              onBeforeAutofill={() => onRequestAutofill("keywords")}
              sparkleAriaLabel={tForm("autofill.sparkleAriaKeywords")}
              sparkleTooltip={
                isRecommended || disableScratchAutofill
                  ? t("scratchDisabledTooltip")
                  : tForm("autofill.aiAssistTooltipKeywords")
              }
              creditsNote={
                isRecommended
                  ? t("autoFillNoExtraCredits")
                  : tForm("autofill.usesCredits", {
                      credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
                    })
              }
            />
            {keywords.trim().length === 0 ? (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {isRecommended ? tSmart("keywordsHelper") : tSmart("keywordsHelper")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <OptimizerSparkleTextarea
              id="lo-features"
              label={tForm("features")}
              labelTitle={tForm("featuresFieldTitle")}
              value={features}
              onChange={onFeaturesChange}
              placeholder={
                isRecommended
                  ? t("recommendedFeaturesPlaceholder")
                  : tForm("featuresPlaceholder")
              }
              rows={5}
              minHeightClass="min-h-[144px]"
              disabled={isRecommended ? fieldDisabled || disableScratchAutofill : scratchDisabled}
              busy={
                autofillBusy === "features" ||
                (isRecommended && isFetchingSpyContext)
              }
              onAutofill={() => onRequestAutofill("features")}
              onBeforeAutofill={() => onRequestAutofill("features")}
              sparkleAriaLabel={tForm("autofill.sparkleAriaFeatures")}
              sparkleTooltip={
                isRecommended || disableScratchAutofill
                  ? t("scratchDisabledTooltip")
                  : tForm("autofill.aiAssistTooltipFeatures")
              }
              creditsNote={
                isRecommended
                  ? t("autoFillNoExtraCredits")
                  : tForm("autofill.usesCredits", {
                      credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
                    })
              }
            />
            {features.trim().length === 0 ? (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {tSmart("featuresHelper")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm",
        active
          ? "bg-emerald-500 text-white shadow-sm"
          : "text-white/55 hover:bg-white/[0.06] hover:text-white/80",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DiscoveryPathCard({
  selected,
  title,
  subtitle,
  badge,
  tone,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  badge: string;
  tone: "neutral" | "emerald";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition sm:p-5",
        selected
          ? tone === "emerald"
            ? "border-emerald-500/35 bg-emerald-500/[0.07] shadow-[0_8px_28px_-18px_rgba(16,185,129,0.45)]"
            : "border-zinc-600/80 bg-zinc-900/50"
          : "border-zinc-800/70 bg-zinc-950/30 opacity-60",
      )}
    >
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
          tone === "emerald"
            ? "bg-emerald-500/15 text-emerald-200"
            : "bg-zinc-800 text-zinc-400",
        )}
      >
        {badge}
      </span>
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/50">{subtitle}</p>
    </div>
  );
}
