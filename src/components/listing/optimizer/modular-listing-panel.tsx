"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Gauge,
  Layers,
  PencilLine,
  RefreshCw,
  Sparkles,
  TextQuote,
  Wand2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";
import type {
  ModularBlockSnapshotKey,
  ModularListingBlockId,
  ModularListingState,
  ModularLongUiMode,
} from "@/lib/listing/modular-listing.types";
import {
  shortVariationText,
  type ShortVariationType,
} from "@/lib/listing/modular-short-variations";
import { MODULAR_TRIAL_REGENERATIONS_LIMIT } from "@/lib/features/billing/modular-regenerate-billing";
import { assembleModularFullDescription } from "@/lib/listing/assemble-modular-listing";
import { computeModularAsoStrengthScore } from "@/lib/listing/modular-aso-strength";
import type { ModularLoadingState } from "@/hooks/useModularGeneration";
import { orchestrationToModularState } from "@/lib/listing/orchestration-to-modular-state";
import { ListingCharCounter } from "@/components/listing/optimizer/listing-char-counter";
import { TextBlockDiff } from "@/components/listing/optimizer/text-block-diff";
import {
  LISTING_LONG_MAX,
  LISTING_LONG_WARN_FROM,
  LISTING_SHORT_MAX,
  LISTING_SHORT_WARN_FROM,
  LISTING_TITLE_MAX,
  LISTING_TITLE_WARN_FROM,
} from "@/components/listing/optimizer/listing-field-limits";
import { cn } from "@/lib/utils";

type Props = {
  orchestration?: OrchestrationProtocol;
  state: ModularListingState;
  loading: ModularLoadingState;
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  isRtl?: boolean;
  isDraft?: boolean;
  finalizeCreditCost?: number;
  trialRegenerationsUsed?: number;
  longUiMode?: ModularLongUiMode;
  onLongUiModeChange?: (mode: ModularLongUiMode) => void;
  previousBlocks?: Partial<Record<ModularBlockSnapshotKey, string>>;
  blockErrors?: Partial<Record<ModularBlockSnapshotKey, boolean>>;
  seedKeywords?: string[];
  onRegenerateBlock: (blockId: ModularListingBlockId) => void;
  onSelectShortVariation: (index: number, variation: import("@/lib/listing/modular-short-variations").ShortVariationItem) => void;
  onTitleChange?: (value: string) => void;
  onLongDescriptionChange?: (value: string) => void;
  onMagicGenerateLong?: () => void;
  onFinalize?: () => void;
  finalizeBusy?: boolean;
};

const SHORT_TYPE_LABEL_KEY: Record<
  ShortVariationType,
  "shortVariation1" | "shortVariation2" | "shortVariation3"
> = {
  growth: "shortVariation1",
  conversion: "shortVariation2",
  utility: "shortVariation3",
};

const SHORT_TYPE_HINT_KEY: Record<
  ShortVariationType,
  "shortVariation1Hint" | "shortVariation2Hint" | "shortVariation3Hint"
> = {
  growth: "shortVariation1Hint",
  conversion: "shortVariation2Hint",
  utility: "shortVariation3Hint",
};

