"use client";

import type { RefObject } from "react";
import { Minimize2 } from "lucide-react";
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
  /** Overrides in-phone text direction (e.g. localized Arabic market tab). */
  previewDir?: "ltr" | "rtl";
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
  previewDir: previewDirProp,
}: OptimizerPreviewInnerProps) {
  const t = useTranslations("optimizer");
  const previewDir = previewDirProp ?? (isRtl ? "rtl" : "ltr");

  return (
    <div className="relative mx-auto flex w-full max-w-[340px] flex-col items-center gap-4">
      {showHeader && showMinimize && onMinimize ? (
        <div
          className={cn(
            "flex w-full",
            isRtl ? "flex-row-reverse justify-start" : "justify-end",
          )}
        >
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
        </div>
      ) : null}

      <div
        ref={phoneMeasureRef}
        className={cn(
          "relative w-full origin-top overflow-visible",
          "max-lg:scale-[0.9] max-xl:scale-95",
        )}
      >
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
            keywords={result ? keywords : ""}
            featuresDraft={features}
            draftShortDescription={previewShortDesc}
            iconUrl={livePreviewIconUrl}
            previewFieldsOverride={result ? clampedListing : null}
            result={result}
            loading={loading}
            isGenerating={isGenerating}
            scanActive={scanActive}
            previewDir={previewDir}
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
