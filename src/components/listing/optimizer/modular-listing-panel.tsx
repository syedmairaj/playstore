"use client";

import { Anchor, Layers, RefreshCw, Sparkles, TextQuote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";
import type { ModularListingBlockId, ModularListingState } from "@/lib/listing/modular-listing.types";
import type { ModularLoadingState } from "@/hooks/useModularGeneration";
import { orchestrationToModularState } from "@/lib/listing/orchestration-to-modular-state";
import { cn } from "@/lib/utils";

type Props = {
  /** Orchestration Protocol payload — drives modular layout when present. */
  orchestration?: OrchestrationProtocol;
  state: ModularListingState;
  loading: ModularLoadingState;
  /** Root listing fields synced with Play export / edited copy. */
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  isRtl?: boolean;
  isDraft?: boolean;
  onRegenerateBlock: (blockId: ModularListingBlockId) => void;
  onSelectShortVariation: (index: number, variation: string) => void;
  onTitleChange?: (value: string) => void;
  onFinalize?: () => void;
  finalizeBusy?: boolean;
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
  onRegenerateBlock,
  onSelectShortVariation,
  onTitleChange,
  onFinalize,
  finalizeBusy = false,
}: Props) {
  const t = useTranslations("optimizer.results.modular");

  const displayState = orchestration
    ? orchestrationToModularState(orchestration, {
        title: title ?? state.title.value,
        shortDescription: shortDescription ?? undefined,
        longDescription: longDescription ?? undefined,
      })
    : state;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-4 sm:p-5",
        isRtl && "font-arabic",
      )}
      dir={isRtl ? "rtl" : "ltr"}
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

      <BlockCard
        phase={t("phaseTitle")}
        title={t("titleBlock")}
        icon={<Anchor className="size-3.5 text-sky-300" aria-hidden />}
        isRtl={isRtl}
        busy={loading.title}
        onRegenerate={() => onRegenerateBlock("title")}
        regenerateLabel={t("regenerate")}
      >
        {onTitleChange ? (
          <input
            type="text"
            value={displayState.title.value}
            maxLength={30}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-black/30 px-3 py-2 text-sm text-white"
          />
        ) : (
          <p className="text-lg font-semibold text-white">{displayState.title.value}</p>
        )}
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
        title={t("shortBlock")}
        icon={<TextQuote className="size-3.5 text-sky-300" aria-hidden />}
        isRtl={isRtl}
        busy={loading.short}
        onRegenerate={() => onRegenerateBlock("short")}
        regenerateLabel={t("regenerate")}
      >
        <div className="space-y-2">
          {displayState.shortDescription.variations.map((variation, index) => (
            <button
              key={`short-var-${index}`}
              type="button"
              onClick={() => onSelectShortVariation(index, variation)}
              className={cn(
                "w-full rounded-xl border p-3 text-start transition-colors",
                displayState.shortDescription.selectedIndex === index
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-zinc-800/80 bg-black/20 hover:border-zinc-700",
                isRtl && "text-end",
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {t(`shortVariation${index + 1}` as "shortVariation1")}
              </p>
              <p className="mt-1 text-sm text-white/90">{variation}</p>
            </button>
          ))}
        </div>
      </BlockCard>

      <BlockCard
        phase={t("phaseLong")}
        title={t("longBlock")}
        icon={<Layers className="size-3.5 text-sky-300" aria-hidden />}
        isRtl={isRtl}
        busy={loading.hook || loading.features || loading.closing}
        regenerateLabel={t("regenerate")}
      >
        <LongSubBlock
          label={t("hookBlock")}
          value={displayState.longDescription.hook}
          busy={loading.hook}
          isRtl={isRtl}
          onRegenerate={() => onRegenerateBlock("hook")}
          regenerateLabel={t("regenerate")}
        />
        <LongSubBlock
          label={t("featuresBlock")}
          value={displayState.longDescription.features}
          busy={loading.features}
          isRtl={isRtl}
          onRegenerate={() => onRegenerateBlock("features")}
          regenerateLabel={t("regenerate")}
        />
        <LongSubBlock
          label={t("closingBlock")}
          value={displayState.longDescription.closing}
          busy={loading.closing}
          isRtl={isRtl}
          onRegenerate={() => onRegenerateBlock("closing")}
          regenerateLabel={t("regenerate")}
        />
      </BlockCard>

      {isDraft && onFinalize ? (
        <button
          type="button"
          disabled={finalizeBusy}
          onClick={onFinalize}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {finalizeBusy ? (
            <RefreshCw className="size-4 animate-spin" aria-hidden />
          ) : null}
          {t("finalizeCta")}
        </button>
      ) : null}
    </div>
  );
}

function BlockCard({
  phase,
  title,
  icon,
  children,
  isRtl,
  busy,
  onRegenerate,
  regenerateLabel,
}: {
  phase: string;
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
            <p className="text-sm font-medium text-white">{title}</p>
          </div>
        </div>
        {onRegenerate ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", busy && "animate-spin")} aria-hidden />
            {regenerateLabel}
          </button>
        ) : null}
      </div>
      {children}
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
}: {
  label: string;
  value: string;
  busy: boolean;
  isRtl: boolean;
  onRegenerate: () => void;
  regenerateLabel: string;
}) {
  if (!value.trim()) return null;
  return (
    <div
      className={cn(
        "mb-3 rounded-lg border border-zinc-800/60 bg-black/25 p-3 last:mb-0",
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
    </div>
  );
}