export function ModularListingPanel({
  orchestration,
  state,
  loading,
  title,
  shortDescription,
  longDescription,
  isRtl = false,
  isDraft = false,
  finalizeCreditCost = 5,
  trialRegenerationsUsed = 0,
  longUiMode = "choice",
  onLongUiModeChange,
  previousBlocks = {},
  blockErrors = {},
  seedKeywords = [],
  onRegenerateBlock,
  onSelectShortVariation,
  onTitleChange,
  onLongDescriptionChange,
  onMagicGenerateLong,
  onFinalize,
  finalizeBusy = false,
}: Props) {
  const t = useTranslations("optimizer.results.modular");
  const [compareOpen, setCompareOpen] = useState<Partial<Record<string, boolean>>>({});

  const displayState = orchestration
    ? orchestrationToModularState(orchestration, {
        title: title ?? state.title.value,
        shortDescription: shortDescription ?? undefined,
        longDescription: longDescription ?? undefined,
      })
    : state;

  const assembledLong = useMemo(() => {
    const fromState = assembleModularFullDescription(displayState.longDescription);
    return (longDescription?.trim() || fromState).slice(0, LISTING_LONG_MAX);
  }, [displayState.longDescription, longDescription]);

  const hasLongContent = assembledLong.trim().length > 0;

  useEffect(() => {
    if (hasLongContent && longUiMode === "choice") {
      onLongUiModeChange?.("ai");
    }
  }, [hasLongContent, longUiMode, onLongUiModeChange]);

  const showStrategicChoice =
    longUiMode === "choice" &&
    !hasLongContent &&
    !loading.hook &&
    !loading.features &&
    !loading.closing;

  const longBusy = loading.hook || loading.features || loading.closing;

  const trialLeft = Math.max(
    0,
    MODULAR_TRIAL_REGENERATIONS_LIMIT - trialRegenerationsUsed,
  );
  const regenerateLabel =
    trialRegenerationsUsed < MODULAR_TRIAL_REGENERATIONS_LIMIT
      ? t("regenerateFreeTrial", { left: trialLeft })
      : t("regenerateCredit", { credits: 1 });

  const asoStrength = useMemo(
    () => computeModularAsoStrengthScore(displayState, seedKeywords),
    [displayState, seedKeywords],
  );

  const toggleCompare = (key: string) => {
    setCompareOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-4 sm:p-5",
        isRtl && "font-arabic",
      )}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3",
          isRtl && "flex-row-reverse",
        )}
      >
        <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
          <Sparkles className="size-4 shrink-0 text-sky-300" aria-hidden />
          <div className={cn("min-w-0", isRtl && "text-end")}>
          <p className="text-sm font-semibold text-white">{t("heading")}</p>
          <p className="text-xs text-white/50">
            {orchestration
              ? t("orchestrationSubheading")
              : isDraft
                ? t("draftSubheading")
                : t("subheading")}
          </p>
        </div>
        </div>
        <AsoStrengthBadge
          score={asoStrength.score}
          label={t("asoStrengthScore")}
          hint={t("asoStrengthHint")}
          isRtl={isRtl}
        />
      </div>

      <BlockCard
        phase={t("phaseTitle")}
        phaseLabel={t("phase1Label")}
        phaseHelper={t("phase1Helper")}
        title={t("titleBlock")}
        icon={<Anchor className="size-3.5 text-sky-300" aria-hidden />}
        isRtl={isRtl}
        busy={loading.title}
        onRegenerate={() => onRegenerateBlock("title")}
        regenerateLabel={regenerateLabel}
      >
        {blockErrors.title && !displayState.title.value.trim() && !loading.title ? (
          <SectionErrorState message={t("sectionGenerationFailed")} isRtl={isRtl} />
        ) : onTitleChange ? (
          <input
            type="text"
            value={displayState.title.value}
            maxLength={LISTING_TITLE_MAX}
            onChange={(e) => onTitleChange(e.target.value)}
            aria-describedby="modular-title-count"
            className="w-full rounded-lg border border-zinc-700 bg-black/30 px-3 py-2 text-sm text-white"
          />
        ) : (
          <p className="text-lg font-semibold text-white">{displayState.title.value}</p>
        )}
        <BlockCompareLink
          compareKey="title"
          previous={previousBlocks.title}
          current={displayState.title.value}
          isOpen={Boolean(compareOpen.title)}
          onToggle={() => toggleCompare("title")}
          compareLabel={t("compareWithPrevious")}
          hideLabel={t("hideComparison")}
          isRtl={isRtl}
        />
        <div className={cn("mt-2 flex", isRtl ? "justify-end" : "justify-start")}>
          <ListingCharCounter
            id="modular-title-count"
            current={displayState.title.value.length}
            max={LISTING_TITLE_MAX}
            warnFrom={LISTING_TITLE_WARN_FROM}
          />
        </div>
        {displayState.title.locked ? (
          <p className="mt-2 text-[11px] text-emerald-300/80">{t("titleLocked")}</p>
        ) : null}
        {orchestration ? (
          <p className="mt-1 text-xs text-violet-200/70">
            {t("keywordAnchor")}: {orchestration.modules.anchor.keywordAnchor}
          </p>
        ) : null}
      </BlockCard>

      <BlockCard
        phase={t("phaseShort")}
        phaseLabel={t("phase2Label")}
        phaseHelper={t("phase2Helper")}
        title={t("shortBlock")}
        icon={<TextQuote className="size-3.5 text-sky-300" aria-hidden />}
        isRtl={isRtl}
        busy={loading.short}
        onRegenerate={() => onRegenerateBlock("short")}
        regenerateLabel={regenerateLabel}
      >
        {blockErrors.short &&
        !displayState.shortDescription.variations.some((v) => v.text.trim()) &&
        !loading.short ? (
          <SectionErrorState message={t("sectionGenerationFailed")} isRtl={isRtl} />
        ) : (
        <div className="space-y-2">
          {displayState.shortDescription.variations.map((variation, index) => (
            <div key={`short-var-${variation.type}-${index}`}>
            <button
              type="button"
              onClick={() => onSelectShortVariation(index, variation)}
              className={cn(
                "w-full rounded-xl border p-3 text-start transition-colors",
                displayState.shortDescription.selectedIndex === index
                  ? "border-emerald-400 bg-emerald-500/15 shadow-[0_0_0_1px_rgba(52,211,153,0.55),0_0_24px_-6px_rgba(52,211,153,0.45)] ring-2 ring-emerald-400/70"
                  : "border-zinc-800/80 bg-black/20 hover:border-zinc-700",
                isRtl && "text-end",
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
                {t(SHORT_TYPE_LABEL_KEY[variation.type])}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                {t(SHORT_TYPE_HINT_KEY[variation.type])}
              </p>
              <p className="mt-2 text-sm text-white/90">{variation.text}</p>
              <div className={cn("mt-2 flex", isRtl ? "justify-end" : "justify-start")}>
                <ListingCharCounter
                  current={variation.text.length}
                  max={LISTING_SHORT_MAX}
                  warnFrom={LISTING_SHORT_WARN_FROM}
                />
              </div>
            </button>
            <BlockCompareLink
              compareKey={`short-${index}`}
              previous={previousBlocks[`short-${index}` as ModularBlockSnapshotKey]}
              current={variation.text}
              isOpen={Boolean(compareOpen[`short-${index}`])}
              onToggle={() => toggleCompare(`short-${index}`)}
              compareLabel={t("compareWithPrevious")}
              hideLabel={t("hideComparison")}
              isRtl={isRtl}
            />
            </div>
          ))}
        </div>
        )}
      </BlockCard>

      <BlockCard
        phase={t("phaseLong")}
        phaseLabel={t("phase3Label")}
        phaseHelper={t("phase3Helper")}
        title={t("longBlock")}
        icon={<Layers className="size-3.5 text-sky-300" aria-hidden />}
        isRtl={isRtl}
        busy={longBusy}
        regenerateLabel={regenerateLabel}
      >
        {showStrategicChoice ? (
          <StrategicChoiceBlock
            isRtl={isRtl}
            busy={longBusy}
            onMagicGenerate={() => {
              onLongUiModeChange?.("ai");
              onMagicGenerateLong?.();
            }}
            onManualEntry={() => {
              onLongUiModeChange?.("manual");
              onLongDescriptionChange?.("");
            }}
          />
        ) : (
          <div className="space-y-4">
            {longUiMode === "manual" ? (
              <button
                type="button"
                onClick={() => onLongUiModeChange?.("choice")}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-500/20"
              >
                <Wand2 className="size-3.5" aria-hidden />
                {t("reEnableAi")}
              </button>
            ) : null}

            {longUiMode === "ai" &&
            hasLongContent &&
            (displayState.longDescription.hook.trim() ||
              displayState.longDescription.features.trim() ||
              displayState.longDescription.closing.trim()) ? (
              <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-black/20 p-3">
                <p className="text-[11px] font-medium text-zinc-400">{t("aiBlocksLabel")}</p>
                <LongSubBlock
                  label={t("hookBlock")}
                  value={displayState.longDescription.hook}
                  busy={loading.hook}
                  isRtl={isRtl}
                  onRegenerate={() => onRegenerateBlock("hook")}
                  regenerateLabel={regenerateLabel}
                  hasError={Boolean(blockErrors.hook)}
                  errorMessage={t("sectionGenerationFailed")}
                  previous={previousBlocks.hook}
                  compareOpen={Boolean(compareOpen.hook)}
                  onToggleCompare={() => toggleCompare("hook")}
                  compareLabel={t("compareWithPrevious")}
                  hideCompareLabel={t("hideComparison")}
                />
                <LongSubBlock
                  label={t("featuresBlock")}
                  value={displayState.longDescription.features}
                  busy={loading.features}
                  isRtl={isRtl}
                  onRegenerate={() => onRegenerateBlock("features")}
                  regenerateLabel={regenerateLabel}
                  hasError={Boolean(blockErrors.features)}
                  errorMessage={t("sectionGenerationFailed")}
                  previous={previousBlocks.features}
                  compareOpen={Boolean(compareOpen.features)}
                  onToggleCompare={() => toggleCompare("features")}
                  compareLabel={t("compareWithPrevious")}
                  hideCompareLabel={t("hideComparison")}
                />
                <LongSubBlock
                  label={t("closingBlock")}
                  value={displayState.longDescription.closing}
                  busy={loading.closing}
                  isRtl={isRtl}
                  onRegenerate={() => onRegenerateBlock("closing")}
                  regenerateLabel={regenerateLabel}
                  hasError={Boolean(blockErrors.closing)}
                  errorMessage={t("sectionGenerationFailed")}
                  previous={previousBlocks.closing}
                  compareOpen={Boolean(compareOpen.closing)}
                  onToggleCompare={() => toggleCompare("closing")}
                  compareLabel={t("compareWithPrevious")}
                  hideCompareLabel={t("hideComparison")}
                />
              </div>
            ) : null}

            {(longUiMode === "manual" || longUiMode === "ai" || hasLongContent) ? (
              <div>
                <label
                  htmlFor="modular-long-description"
                  className="mb-2 block text-[11px] font-medium text-zinc-400"
                >
                  {t("longEditorLabel")}
                </label>
                <textarea
                  id="modular-long-description"
                  rows={12}
                  maxLength={LISTING_LONG_MAX}
                  value={assembledLong}
                  disabled={longBusy}
                  onChange={(e) => onLongDescriptionChange?.(e.target.value)}
                  aria-describedby="modular-long-count"
                  className={cn(
                    "w-full resize-y rounded-lg border border-zinc-700 bg-black/30 px-3 py-2 text-sm leading-relaxed text-white",
                    isRtl && "text-end",
                  )}
                />
                <div className={cn("mt-2 flex", isRtl ? "justify-end" : "justify-start")}>
                  <ListingCharCounter
                    id="modular-long-count"
                    current={assembledLong.length}
                    max={LISTING_LONG_MAX}
                    warnFrom={LISTING_LONG_WARN_FROM}
                  />
                </div>
              </div>
            ) : null}

            {longBusy ? (
              <p className="flex items-center gap-2 text-xs text-sky-200/80" role="status">
                <RefreshCw className="size-3.5 animate-spin" aria-hidden />
                {t("longGenerating")}
              </p>
            ) : null}

            {!longBusy &&
            (blockErrors.hook || blockErrors.features || blockErrors.closing) &&
            !hasLongContent ? (
              <SectionErrorState message={t("sectionGenerationFailed")} isRtl={isRtl} />
            ) : null}
          </div>
        )}
      </BlockCard>

      {isDraft && onFinalize ? (
        <button
          type="button"
          disabled={finalizeBusy || !hasLongContent}
          onClick={onFinalize}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {finalizeBusy ? (
            <RefreshCw className="size-4 animate-spin" aria-hidden />
          ) : null}
          {t("finalizeCta", { credits: finalizeCreditCost })}
        </button>
      ) : null}
    </div>
  );
}

