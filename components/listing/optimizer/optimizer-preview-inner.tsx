"use client";

import type { RefObject } from "react";
import { ImagePlus, Minimize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { LivePreviewPhone } from "@/components/features/visualizer/live-preview-phone";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { cn } from "@/lib/utils";

type ListingPreviewFields = {
  title: string;
  shortDescription: string;
  fullDescription: string;
};

export type OptimizerPreviewInnerProps = {
  isRtl: boolean;
  previewConnected: boolean;
  showChangeLogoBtn: boolean;
  onOpenLogoGen: () => void;
  appName: string;
  category: string;
  keywords: string;
  features: string;
  previewShortDesc: string;
  livePreviewIconUrl: string;
  clampedListing: ListingPreviewFields;
  result: ListingGenerationOutput | null;
  loading: boolean;
  isGenerating?: boolean;
  scanActive: boolean;
  showEmptyIconAsoHint: boolean;
  logoGenTriggerDisabled: boolean;
  isStuck?: boolean;
  showMinimize?: boolean;
  onMinimize?: () => void;
  /** Tighter padding for bottom sheet on mobile. */
  compact?: boolean;
  /** When false, omits the label row (e.g. mobile sheet supplies its own header). */
  showHeader?: boolean;
  /** Attached to the scaled phone wrapper for sticky viewport checks. */
  phoneMeasureRef?: RefObject<HTMLDivElement | null>;
};

export function OptimizerPreviewInner({
  isRtl,
  previewConnected,
  showChangeLogoBtn,
  onOpenLogoGen,
  appName,
  category,
  keywords,
  features,
  previewShortDesc,
  livePreviewIconUrl,
  clampedListing,
  result,
  loading,
  isGenerating = false,
  scanActive,
  showEmptyIconAsoHint,
  logoGenTriggerDisabled,
  isStuck = false,
  showMinimize = false,
  onMinimize,
  compact = false,
  showHeader = true,
  phoneMeasureRef,
}: OptimizerPreviewInnerProps) {
  const t = useTranslations("optimizer");

  return (
    <div className="relative mx-auto flex w-full max-w-[340px] flex-col items-center gap-4">
      {showHeader ? (
        <div
          className={cn(
            "flex w-full items-center justify-between gap-3",
            isRtl && "flex-row-reverse",
          )}
        >
          <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400/85">
            {t("preview.label")}
          </p>
          {showMinimize && onMinimize ? (
            <button
              type="button"
              onClick={onMinimize}
              aria-label={t("preview.minimizeAria")}
              title={t("preview.minimizePreview")}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-white/70",
                "transition-[color,background-color,border-color] duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white/90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34A853]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080f0d]",
              )}
            >
              <Minimize2 className="size-3.5 opacity-80" aria-hidden />
              <span className="hidden sm:inline">{t("preview.minimizePreview")}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={phoneMeasureRef}
        className={cn(
          "relative w-full origin-top overflow-visible",
          "max-lg:scale-[0.9] max-xl:scale-95",
        )}
      >
        {showChangeLogoBtn ? (
          <button
            type="button"
            onClick={onOpenLogoGen}
            aria-label={t("preview.clickToChangeLogo")}
            title={t("preview.clickToChangeLogo")}
            className={cn(
              "absolute end-2 top-2 z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#22C55E]/38 bg-[#22C55E]/14 text-[#d1fae5] shadow-[0_4px_14px_-6px_rgba(34,197,94,0.35)] backdrop-blur-sm",
              "transition-[transform,box-shadow,border-color,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-[#22C55E]/55 motion-safe:hover:bg-[#22C55E]/22 motion-safe:hover:shadow-[0_8px_22px_-8px_rgba(34,197,94,0.45)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080f0d]",
            )}
          >
            <ImagePlus className="size-3.5 shrink-0 opacity-95" aria-hidden />
          </button>
        ) : null}
        <div
          className={cn(
            "w-full rounded-2xl border bg-gradient-to-b from-[#0a1210]/96 via-[#080f0d] to-[#050807] backdrop-blur-md transition-[box-shadow,border-color,ring-color] duration-300",
            compact ? "p-4" : "p-5 sm:p-6",
            previewConnected
              ? "border-[#34A853]/30 ring-1 ring-[#34A853]/20"
              : "border-zinc-800 ring-1 ring-zinc-800/80",
            isStuck
              ? "shadow-[0_8px_40px_-12px_rgba(52,168,83,0.35),0_12px_36px_-18px_rgba(0,0,0,0.42)] ring-[#34A853]/30"
              : "shadow-[0_8px_28px_-16px_rgba(0,0,0,0.42),inset_0_1px_0_0_rgba(34,197,94,0.06)]",
            previewConnected &&
              !isStuck &&
              "shadow-[0_12px_36px_-18px_rgba(34,197,94,0.16)]",
          )}
        >
          <LivePreviewPhone
            appName={appName}
            category={category}
            keywords={keywords}
            featuresDraft={features}
            draftShortDescription={previewShortDesc}
            iconUrl={livePreviewIconUrl}
            previewFieldsOverride={result ? clampedListing : null}
            result={result}
            loading={loading}
            isGenerating={isGenerating}
            scanActive={scanActive}
            previewDir={isRtl ? "rtl" : "ltr"}
            showEmptyIconAsoHint={showEmptyIconAsoHint}
            onLogoSquircleClick={
              !logoGenTriggerDisabled ? onOpenLogoGen : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
