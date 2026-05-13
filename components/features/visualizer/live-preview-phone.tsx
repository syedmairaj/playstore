"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { useTypingPreview } from "@/hooks/use-typing-preview";
import {
  PIXEL_MOCK_LASER_BOTTOM,
  PixelPhoneFrame,
} from "@/components/ui/pixel-phone-frame";
import { cn } from "@/lib/utils";

export type PreviewMode = "aso" | "ad" | "push";

type ListingPreviewFields = {
  title: string;
  shortDescription: string;
  fullDescription: string;
};

type LivePreviewPhoneProps = {
  appName: string;
  category: string;
  keywords: string;
  /** Long-description–oriented draft (form "features") when `result` is not yet available. */
  featuresDraft?: string;
  /** When set (no `result`), overrides short-description line in ASO / ad / push previews. */
  draftShortDescription?: string;
  /**
   * When `result` exists, overrides the three listing strings in the phone only (e.g. live edits).
   * Typing animation is skipped while any field differs from `result`.
   */
  previewFieldsOverride?: ListingPreviewFields | null;
  /** Play-style app icon in previews when reachable (https URL). */
  iconUrl?: string;
  result: ListingGenerationOutput | null;
  loading: boolean;
  /** When true, newly applied result text animates in the screen. */
  typingEnabled?: boolean;
  /** Use `"hero"` on the marketing landing page; defaults to optimizer copy. */
  translationNamespace?: "optimizer" | "hero";
  /** When set, controls the laser scan only; defaults to `loading`. */
  scanActive?: boolean;
  /** One line under the preview label (e.g. Growth Hub context per tab). */
  contextEyebrow?: string;
  /** Short laser pulse when the in-phone preview tab changes. */
  pulseScanOnModeChange?: boolean;
  /** Controlled preview tab (e.g. Growth Hub). Omit for internal tab state. */
  mode?: PreviewMode;
  onModeChange?: (mode: PreviewMode) => void;
  /** Route locale direction for mirrored ASO / push layout (Listing Optimizer). */
  previewDir?: "ltr" | "rtl";
  /** When true and ASO tab has no icon, show a subtle “add logo” hint on the preview squircle. */
  showEmptyIconAsoHint?: boolean;
  /** When set, the ASO squircle (and hint) opens the logo flow — native tooltip + SR label via `preview.clickToChangeLogo`. */
  onLogoSquircleClick?: () => void;
};

const MODES: PreviewMode[] = ["aso", "ad", "push"];

function safePreviewIconUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return t;
  } catch {
    return "";
  }
}

function draftShortFromFeatures(features: string): string {
  const t = features.trim();
  if (!t) return "";
  const firstBlock = t.split(/\n\s*\n/)[0]?.trim() ?? t;
  const firstLine = firstBlock.split(/\n/)[0]?.trim() ?? firstBlock;
  if (firstLine.length <= 140) return firstLine;
  return `${firstLine.slice(0, 137)}…`;
}

function formatStatusClock(routeLocale: string): string {
  const localeTag =
    routeLocale === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(localeTag, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

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
      <div className="laser-scan-line absolute start-2 end-2 top-0 h-0.5 bg-[#22C55E] shadow-[0_0_12px_2px_rgba(34,197,94,0.45)]" />
    </div>
  );
}

/** Play-style squircle (22% radius) with a short fade/zoom when the asset changes. */
function PreviewSquircleMark({
  iconSrc,
  size,
}: {
  iconSrc: string;
  size: "listing" | "push";
}) {
  const frame = size === "listing" ? "h-14 w-14" : "h-9 w-9";
  const squircleStyle = { borderRadius: "22%" } as const;
  const shell = cn(
    "shrink-0 overflow-hidden [border-radius:22%]",
    "transition-[opacity,transform] duration-200 ease-out",
    frame,
  );

  if (iconSrc) {
    return (
      <div
        key={iconSrc}
        className={cn(
          shell,
          "min-h-0 bg-black/25 ring-1 ring-white/10",
          "animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:transform-none",
        )}
        style={squircleStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconSrc}
          alt=""
          className="h-full w-full min-h-0 min-w-0 max-h-full object-cover [image-rendering:auto]"
        />
      </div>
    );
  }

  return (
    <div
      key={`placeholder-${size}`}
      className={cn(
        shell,
        size === "listing"
          ? "bg-gradient-to-br from-[#4285F4]/30 to-[#22C55E]/40 ring-1 ring-white/10"
          : "bg-gradient-to-br from-[#4285F4]/40 to-[#22C55E]/50",
      )}
      style={squircleStyle}
    />
  );
}

