"use client";

import { AlertTriangle, Check, ChevronDown, Copy, Hash, Info, Layers, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AI_CREDIT_COSTS,
  KEYWORD_TRACK_AI_FREE_PER_GENERATION,
} from "@/lib/features/billing/credit-costs";
import {
  LISTING_LONG_MAX,
  LISTING_LONG_WARN_FROM,
  LISTING_SHORT_MAX,
  LISTING_SHORT_WARN_FROM,
  LISTING_TITLE_MAX,
  LISTING_TITLE_WARN_FROM,
  charCountToneClass,
  listingCountTone,
} from "@/components/listing/optimizer/listing-field-limits";
import { OptimizerAsoScoreCard } from "@/components/listing/optimizer/optimizer-aso-score-card";
import { OptimizerListingSkeleton } from "@/components/listing/optimizer/optimizer-listing-skeleton";
import { OptimizerResultList } from "@/components/listing/optimizer/optimizer-result-list";
import { KeywordStrategyPanel } from "@/components/listing/optimizer/keyword-strategy-panel";
import {
  MetadataVariantToggle,
  StrategicRationaleCard,
} from "@/components/listing/optimizer/strategic-rationale-card";
import { ModularListingPanel } from "@/components/listing/optimizer/modular-listing-panel";
import type { LongDescriptionAiTool } from "@/components/listing/optimizer/long-description-aso-editor";
import type { ModularListingBlockId, ModularListingState, ModularLongUiMode } from "@/lib/listing/modular-listing.types";
import { EMPTY_MODULAR_LISTING_STATE } from "@/lib/listing/modular-listing.types";
import type { ModularLoadingState } from "@/hooks/useModularGeneration";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";
import type { ListingHealthFixActionId } from "@/lib/listing/listing-health-fix-actions";

type ApiMeta = {
  model?: string;
  promptVersion?: string;
  persisted?: boolean;
  asoScorePartial?: boolean;
  /** True when the clamp layer had to trim shortDescription to fit ≤80 chars. */
  shortDescriptionClamped?: boolean;
} | undefined;

