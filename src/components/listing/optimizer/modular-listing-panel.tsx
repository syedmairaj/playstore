"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Gauge,
  Layers,
  RefreshCw,
  Sparkles,
  TextQuote,
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
import { ListingHealthIndicator } from "@/components/listing/optimizer/listing-health-indicator";
import { LongDescriptionAsoEditor } from "@/components/listing/optimizer/long-description-aso-editor";
import type { LongDescriptionAiTool } from "@/components/listing/optimizer/long-description-aso-editor";
import { TextBlockDiff } from "@/components/listing/optimizer/text-block-diff";
import {
  LISTING_LONG_MAX,
  LISTING_SHORT_MAX,
  LISTING_SHORT_WARN_FROM,
  LISTING_TITLE_MAX,
  LISTING_TITLE_WARN_FROM,
} from "@/components/listing/optimizer/listing-field-limits";
import { cn } from "@/lib/utils";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";
import type { ListingHealthFixActionId } from "@/lib/listing/listing-health-fix-actions";

type Props = {
  orchestration?: OrchestrationProtocol;
  state: ModularListingState;
  loading: ModularLoadingState;
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  isRtl?: boolean;
  isDraft?: boolean;
  /** True after successful finalize — unlocks publication-ready copy. */
  isPublicationReady?: boolean;
  finalizeCreditCost?: number;
  trialRegenerationsUsed?: number;
  longUiMode?: ModularLongUiMode;
  onLongUiModeChange?: (mode: ModularLongUiMode) => void;
  previousBlocks?: Partial<Record<ModularBlockSnapshotKey, string>>;
  blockErrors?: Partial<Record<ModularBlockSnapshotKey, boolean>>;
  seedKeywords?: string[];
  listingHealth?: ListingGenerationWarningsPayload | null;
  lockedKeywords?: string[];
  onLongAiTool?: (tool: LongDescriptionAiTool) => void;
  onListingHealthFix?: (actionId: ListingHealthFixActionId) => void;
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
  isPublicationReady = false,
  finalizeCreditCost = 5,
  trialRegenerationsUsed = 0,
  longUiMode = "choice",
  onLongUiModeChange,
  previousBlocks = {},
  blockErrors = {},
  seedKeywords = [],
  listingHealth = null,
  lockedKeywords = [],
  onLongAiTool,
  onListingHealthFix,
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

  const highlightKeywords =
    lockedKeywords.length > 0 ? lockedKeywords : seedKeywords;

  const longHasBlockError = Boolean(
    blockErrors.hook || blockErrors.features || blockErrors.closing,
  );

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

  const showDraftMask = !isPublicationReady && (isDraft || Boolean(displayState.title.value.trim()));

  const blockCopy = (event: React.ClipboardEvent) => {
    if (!showDraftMask) return;
    event.preventDefault();
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-4 sm:p-5",
        isRtl && "font-arabic",
      )}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <ListingHealthIndicator
        warnings={listingHealth}
        longText={assembledLong}
        lockedKeywords={highlightKeywords}
        isRtl={isRtl}
        onFixAction={onListingHealthFix}
      />

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

      {showDraftMask ? (
        <div
          role="note"
          style={{
            borderRadius: "12px",
            border: "1px dashed rgba(245, 158, 11, 0.45)",
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            padding: "12px 14px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              lineHeight: 1.55,
              fontWeight: 600,
              color: "rgba(253, 230, 138, 0.95)",
              textAlign: isRtl ? "right" : "left",
            }}
          >
            {t("draftMask.status")}
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "11px",
              lineHeight: 1.5,
              color: "rgba(255, 255, 255, 0.55)",
              textAlign: isRtl ? "right" : "left",
            }}
          >
            {t("draftMask.copyBlocked")}
          </p>
        </div>
      ) : null}

      <div
        onCopy={blockCopy}
        onCut={blockCopy}
        style={
          showDraftMask
            ? {
                borderRadius: "14px",
                border: "1px solid rgba(245, 158, 11, 0.22)",
                backgroundColor: "rgba(0, 0, 0, 0.18)",
                padding: "12px",
                userSelect: "text",
              }
            : undefined
        }
      >
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
        onRegenerate={
          hasLongContent
            ? () => {
                onLongUiModeChange?.("ai");
                onMagicGenerateLong?.();
              }
            : undefined
        }
      >
        <LongDescriptionAsoEditor
          value={assembledLong}
          lockedKeywords={highlightKeywords}
          isRtl={isRtl}
          busy={longBusy}
          longUiMode={longUiMode}
          hasError={longHasBlockError}
          errorMessage={t("sectionGenerationFailed")}
          onChange={(next) => onLongDescriptionChange?.(next)}
          onGenerate={() => {
            onLongUiModeChange?.("ai");
            onMagicGenerateLong?.();
          }}
          onAiTool={onLongAiTool}
          onManualEdit={() => {
            onLongUiModeChange?.("manual");
            if (!assembledLong.trim()) {
              onLongDescriptionChange?.("");
            }
          }}
        />
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

      {isPublicationReady ? (
        <p
          role="status"
          style={{
            margin: 0,
            borderRadius: "10px",
            border: "1px solid rgba(52, 211, 153, 0.35)",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            padding: "10px 12px",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "rgba(167, 243, 208, 0.95)",
            textAlign: isRtl ? "right" : "left",
          }}
        >
          {t("draftMask.publicationReady")}
        </p>
      ) : null}
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