function StrategicChoiceBlock({
  isRtl,
  busy,
  onMagicGenerate,
  onManualEntry,
}: {
  isRtl: boolean;
  busy: boolean;
  onMagicGenerate: () => void;
  onManualEntry: () => void;
}) {
  const t = useTranslations("optimizer.results.modular");

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-sky-500/30 bg-sky-500/[0.06] p-4 sm:p-5",
        isRtl && "text-end",
      )}
    >
      <p className="text-sm font-semibold text-white">{t("strategicChoiceTitle")}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/55">{t("strategicChoiceBody")}</p>
      <div
        className={cn(
          "mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap",
          isRtl && "sm:flex-row-reverse",
        )}
      >
        <button
          type="button"
          disabled={busy}
          onClick={onMagicGenerate}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 sm:min-w-[10rem]"
        >
          <Wand2 className="size-4 shrink-0" aria-hidden />
          {t("magicGenerateCta")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onManualEntry}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-zinc-800 disabled:opacity-50 sm:min-w-[10rem]"
        >
          <PencilLine className="size-4 shrink-0" aria-hidden />
          {t("manualEntryCta")}
        </button>
      </div>
    </div>
  );
}

function BlockCard({
  phase,
  phaseLabel,
  phaseHelper,
  title,
  icon,
  children,
  isRtl,
  busy,
  onRegenerate,
  regenerateLabel,
}: {
  phase: string;
  phaseLabel: string;
  phaseHelper: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isRtl: boolean;
  busy: boolean;
  onRegenerate?: () => void;
  regenerateLabel: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4">
      <div
        className={cn(
          "mb-3 flex flex-wrap items-center justify-between gap-2",
          isRtl && "flex-row-reverse",
        )}
      >
        <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
          {icon}
          <div className={isRtl ? "text-end" : undefined}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">
              {phase}
            </p>
            <p className="text-xs font-medium text-sky-100/90">{phaseLabel}</p>
            <p className="text-sm font-medium text-white">{title}</p>
          </div>
        </div>
        {onRegenerate ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRegenerate}
            title={regenerateLabel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", busy && "animate-spin")} aria-hidden />
            {regenerateLabel}
          </button>
        ) : null}
      </div>
      <p
        className={cn(
          "mb-3 text-[11px] leading-relaxed text-white/45",
          isRtl && "text-end",
        )}
      >
        {phaseHelper}
      </p>
      {children}
    </div>
  );
}