export function LivePreviewPhone({
  appName,
  category,
  keywords,
  featuresDraft = "",
  draftShortDescription = "",
  previewFieldsOverride = null,
  iconUrl = "",
  result,
  loading,
  typingEnabled = true,
  translationNamespace = "optimizer",
  scanActive,
  contextEyebrow,
  pulseScanOnModeChange = false,
  mode: controlledMode,
  onModeChange,
  previewDir = "ltr",
  showEmptyIconAsoHint = false,
  onLogoSquircleClick,
}: LivePreviewPhoneProps) {
  const t = useTranslations(translationNamespace);
  const intlLocale = useLocale();
  const [statusTime, setStatusTime] = useState(() =>
    formatStatusClock(intlLocale),
  );
  const [internalMode, setInternalMode] = useState<PreviewMode>("aso");
  const mode = controlledMode ?? internalMode;

  const [pulse, setPulse] = useState(false);
  const prevModeRef = useRef<PreviewMode | null>(null);
  const [readMore, setReadMore] = useState(false);
  const [pushExpanded, setPushExpanded] = useState(false);

  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (!pulseScanOnModeChange) return;
    if (prev !== null && prev !== mode) {
      setPulse(true);
      const id = window.setTimeout(() => setPulse(false), 750);
      return () => window.clearTimeout(id);
    }
  }, [mode, pulseScanOnModeChange]);

  useEffect(() => {
    const tick = () => setStatusTime(formatStatusClock(intlLocale));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [intlLocale]);

  const laserOn = (scanActive ?? loading) || pulse;

  const setMode = (m: PreviewMode) => {
    onModeChange?.(m);
    if (controlledMode === undefined) {
      setInternalMode(m);
    }
  };

  useEffect(() => {
    setReadMore(false);
    setPushExpanded(false);
  }, [mode]);

  const targetFields = useMemo(() => {
    if (!result) return null;
    const baseline = {
      title: result.title,
      shortDescription: result.shortDescription,
      fullDescription: result.fullDescription,
    };
    if (!previewFieldsOverride) return baseline;
    const dirty =
      previewFieldsOverride.title !== baseline.title ||
      previewFieldsOverride.shortDescription !== baseline.shortDescription ||
      previewFieldsOverride.fullDescription !== baseline.fullDescription;
    return dirty ? previewFieldsOverride : baseline;
  }, [result, previewFieldsOverride]);

  const typingActive = Boolean(
    result &&
      typingEnabled &&
      !loading &&
      (!previewFieldsOverride ||
        (previewFieldsOverride.title === result.title &&
          previewFieldsOverride.shortDescription === result.shortDescription &&
          previewFieldsOverride.fullDescription === result.fullDescription)),
  );

  const typed = useTypingPreview(targetFields, typingActive);

  const draftFeaturesTrimmed = featuresDraft.trim();
  const hasDraftFeatures = !result && draftFeaturesTrimmed.length > 0;
  const draftShortTrimmed = draftShortDescription.trim();
  const hasDraftShort = !result && draftShortTrimmed.length > 0;
  const draftShort = hasDraftFeatures
    ? draftShortFromFeatures(draftFeaturesTrimmed)
    : "";

  /** Play Console caps — listing preview shows clamped text while edits can exceed limits in the editor. */
  const PLAY_TITLE_MAX = 30;
  const PLAY_SHORT_MAX = 80;
  const PLAY_LONG_MAX = 4000;

  const titleRaw = result
    ? typed.title
    : appName.trim() || t("preview.placeholderTitle");
  const title = result ? titleRaw.slice(0, PLAY_TITLE_MAX) : titleRaw;

  const shortDescRaw = result
    ? typed.shortDescription
    : hasDraftShort
      ? draftShortTrimmed
      : hasDraftFeatures
        ? draftShort
        : t("preview.placeholderShort");
  const shortDesc = result
    ? shortDescRaw.slice(0, PLAY_SHORT_MAX)
    : shortDescRaw;

  const fullDescRaw = result
    ? typed.fullDescription
    : hasDraftFeatures
      ? draftFeaturesTrimmed
      : t("preview.placeholderFull");
  const fullDesc = result
    ? fullDescRaw.slice(0, PLAY_LONG_MAX)
    : fullDescRaw;

  const headlineAd = result
    ? title
    : appName.trim() || t("preview.adHeadline");
  const bodyAd = result
    ? shortDesc
    : hasDraftShort
      ? draftShortTrimmed
      : hasDraftFeatures
        ? draftShort
        : t("preview.adBody");
  const ctaAd = result?.ctaSuggestions?.[0] ?? t("preview.adCta");

  const pushTitle = result ? title : appName.trim() || t("preview.pushTitle");
  const pushBody = result
    ? shortDesc
    : hasDraftShort
      ? draftShortTrimmed
      : hasDraftFeatures
        ? draftShort
        : t("preview.pushBody");

  const iconSrc = useMemo(() => safePreviewIconUrl(iconUrl), [iconUrl]);
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-3">
      <div className="w-full px-1" dir={previewDir}>
        <p className="min-w-0 text-start text-xs font-bold uppercase tracking-wider text-[#22C55E]">
          {t("preview.label")}
        </p>
      </div>

      {contextEyebrow ? (
        <p
          className="px-1 text-[11px] leading-snug text-white/40 transition-colors duration-500 ease-out"
          key={contextEyebrow}
        >
          {contextEyebrow}
        </p>
      ) : null}

      <div className="rounded-[1.12rem] [filter:drop-shadow(0_32px_64px_rgba(0,0,0,0.62))_drop-shadow(0_14px_36px_rgba(0,0,0,0.45))]">
        <PixelPhoneFrame statusTime={statusTime}>
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

        <div
          className="flex shrink-0 justify-end border-b border-white/[0.06] bg-black/20 px-2 py-1"
          dir={previewDir}
        >
          <span className="inline-flex w-fit shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
            {t("preview.interactive")}
          </span>
        </div>

        <div className="relative bg-[#0B0E14]">
          <div className="relative h-[420px]">
            <LaserScan active={laserOn} />

            <div
              dir={previewDir}
              className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-4 pt-2"
            >
              {mode === "aso" && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-row items-start gap-3 pt-1">
                    {onLogoSquircleClick ? (
                      <button
                        type="button"
                        onClick={onLogoSquircleClick}
                        title={t("preview.clickToChangeLogo")}
                        aria-label={t("preview.clickToChangeLogo")}
                        className={cn(
                          "flex shrink-0 flex-col items-center self-start rounded-2xl p-0.5 outline-none transition",
                          "hover:bg-[#22C55E]/[0.07] active:scale-[0.98]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]",
                        )}
                      >
                        <PreviewSquircleMark iconSrc={iconSrc} size="listing" />
                        {showEmptyIconAsoHint && !iconSrc ? (
                          <p className="mt-1.5 max-w-[4.75rem] text-balance text-center text-[9px] font-medium leading-snug text-[#86efac]/70">
                            {t("preview.addLogoHint")}
                          </p>
                        ) : null}
                      </button>
                    ) : (
                      <div className="flex shrink-0 flex-col items-center self-start">
                        <PreviewSquircleMark iconSrc={iconSrc} size="listing" />
                        {showEmptyIconAsoHint && !iconSrc ? (
                          <p className="mt-1.5 max-w-[4.75rem] text-balance text-center text-[9px] font-medium leading-snug text-[#86efac]/70">
                            {t("preview.addLogoHint")}
                          </p>
                        ) : null}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight tracking-tight text-white">
                        {title}
                      </h3>
                      <p className="mt-1 text-[11px] font-medium leading-snug text-[#86efac]/90">
                        {category || "App"}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {keywords
                          .split(/[,;\n]+/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .slice(0, 8)
                          .map((k) => (
                            <span
                              key={k}
                              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium leading-none text-white/58"
                            >
                              {k}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      toast.message(t("preview.storePreviewToast"));
                    }}
                    className={cn(
                      "w-full cursor-pointer rounded-full border border-[#22C55E]/45 bg-[#22C55E]/12 py-2.5 text-[13px] font-semibold text-[#d1fae5] shadow-sm",
                      "transition-[opacity,box-shadow] duration-200",
                      "hover:opacity-90 hover:ring-2 hover:ring-[#22C55E]/40 hover:ring-offset-2 hover:ring-offset-[#0B0E14] hover:shadow-[0_6px_20px_-10px_rgba(34,197,94,0.18)]",
                      "active:scale-[0.99] active:opacity-90",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]",
                    )}
                  >
                    {t("preview.viewInStore")}
                  </button>

                  <p className="text-[13px] leading-relaxed text-white/72">
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
                  <p className="mb-8 text-5xl font-extralight tracking-tight text-white/90 tabular-nums">
                    {statusTime}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPushExpanded((v) => !v)}
                    className={cn(
                      "w-full rounded-2xl border border-white/[0.08] bg-white/[0.08] p-3 text-start shadow-lg backdrop-blur-md transition-all",
                      pushExpanded && "ring-2 ring-[#22C55E]/40",
                    )}
                  >
                    <div className="flex flex-row items-start gap-2">
                      <div className="shrink-0 self-start">
                        <PreviewSquircleMark iconSrc={iconSrc} size="push" />
                      </div>
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
    </div>
  );
}
