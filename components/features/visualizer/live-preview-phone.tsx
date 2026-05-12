"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { useTypingPreview } from "@/hooks/use-typing-preview";
import {
  PIXEL_MOCK_LASER_BOTTOM,
  PixelPhoneFrame,
} from "@/components/ui/pixel-phone-frame";
import { cn } from "@/lib/utils";

export type PreviewMode = "aso" | "ad" | "push";

type LivePreviewPhoneProps = {
  appName: string;
  category: string;
  keywords: string;
  result: ListingGenerationOutput | null;
  loading: boolean;
  /** When true, newly applied result text animates in the screen. */
  typingEnabled?: boolean;
  /** Use `"hero"` on the marketing landing page; defaults to optimizer copy. */
  translationNamespace?: "optimizer" | "hero";
  /** When set, controls the laser scan only; defaults to `loading`. */
  scanActive?: boolean;
  /** Controlled preview tab (e.g. Growth Hub). Omit for internal tab state. */
  mode?: PreviewMode;
  onModeChange?: (mode: PreviewMode) => void;
};

const MODES: PreviewMode[] = ["aso", "ad", "push"];

function LaserScan({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 overflow-hidden",
        PIXEL_MOCK_LASER_BOTTOM,
      )}
      aria-hidden
    >
      <div className="laser-scan-line absolute left-2 right-2 top-0 h-0.5 bg-[#22C55E] shadow-[0_0_12px_2px_rgba(34,197,94,0.45)]" />
    </div>
  );
}

export function LivePreviewPhone({
  appName,
  category,
  keywords,
  result,
  loading,
  typingEnabled = true,
  translationNamespace = "optimizer",
  scanActive,
  mode: controlledMode,
  onModeChange,
}: LivePreviewPhoneProps) {
  const t = useTranslations(translationNamespace);
  const laserOn = scanActive ?? loading;
  const [internalMode, setInternalMode] = useState<PreviewMode>("aso");
  const mode = controlledMode ?? internalMode;

  const setMode = (m: PreviewMode) => {
    onModeChange?.(m);
    if (controlledMode === undefined) {
      setInternalMode(m);
    }
  };

  const [installPressed, setInstallPressed] = useState(false);
  const [readMore, setReadMore] = useState(false);
  const [pushExpanded, setPushExpanded] = useState(false);

  useEffect(() => {
    setReadMore(false);
    setPushExpanded(false);
  }, [mode]);

  const targetFields = useMemo(() => {
    if (!result) return null;
    return {
      title: result.title,
      shortDescription: result.shortDescription,
      fullDescription: result.fullDescription,
    };
  }, [result]);

  const typed = useTypingPreview(
    targetFields,
    Boolean(result && typingEnabled && !loading),
  );

  const title =
    result && !loading ? typed.title : appName.trim() || t("preview.placeholderTitle");
  const shortDesc =
    result && !loading
      ? typed.shortDescription
      : t("preview.placeholderShort");
  const fullDesc =
    result && !loading ? typed.fullDescription : t("preview.placeholderFull");

  const headlineAd =
    (result?.title ?? appName.trim()) || t("preview.adHeadline");
  const bodyAd =
    result?.shortDescription ?? t("preview.adBody");
  const ctaAd =
    result?.ctaSuggestions?.[0] ?? t("preview.adCta");

  const pushTitle =
    (result?.title ?? appName.trim()) || t("preview.pushTitle");
  const pushBody =
    result?.shortDescription ?? t("preview.pushBody");

  return (
    <div className="flex w-full max-w-[320px] flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wider text-white/50">
          {t("preview.label")}
        </p>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
          {t("preview.interactive")}
        </span>
      </div>

      <PixelPhoneFrame>
        <div
          role="tablist"
          aria-label={t("preview.modeTabsAria")}
          className="flex gap-0.5 border-b border-white/[0.06] bg-black/30 p-1.5"
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
              }}
              className={cn(
                "min-h-[36px] flex-1 rounded-xl px-2 py-1.5 text-center text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/60",
                mode === m
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/45 hover:bg-white/[0.04] hover:text-white/70",
              )}
            >
              {t(`preview.modes.${m}`)}
            </button>
          ))}
        </div>

        <div className="relative bg-[#0B0E14]">
          <div className="relative h-[420px]">
            <LaserScan active={laserOn} />

            <div className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
              {mode === "aso" && (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4285F4]/30 to-[#22C55E]/40 ring-1 ring-white/10" />
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-white">
                        {title}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[#22C55E]">
                        {category || "App"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {keywords
                          .split(/[,;\s]+/)
                          .filter(Boolean)
                          .slice(0, 4)
                          .map((k) => (
                            <span
                              key={k}
                              className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/55"
                            >
                              {k}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onPointerDown={() => setInstallPressed(true)}
                    onPointerUp={() => setInstallPressed(false)}
                    onPointerLeave={() => setInstallPressed(false)}
                    className={cn(
                      "w-full rounded-full bg-[#22C55E] py-2.5 text-sm font-bold text-white shadow-md transition-transform active:scale-[0.98]",
                      installPressed && "scale-[0.97]",
                    )}
                  >
                    {t("preview.install")}
                  </button>

                  <p className="text-[12px] leading-relaxed text-white/75">
                    {shortDesc}
                  </p>

                  <div>
                    <button
                      type="button"
                      onClick={() => setReadMore((v) => !v)}
                      className="text-[12px] font-medium text-[#4285F4] hover:underline"
                    >
                      {readMore ? t("preview.readLess") : t("preview.readMore")}
                    </button>
                    {readMore && (
                      <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-white/60">
                        {fullDesc}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {mode === "ad" && (
                <div className="pt-2">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 backdrop-blur-md">
                    <div className="mb-2 flex items-center gap-2 text-[10px] text-white/40">
                      <span className="font-medium text-white/55">
                        {t("preview.adSponsored")}
                      </span>
                    </div>
                    <p className="text-[14px] font-bold leading-snug text-white">
                      {headlineAd}
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-white/70">
                      {bodyAd}
                    </p>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg bg-[#4285F4] py-2 text-center text-[12px] font-semibold text-white active:scale-[0.99]"
                    >
                      {ctaAd}
                    </button>
                  </div>
                </div>
              )}

              {mode === "push" && (
                <div className="flex min-h-full flex-col items-center bg-gradient-to-b from-[#1a1d24] to-[#0B0E14] px-2 pt-6">
                  <p className="mb-8 text-5xl font-extralight tracking-tight text-white/90">
                    9:41
                  </p>
                  <button
                    type="button"
                    onClick={() => setPushExpanded((v) => !v)}
                    className={cn(
                      "w-full rounded-2xl border border-white/[0.08] bg-white/[0.08] p-3 text-left shadow-lg backdrop-blur-md transition-all",
                      pushExpanded && "ring-2 ring-[#22C55E]/40",
                    )}
                  >
                    <div className="flex gap-2">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-[#4285F4]/40 to-[#22C55E]/50" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-white">
                          {pushTitle}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 text-[11px] text-white/65",
                            !pushExpanded && "line-clamp-2",
                          )}
                        >
                          {pushBody}
                        </p>
                      </div>
                    </div>
                    {pushExpanded && (
                      <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/45">
                        {t("preview.pushHint")}
                      </p>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </PixelPhoneFrame>
    </div>
  );
}