function AsoStrengthBadge({
  score,
  label,
  hint,
  isRtl,
}: {
  score: number;
  label: string;
  hint: string;
  isRtl: boolean;
}) {
  const tone =
    score >= 75
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
      : score >= 45
        ? "border-amber-400/35 bg-amber-500/10 text-amber-100"
        : "border-zinc-600 bg-zinc-900/80 text-white/70";

  return (
    <div
      className={cn(
        "flex min-w-[9.5rem] items-center gap-2 rounded-xl border px-3 py-2",
        tone,
        isRtl && "flex-row-reverse text-end",
      )}
      title={hint}
    >
      <Gauge className="size-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide opacity-75">{label}</p>
        <p className="text-lg font-bold leading-none">{score}</p>
      </div>
    </div>
  );
}

function SectionErrorState({
  message,
  isRtl,
}: {
  message: string;
  isRtl: boolean;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-100/95",
        isRtl && "text-end",
      )}
    >
      {message}
    </p>
  );
}

function BlockCompareLink({
  previous,
  current,
  isOpen,
  onToggle,
  compareLabel,
  hideLabel,
  isRtl,
}: {
  compareKey?: string;
  previous?: string;
  current: string;
  isOpen: boolean;
  onToggle: () => void;
  compareLabel: string;
  hideLabel: string;
  isRtl: boolean;
}) {
  if (!previous?.trim() || previous.trim() === current.trim()) return null;

  return (
    <div className={cn("mt-2 space-y-2", isRtl && "text-end")}>
      <button
        type="button"
        onClick={onToggle}
        className="text-[11px] font-medium text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
      >
        {isOpen ? hideLabel : compareLabel}
      </button>
      {isOpen ? <TextBlockDiff previous={previous} current={current} isRtl={isRtl} /> : null}
    </div>
  );
}