/** Full results-area loading shell (skeleton + Active Auditor) during first generate. */
export function OptimizerResultsGeneratingView({ isRtl = false }: { isRtl?: boolean }) {
  const t = useTranslations("optimizer");

  return (
    <>
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className="space-y-4 border-b border-zinc-800/80 pb-8 sm:pb-10"
      >
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {t("results.heading")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-white/58 sm:text-[15px] sm:leading-[1.65]">
          {t("results.subheading")}
        </p>
      </div>
      <div className="mt-2">
        <OptimizerListingSkeleton isRtl={isRtl} />
        <div className={cn(
          "mt-5 flex flex-col items-center gap-1 text-center",
          isRtl && "font-arabic",
        )}>
          <p className="text-sm text-white/55">{t("results.generatingPreview")}</p>
          <p className="text-xs text-white/30">{t("form.generatingHint")}</p>
        </div>
      </div>
    </>
  );
}

type Props = {
  result: ListingGenerationOutput;
  meta: ApiMeta;
  resultsBusy: boolean;
  lastGeneratedAtIso: string | null;
  lastGeneratedLabel: string;
  isRtl: boolean;
  editedTitle: string;
  setEditedTitle: (v: string) => void;
  editedShort: string;
  setEditedShort: (v: string) => void;
  editedLong: string;
  setEditedLong: (v: string) => void;
  clampedListing: {
    title: string;
    shortDescription: string;
    fullDescription: string;
  };
  onCopyAllBlocks: () => void;
  onCopyKeywordsList: () => void;
  onCopyCtasList: () => void;
  onCopyTitle: () => void;
  onCopyShort: () => void;
  onCopyLong: () => void;
  onExportOpen: () => void;
  canRegenerate: boolean;
  onRegeneratePunchier: () => void;
  onRegenerateProfessional: () => void;
  onRegenerateArabic: () => void;
  onRegenerateTone: () => void;
  workspaceId: string | undefined;
  selectedAppId: string;
  listingGenerationId: string | undefined;
  trackKwBusy: boolean;
  onTrackKeywords: () => void;
  logoGenTriggerDisabled: boolean;
  logoGenTriggerTitle: string | undefined;
  onOpenLogoGen: () => void;
  appsListLength: number;
  showGenerateSuccess?: boolean;
  canSaveToTracker?: boolean;
  /** Snapshot of queuedImprovements at generation time — drives Optimization Factors pills. */
  generationQueueSnapshot?: ListingImprovementItem[];
  strategyMode?: import("@/lib/optimization-queue/resolve-strategy-mode").ActiveContextStrategyMode;
  metadataVariant?: "aggressive" | "growth";
  onMetadataVariantChange?: (variant: "aggressive" | "growth") => void;
  onRegenerateOrchestrationModule?: (
    moduleId: "anchor" | "conversion" | "expansion",
  ) => void;
  regeneratingOrchestrationModule?: "anchor" | "conversion" | "expansion" | null;
  /** Modular pipeline state — synced from orchestration or draft generation. */
  modularState?: ModularListingState;
  modularLoading?: ModularLoadingState;
  onRegenerateModularBlock?: (blockId: ModularListingBlockId) => void;
  onSelectModularShortVariation?: (index: number, variation: string) => void;
  onModularTitleChange?: (value: string) => void;
  onModularLongDescriptionChange?: (value: string) => void;
  onModularMagicGenerateLong?: () => void;
  onModularLongAiTool?: (tool: LongDescriptionAiTool) => void;
  onListingHealthFix?: (actionId: ListingHealthFixActionId) => void;
  onModularFinalize?: () => void;
  modularFinalizeBusy?: boolean;
  modularDraftReady?: boolean;
  isPublicationReady?: boolean;
  copyListingBlocked?: boolean;
  modularFinalizeCreditCost?: number;
  trialRegenerationsUsed?: number;
  longUiMode?: ModularLongUiMode;
  onLongUiModeChange?: (mode: ModularLongUiMode) => void;
  draftRestoredFromStorage?: boolean;
  previousBlocks?: Partial<Record<import("@/lib/listing/modular-listing.types").ModularBlockSnapshotKey, string>>;
  blockErrors?: Partial<Record<import("@/lib/listing/modular-listing.types").ModularBlockSnapshotKey, boolean>>;
  modularSeedKeywords?: string[];
  listingHealth?: ListingGenerationWarningsPayload | null;
  lockedKeywords?: string[];
};

export function OptimizerResultsPanel({
  result,
  meta,
  resultsBusy,
  lastGeneratedAtIso,
  lastGeneratedLabel,
  isRtl,
  editedTitle,
  setEditedTitle,
  editedShort,
  setEditedShort,
  editedLong,
  setEditedLong,
  clampedListing,
  onCopyAllBlocks,
  onCopyKeywordsList,
  onCopyCtasList,
  onCopyTitle,
  onCopyShort,
  onCopyLong,
  onExportOpen,
  canRegenerate,
  onRegeneratePunchier,
  onRegenerateProfessional,
  onRegenerateArabic,
  onRegenerateTone,
  workspaceId,
  selectedAppId,
  listingGenerationId,
  trackKwBusy,
  onTrackKeywords,
  logoGenTriggerDisabled,
  logoGenTriggerTitle,
  onOpenLogoGen,
  appsListLength,
  showGenerateSuccess = false,
  canSaveToTracker = false,
  generationQueueSnapshot = [],
  strategyMode = "defensive",
  metadataVariant = "growth",
  onMetadataVariantChange,
  onRegenerateOrchestrationModule,
  regeneratingOrchestrationModule = null,
  modularState,
  modularLoading,
  onRegenerateModularBlock,
  onSelectModularShortVariation,
  onModularTitleChange,
  onModularLongDescriptionChange,
  onModularMagicGenerateLong,
  onModularLongAiTool,
  onListingHealthFix,
  onModularFinalize,
  modularFinalizeBusy = false,
  modularDraftReady = false,
  isPublicationReady = false,
  copyListingBlocked = false,
  modularFinalizeCreditCost = 5,
  trialRegenerationsUsed = 0,
  longUiMode = "choice",
  onLongUiModeChange,
  draftRestoredFromStorage = false,
  previousBlocks = {},
  blockErrors = {},
  modularSeedKeywords = [],
  listingHealth = null,
  lockedKeywords = [],
}: Props) {
  const t = useTranslations("optimizer");
  const hasOrchestration = Boolean(result.orchestration);
  const showModularPanel = hasOrchestration || modularDraftReady;

  const inputRing =
    "rounded-xl border bg-black/30 px-3.5 py-3.5 text-[15px] text-white outline-none transition placeholder:text-white/35 disabled:opacity-50";
  const inputFocus =
    "focus-visible:border-emerald-500/40 focus-visible:shadow-[0_0_0_3px_rgba(52,211,153,0.1)] focus-visible:ring-[0.5px] focus-visible:ring-emerald-400/55";

  return (
    <section
      dir={isRtl ? "rtl" : "ltr"}
      className="relative flex min-h-0 min-w-0 flex-col gap-8 pb-28"
      aria-labelledby="listing-results-heading"
    >
      {resultsBusy ? (
        <div
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 shadow-[inset_0_1px_0_0_rgba(34,197,94,0.12)]"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]"
            aria-hidden
          />
          {t("results.regenerating")}
        </div>
      ) : null}

      <div className="space-y-4 border-b border-zinc-800/80 pb-8 sm:pb-10">
        <h2
          id="listing-results-heading"
          className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
        >
          {t("results.heading")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-white/58 sm:text-[15px] sm:leading-[1.65]">
          {t("results.subheading")}
        </p>
        {showGenerateSuccess ? (
          <p
            role="status"
            className="inline-flex max-w-2xl items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm font-medium text-emerald-100 motion-safe:animate-fade-up"
          >
            <Check className="size-4 shrink-0 text-emerald-300" aria-hidden />
            {t("results.generateSuccessBanner")}
          </p>
        ) : null}
        {lastGeneratedAtIso ? (
          <p className="text-xs font-medium text-emerald-300/88">
            {t("results.lastGeneratedLine", { date: lastGeneratedLabel })}
          </p>
        ) : null}
        {meta?.persisted === false ? (
          <p className="text-xs text-amber-300/90">{t("results.persistWarning")}</p>
        ) : meta?.promptVersion ? (
          <p className="text-xs text-white/45">
            {t("results.metaPrompt", {
              version: meta.promptVersion,
              model: meta.model ?? "",
            })}
          </p>
        ) : null}
      </div>

      {typeof result.asoScore === "number" &&
      result.scoreBreakdown &&
      result.improvementTips &&
      result.improvementTips.length > 0 ? (
        <OptimizerAsoScoreCard
          asoScore={result.asoScore}
          scoreBreakdown={result.scoreBreakdown}
          improvementTips={result.improvementTips}
          showSuccessPulse={showGenerateSuccess}
          isRtl={isRtl}
        />
      ) : result.asoScoreDegraded ? (
        <div
          className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100/90"
          role="status"
        >
          {t("results.asoScoreUnavailable")}
        </div>
      ) : null}

        {showModularPanel && modularLoading && onRegenerateModularBlock ? (
        <>
          {modularDraftReady && !listingGenerationId && !draftRestoredFromStorage ? (
            <p
              role="status"
              className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90"
            >
              {t("form.modularDraftInProgress")}
            </p>
          ) : null}
        <ModularListingPanel
          orchestration={result.orchestration}
          state={modularState ?? EMPTY_MODULAR_LISTING_STATE}
          loading={modularLoading}
          title={editedTitle}
          shortDescription={editedShort}
          longDescription={editedLong}
          isRtl={isRtl}
          isDraft={modularDraftReady && !listingGenerationId}
          isPublicationReady={isPublicationReady}
          finalizeCreditCost={modularFinalizeCreditCost}
          trialRegenerationsUsed={trialRegenerationsUsed}
          longUiMode={longUiMode}
          onLongUiModeChange={onLongUiModeChange}
          previousBlocks={previousBlocks}
          blockErrors={blockErrors}
          seedKeywords={modularSeedKeywords}
          listingHealth={listingHealth}
          lockedKeywords={lockedKeywords}
          onRegenerateBlock={onRegenerateModularBlock}
          onSelectShortVariation={onSelectModularShortVariation ?? (() => {})}
          onTitleChange={onModularTitleChange}
          onLongDescriptionChange={onModularLongDescriptionChange}
          onMagicGenerateLong={onModularMagicGenerateLong}
          onLongAiTool={onModularLongAiTool}
          onListingHealthFix={onListingHealthFix}
          onFinalize={onModularFinalize}
          finalizeBusy={modularFinalizeBusy}
        />
        </>
      ) : null}

      {result.strategicRationale ? (
        <StrategicRationaleCard
          rationale={result.strategicRationale}
          strategyMode={strategyMode}
          isRtl={isRtl}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
        />
      ) : null}

      {result.listingVariants ? (
        <MetadataVariantToggle
          value={metadataVariant}
          onChange={(v) => onMetadataVariantChange?.(v)}
          hasAggressive={Boolean(result.listingVariants.aggressive)}
          hasGrowth={Boolean(result.listingVariants.growth)}
          isRtl={isRtl}
        />
      ) : null}

      {/* ── Strategy Summary card (v11) ────────────────────────────────────── */}
      {/* Shows the consultant-grade synthesis note: what signals were used and how. */}
      {(() => {
        // v11: prefer strategySummary; fall back to strategicNote for stored rows
        const summaryText = (result.strategySummary ?? result.strategicNote ?? "").trim();

        // Classify signals from the generation snapshot for the pills
        const issueItems = generationQueueSnapshot.filter(
          (i) => !i.sentimentTag?.startsWith("market_spotlight:"),
        );
        const spotlightItems = generationQueueSnapshot.filter(
          (i) => i.sentimentTag?.startsWith("market_spotlight:"),
        );
        const hasIssues = issueItems.length > 0;
        const hasSpotlight = spotlightItems.length > 0;
        const hasAnySummary = Boolean(summaryText);

        if (!hasIssues && !hasSpotlight && !hasAnySummary) return null;

        return (
          <div
            className={cn(
              "flex flex-col gap-3 rounded-2xl border border-zinc-800/70 bg-white/[0.025] p-4",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300",
              isRtl && "font-arabic",
            )}
            role="status"
            aria-live="polite"
          >
            {/* Header row */}
            <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
              <Layers className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
              <p className={cn(
                "text-[11px] font-semibold uppercase tracking-wider text-zinc-500",
              )}>
                {isRtl ? "ملخص الاستراتيجية" : "Strategy Summary"}
              </p>
            </div>

            {/* Signal pills */}
            {(hasIssues || hasSpotlight) && (
              <div className={cn("flex flex-wrap gap-1.5", isRtl && "flex-row-reverse")}>
                {hasIssues && (
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-rose-300/90",
                    isRtl && "flex-row-reverse",
                  )}>
                    <AlertTriangle className="size-3 shrink-0 text-rose-400" aria-hidden />
                    {isRtl
                      ? `${issueItems.length} مشكلة تم إصلاحها`
                      : `${issueItems.length} review issue${issueItems.length > 1 ? "s" : ""} fixed`}
                  </span>
                )}
                {hasSpotlight && (
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-300/90",
                    isRtl && "flex-row-reverse",
                  )}>
                    <Hash className="size-3 shrink-0 text-emerald-400" aria-hidden />
                    {isRtl
                      ? `${spotlightItems.length} كلمة سوق مُنسجت`
                      : `${spotlightItems.length} market keyword${spotlightItems.length > 1 ? "s" : ""} woven in`}
                  </span>
                )}
              </div>
            )}

            {/* Synthesis note text */}
            {hasAnySummary && (
              <p className={cn(
                "flex items-start gap-1.5 text-[12px] leading-relaxed text-zinc-400",
                isRtl && "flex-row-reverse text-end",
              )}>
                <Info className="mt-0.5 size-3 shrink-0 text-zinc-600" aria-hidden />
                {summaryText}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Hero CTA card (v11) ───────────────────────────────────────────────── */}
      {/* The single strongest install CTA — shown prominently before the listing fields. */}
      {result.ctaSuggestion ? (
        <div className={cn(
          "flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-[#07120e]/80 px-4 py-3.5",
          "ring-1 ring-emerald-500/10",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:[animation-delay:40ms] motion-safe:[animation-fill-mode:both]",
          isRtl && "flex-row-reverse font-arabic",
        )}>
          <div className={cn("flex min-w-0 flex-1 flex-col gap-1", isRtl && "items-end")}>
            <div className={cn("flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
              <Zap className="size-3 shrink-0 text-emerald-400" aria-hidden />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
                {isRtl ? "نداء التحويل" : "Hero CTA"}
              </p>
            </div>
            <p className={cn(
              "text-sm font-medium leading-relaxed text-zinc-100/95",
              isRtl && "text-end",
            )}>
              {result.ctaSuggestion}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(result.ctaSuggestion ?? "");
            }}
            className="mt-0.5 shrink-0 text-xs font-medium text-emerald-300/80 underline-offset-4 hover:text-emerald-200 hover:underline"
            aria-label={isRtl ? "نسخ نداء التحويل" : "Copy hero CTA"}
          >
            {isRtl ? "نسخ" : "Copy"}
          </button>
        </div>
      ) : null}

      {!hasOrchestration ? (
      <Tabs defaultValue="title" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="title">{t("results.fieldsTabTitle")}</TabsTrigger>
          <TabsTrigger value="short">{t("results.fieldsTabShort")}</TabsTrigger>
          <TabsTrigger value="long">{t("results.fieldsTabLong")}</TabsTrigger>
        </TabsList>

        <TabsContent value="title">
          <div className="space-y-4 pt-1 sm:pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                className="block text-[15px] font-semibold tracking-tight text-white/92"
                htmlFor="lo-res-title"
              >
                {t("results.titleBlock")}
              </label>
              <button
                type="button"
                disabled={resultsBusy}
                onClick={onCopyTitle}
                className="text-xs font-medium text-emerald-300/90 underline-offset-4 hover:underline disabled:opacity-45"
              >
                {t("results.copy")}
              </button>
            </div>
            <input
              id="lo-res-title"
              disabled={resultsBusy}
              aria-invalid={editedTitle.length > LISTING_TITLE_MAX ? true : undefined}
              aria-describedby="lo-res-title-count lo-res-title-hint"
              className={cn(
                "mt-4 w-full",
                inputRing,
                inputFocus,
                editedTitle.length > LISTING_TITLE_MAX
                  ? "border-red-400/45 focus-visible:border-red-400/55"
                  : "border-white/[0.09]",
              )}
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              autoComplete="off"
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <span
                id="lo-res-title-count"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={cn(
                  "text-[13px] font-medium tabular-nums tracking-tight",
                  charCountToneClass(
                    listingCountTone(
                      editedTitle.length,
                      LISTING_TITLE_MAX,
                      LISTING_TITLE_WARN_FROM,
                    ),
                  ),
                )}
              >
                {t("results.charCount", {
                  current: editedTitle.length,
                  max: LISTING_TITLE_MAX,
                })}
              </span>
            </div>
            <p
              id="lo-res-title-hint"
              className="mt-2.5 text-[12px] leading-relaxed text-white/44"
            >
              {t("results.titleLimitHint")}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="short">
          <div className="space-y-4 pt-1 sm:pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                className="block text-[15px] font-semibold tracking-tight text-white/92"
                htmlFor="lo-res-short"
              >
                {t("results.shortBlock")}
              </label>
              <button
                type="button"
                disabled={resultsBusy}
                onClick={onCopyShort}
                className="text-xs font-medium text-emerald-300/90 underline-offset-4 hover:underline disabled:opacity-45"
              >
                {t("results.copy")}
              </button>
            </div>
            <textarea
              id="lo-res-short"
              rows={4}
              disabled={resultsBusy}
              aria-invalid={editedShort.length > LISTING_SHORT_MAX ? true : undefined}
              aria-describedby="lo-res-short-count lo-res-short-hint"
              className={cn(
                "mt-4 min-h-[6.75rem] w-full resize-y leading-relaxed",
                inputRing,
                inputFocus,
                editedShort.length > LISTING_SHORT_MAX
                  ? "border-red-400/45 focus-visible:border-red-400/55"
                  : "border-white/[0.09]",
              )}
              value={editedShort}
              onChange={(e) => setEditedShort(e.target.value)}
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <span
                id="lo-res-short-count"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={cn(
                  "text-[13px] font-medium tabular-nums tracking-tight",
                  charCountToneClass(
                    listingCountTone(
                      editedShort.length,
                      LISTING_SHORT_MAX,
                      LISTING_SHORT_WARN_FROM,
                    ),
                  ),
                )}
              >
                {t("results.charCount", {
                  current: editedShort.length,
                  max: LISTING_SHORT_MAX,
                })}
              </span>
            </div>
            <p
              id="lo-res-short-hint"
              className="mt-2.5 text-[12px] leading-relaxed text-white/44"
            >
              {t("results.shortLimitHint")}
            </p>
            {meta?.shortDescriptionClamped ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-sky-300/70">
                {t("results.shortDescClampedHint")}
              </p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="long">
          <div className="space-y-4 pt-1 sm:pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                className="block text-[15px] font-semibold tracking-tight text-white/92"
                htmlFor="lo-res-long"
              >
                {t("results.fullBlock")}
              </label>
              <button
                type="button"
                disabled={resultsBusy}
                onClick={onCopyLong}
                className="text-xs font-medium text-emerald-300/90 underline-offset-4 hover:underline disabled:opacity-45"
              >
                {t("results.copy")}
              </button>
            </div>
            <textarea
              id="lo-res-long"
              rows={14}
              disabled={resultsBusy}
              aria-invalid={editedLong.length > LISTING_LONG_MAX ? true : undefined}
              aria-describedby="lo-res-long-count lo-res-long-helper lo-res-long-hint"
              className={cn(
                "mt-4 min-h-[min(28rem,52vh)] w-full resize-y leading-relaxed",
                inputRing,
                inputFocus,
                editedLong.length > LISTING_LONG_MAX
                  ? "border-red-400/45 focus-visible:border-red-400/55"
                  : "border-white/[0.09]",
              )}
              value={editedLong}
              onChange={(e) => setEditedLong(e.target.value)}
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <span
                id="lo-res-long-count"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={cn(
                  "text-[13px] font-medium tabular-nums tracking-tight",
                  charCountToneClass(
                    listingCountTone(
                      editedLong.length,
                      LISTING_LONG_MAX,
                      LISTING_LONG_WARN_FROM,
                    ),
                  ),
                )}
              >
                {t("results.charCount", {
                  current: editedLong.length,
                  max: LISTING_LONG_MAX,
                })}
              </span>
            </div>
            <p
              id="lo-res-long-helper"
              className="mt-3.5 text-[12px] leading-relaxed text-white/44"
            >
              {t("results.longDescriptionHint")}
            </p>
            <p
              id="lo-res-long-hint"
              className="mt-2 text-[12px] leading-relaxed text-white/40"
            >
              {t("results.longLimitHint")}
            </p>
          </div>
        </TabsContent>
      </Tabs>
      ) : null}

      <div className="flex w-full justify-center">
        <div
          className={cn(
            "relative w-full max-w-lg rounded-2xl p-[1px]",
            "bg-gradient-to-br from-emerald-500/55 via-emerald-500/18 to-emerald-500/42",
            "shadow-[0_0_52px_-14px_rgba(34,197,94,0.45),0_0_0_1px_rgba(34,197,94,0.14)_inset]",
            "transition-[box-shadow,filter] duration-300 ease-out",
            "hover:shadow-[0_0_64px_-12px_rgba(34,197,94,0.52),0_0_0_1px_rgba(34,197,94,0.2)_inset]",
          )}
        >
          <div
            className={cn(
              "flex flex-col items-stretch gap-2 rounded-[0.9375rem] bg-[#0a100e]/95 px-4 py-3.5 sm:items-center sm:px-5 sm:py-4",
              "ring-1 ring-inset ring-white/[0.04]",
            )}
          >
            <button
              type="button"
              disabled={logoGenTriggerDisabled}
              title={logoGenTriggerTitle}
              aria-label={
                logoGenTriggerTitle
                  ? `${t("logo.openButton")}. ${logoGenTriggerTitle}`
                  : t("logo.openButton")
              }
              aria-describedby="lo-logo-cta-microcopy"
              onClick={() => {
                if (!logoGenTriggerDisabled) onOpenLogoGen();
              }}
              className={cn(
                "relative inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border border-emerald-500/44 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_24px_-14px_rgba(34,197,94,0.35)]",
                "ring-2 ring-emerald-500/22 transition-[border-color,box-shadow,ring-color,transform,background-color,color] duration-200 ease-out",
                "hover:border-emerald-500/58 hover:bg-emerald-500/16 hover:text-emerald-50 hover:shadow-[0_10px_36px_-12px_rgba(34,197,94,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] hover:ring-emerald-500/38",
                "active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[min(100%,17.5rem)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a100e]",
              )}
            >
              {t("logo.openButton")}
            </button>
            <p
              id="lo-logo-cta-microcopy"
              className="text-start text-[11px] leading-relaxed text-white/52 sm:text-xs"
            >
              {t("logo.ctaMicrocopy", {
                credits: AI_CREDIT_COSTS.listing_logo_generation,
              })}
            </p>
            {workspaceId && !resultsBusy && !selectedAppId.trim() ? (
              <p
                className="text-start text-xs font-medium leading-relaxed text-amber-200/90"
                role="status"
              >
                {appsListLength > 0
                  ? t("logo.selectAppFirstHint")
                  : t("logo.addWorkspaceAppForLogo")}
              </p>
            ) : null}
            {/* Brand Assets links */}
            {workspaceId && (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/app/${workspaceId}/brand-assets`}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400/60 transition hover:text-emerald-300/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/55"
                >
                  {t("logo.openBrandAssets")}
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href={`/app/${workspaceId}/brand-assets?mode=vault`}
                  className="inline-flex items-center gap-1 text-[11px] text-white/35 transition hover:text-white/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/55"
                >
                  {t("logo.viewVault")}
                  <span aria-hidden>→</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-7 sm:gap-8">
        {/* ── Visibility Rationale — extracted from ctaSuggestions[0] if present ── */}
        {(() => {
          const firstCta = result.ctaSuggestions?.[0] ?? "";
          const rationale = firstCta.startsWith("WHY THIS RANKS:")
            ? firstCta.replace(/^WHY THIS RANKS:\s*/i, "").trim()
            : null;
          if (!rationale) return null;
          return (
            <div className="rounded-2xl border border-emerald-500/20 bg-[#07120e]/80 px-5 py-4 ring-1 ring-emerald-500/10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-400/80">
                Why This Ranks
              </p>
              <p className="text-sm leading-relaxed text-zinc-200/90">{rationale}</p>
            </div>
          );
        })()}

        {/* ── Keyword Strategy Panel ── */}
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:[animation-delay:60ms] motion-safe:[animation-fill-mode:both]">
          <KeywordStrategyPanel
            keywords={result.keywordSuggestions ?? []}
            copyLabel={t("results.copyAll")}
            onCopyAll={onCopyKeywordsList}
            isRtl={isRtl}
            busy={resultsBusy}
          />
        </div>
        {workspaceId &&
        selectedAppId.trim() &&
        listingGenerationId &&
        !resultsBusy ? (
          <div
            className={cn(
              "rounded-2xl border border-emerald-500/30 bg-[#07120e]/90 p-6 shadow-[0_0_40px_-18px_rgba(34,197,94,0.35)] ring-1 ring-emerald-500/15",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:[animation-delay:120ms] motion-safe:[animation-fill-mode:both]",
              isRtl && "text-end",
            )}
          >
            <p className="text-[13px] font-semibold uppercase tracking-wide text-emerald-400/95">
              {t("results.trackKeywords.kicker")}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-200/95">
              {t("results.trackKeywords.pricingLine", {
                free: KEYWORD_TRACK_AI_FREE_PER_GENERATION,
                per: AI_CREDIT_COSTS.keyword_track_ai_per_keyword,
              })}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
              <button
                type="button"
                disabled={trackKwBusy}
                onClick={() => onTrackKeywords()}
                className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_28px_-8px_rgba(34,197,94,0.45)] ring-2 ring-emerald-500/25 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                {trackKwBusy
                  ? t("results.trackKeywords.busy")
                  : t("results.trackKeywords.cta")}
              </button>
              <Link
                href={`/app/${workspaceId}/keywords`}
                className="text-center text-sm font-medium text-emerald-300/95 underline-offset-4 hover:text-emerald-200 hover:underline sm:text-start"
              >
                {t("results.trackKeywords.secondaryLink")}
              </Link>
            </div>
          </div>
        ) : workspaceId && selectedAppId.trim() && !listingGenerationId && !resultsBusy ? (
          <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            {t("results.trackKeywords.persistHint")}
          </p>
        ) : null}
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:[animation-delay:180ms] motion-safe:[animation-fill-mode:both]">
          <OptimizerResultList
            title={t("results.ctaList")}
            items={(result.ctaSuggestions ?? []).filter(
              (cta, idx) => !(idx === 0 && /^WHY THIS RANKS:/i.test(cta)),
            )}
            copyLabel={t("results.copyAll")}
            onCopyAll={onCopyCtasList}
          />
        </div>

        {/* ── v8: What's New ── */}
        {result.whatsNew ? (
          <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/50 px-5 py-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:[animation-delay:240ms] motion-safe:[animation-fill-mode:both]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-zinc-300/80">
                {t("results.whatsNew.label")}
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(result.whatsNew ?? "");
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300/90 underline-offset-4 hover:underline"
              >
                <Copy className="size-3.5 shrink-0" aria-hidden />
                {t("results.whatsNew.copy")}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200/90">
              {result.whatsNew}
            </p>
            <p className="mt-3 text-[11px] text-zinc-500">
              {t("results.whatsNew.hint")}
            </p>
          </div>
        ) : null}

        {/* ── v8: Screenshot Captions ── */}
        {result.screenshotCaptions && result.screenshotCaptions.length > 0 ? (
          <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/50 px-5 py-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:[animation-delay:300ms] motion-safe:[animation-fill-mode:both]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-zinc-300/80">
                {t("results.screenshotCaptions.label")}
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    (result.screenshotCaptions ?? []).join("\n"),
                  );
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300/90 underline-offset-4 hover:underline"
              >
                <Copy className="size-3.5 shrink-0" aria-hidden />
                {t("results.screenshotCaptions.copyAll")}
              </button>
            </div>
            <ol className={cn("space-y-2", isRtl && "text-end")}>
              {result.screenshotCaptions.map((caption, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-400">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-zinc-200/90">{caption}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] text-zinc-500">
              {t("results.screenshotCaptions.hint")}
            </p>
          </div>
        ) : null}

        {/* ── v8: A/B Title Variant ── */}
        {result.abTestVariant ? (
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] px-5 py-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:[animation-delay:360ms] motion-safe:[animation-fill-mode:both]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-violet-300/80">
                {t("results.abTestVariant.label")}
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(result.abTestVariant?.titleB ?? "");
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300/90 underline-offset-4 hover:underline"
              >
                <Copy className="size-3.5 shrink-0" aria-hidden />
                {t("results.abTestVariant.copy")}
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  {t("results.abTestVariant.titleBLabel")}
                </p>
                <p className="rounded-lg border border-zinc-700/50 bg-zinc-900/60 px-3 py-2 text-sm font-semibold text-white/95">
                  {result.abTestVariant.titleB}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  {t("results.abTestVariant.hypothesisLabel")}
                </p>
                <p className="text-sm leading-relaxed text-zinc-200/85">
                  {result.abTestVariant.hypothesis}
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                  {t("results.abTestVariant.hypothesisHint")}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-zinc-500">
              {t("results.abTestVariant.hint")}
            </p>
          </div>
        ) : null}
      </div>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:sticky lg:inset-x-auto lg:bottom-4 lg:pb-0"
        aria-label={t("results.floatingBarAria")}
      >
        <div
          className={cn(
            "pointer-events-auto flex w-full max-w-3xl flex-wrap items-stretch justify-center gap-2 rounded-2xl border border-zinc-700/90 bg-[#0B0E14]/97 px-3 py-3 shadow-[0_-12px_40px_-10px_rgba(0,0,0,0.72),0_0_0_1px_rgba(34,197,94,0.08)_inset] backdrop-blur-md sm:gap-2.5 sm:px-4 sm:py-3.5",
            isRtl && "flex-row-reverse",
          )}
        >
          <button
            type="button"
            disabled={resultsBusy}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-[0_8px_28px_-8px_rgba(34,197,94,0.5)] ring-2 ring-emerald-500/30 transition hover:bg-emerald-400 disabled:opacity-45 sm:min-w-[9.5rem] sm:flex-none"
            onClick={() => onCopyAllBlocks()}
          >
            {t("results.copyAllPrimary")}
          </button>
          {canSaveToTracker ? (
            <button
              type="button"
              disabled={trackKwBusy || resultsBusy}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/12 px-4 py-3 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/20 disabled:opacity-45 sm:min-w-[9.5rem] sm:flex-none"
              onClick={() => onTrackKeywords()}
            >
              {trackKwBusy
                ? t("results.trackKeywords.busy")
                : t("results.floatingSaveTracker")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={resultsBusy}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-900/90 px-4 py-3 text-sm font-semibold text-white/92 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-45 sm:flex-none"
            onClick={() => onExportOpen()}
          >
            {t("results.floatingExport")}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={!canRegenerate || resultsBusy}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-white/88 transition hover:border-emerald-500/35 hover:bg-emerald-500/10 disabled:opacity-45 sm:flex-none sm:min-w-[9.5rem]"
              >
                {t("results.regenerate.label")}
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[14rem] border border-white/10 bg-[#10141c] p-1 text-white shadow-xl"
            >
              <DropdownMenuItem
                className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-emerald-500/15 focus:text-white"
                onSelect={() => onRegeneratePunchier()}
              >
                {t("results.regenerate.punchier")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-emerald-500/15 focus:text-white"
                onSelect={() => onRegenerateProfessional()}
              >
                {t("results.regenerate.professional")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-emerald-500/15 focus:text-white"
                onSelect={() => onRegenerateArabic()}
              >
                {t("results.regenerate.arabic")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-emerald-500/15 focus:text-white"
                onSelect={() => onRegenerateTone()}
              >
                {t("results.regenerate.tone")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </section>
  );
}