function LongSubBlock({
  label,
  value,
  busy,
  isRtl,
  onRegenerate,
  regenerateLabel,
  hasError = false,
  errorMessage,
  previous,
  compareOpen = false,
  onToggleCompare,
  compareLabel,
  hideCompareLabel,
}: {
  label: string;
  value: string;
  busy: boolean;
  isRtl: boolean;
  onRegenerate: () => void;
  regenerateLabel: string;
  hasError?: boolean;
  errorMessage?: string;
  previous?: string;
  compareOpen?: boolean;
  onToggleCompare?: () => void;
  compareLabel?: string;
  hideCompareLabel?: string;
}) {
  if (!value.trim()) {
    if (hasError && !busy && errorMessage) {
      return (
        <div className={cn("rounded-lg border border-zinc-800/60 bg-black/25 p-3", isRtl && "text-end")}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <SectionErrorState message={errorMessage} isRtl={isRtl} />
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800/60 bg-black/25 p-3",
        isRtl && "text-end",
      )}
    >
      <div
        className={cn(
          "mb-2 flex items-center justify-between gap-2",
          isRtl && "flex-row-reverse",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300 hover:text-sky-200 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", busy && "animate-spin")} aria-hidden />
          {regenerateLabel}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{value}</p>
      {previous?.trim() && previous.trim() !== value.trim() && onToggleCompare ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={onToggleCompare}
            className="text-[11px] font-medium text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
          >
            {compareOpen ? hideCompareLabel : compareLabel}
          </button>
          {compareOpen ? (
            <div className="mt-2">
              <TextBlockDiff previous={previous} current={value} isRtl={isRtl} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
