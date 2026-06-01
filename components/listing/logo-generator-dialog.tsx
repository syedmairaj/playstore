"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Lock, Sparkles, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { buildLogoDownloadFilename } from "@/lib/listing/logo-download-filename";
import {
  LISTING_LOGO_STYLES,
  type ListingLogoStyle,
} from "@/lib/validation/listing-logo-generate-body";
import { cn } from "@/lib/utils";
import type { AppLogoGeneratorMetadata } from "@/lib/apps/logo-generator-metadata";

// ── Types ─────────────────────────────────────────────────────────────────────

type LogoGenOk = {
  ok: true;
  images: string[];
  meta?: { creditsCharged?: number; creditsRemaining?: number };
};

type LogoGenErr = {
  ok: false;
  error: {
    code?: string;
    message: string;
    remaining?: number;
    required?: number;
  };
};

type BgStyle = "solid" | "transparent";
type Page = 1 | 2;

// ── Brand colour presets ──────────────────────────────────────────────────────
const BRAND_COLOR_PRESETS = [
  { hex: "#1A73E8", label: "Blue"   },
  { hex: "#0B8043", label: "Green"  },
  { hex: "#D93025", label: "Red"    },
  { hex: "#E37400", label: "Orange" },
  { hex: "#7B1FA2", label: "Purple" },
] as const;

// ── Skeleton tile ─────────────────────────────────────────────────────────────

function LogoSkeletonTile() {
  return (
    <div
      className="relative aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 p-1.5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.05]"
      aria-hidden
    >
      <div className="absolute inset-1.5 animate-logo-skeleton-shimmer rounded-[22%] bg-gradient-to-r from-transparent via-white/[0.09] to-transparent bg-[length:180%_100%]" />
    </div>
  );
}

// ── Brand Color Picker ────────────────────────────────────────────────────────

function BrandColorPicker({
  value,
  onChange,
  label,
  noneLabel,
  customLabel,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  noneLabel: string;
  customLabel: string;
  disabled?: boolean;
}) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const isCustom =
    value !== "" && !BRAND_COLOR_PRESETS.some((p) => p.hex === value);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-white/60">{label}</span>
        {value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className="ms-auto text-[10px] text-white/35 transition hover:text-white/60 disabled:pointer-events-none"
          >
            {noneLabel}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {BRAND_COLOR_PRESETS.map((p) => {
          const active = value === p.hex;
          return (
            <button
              key={p.hex}
              type="button"
              disabled={disabled}
              title={p.label}
              aria-label={p.label}
              aria-pressed={active}
              onClick={() => onChange(active ? "" : p.hex)}
              className={cn(
                "size-7 rounded-full border-2 transition-[border-color,transform,box-shadow] duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
                "disabled:cursor-not-allowed disabled:opacity-40",
                active
                  ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]"
                  : "border-white/20 hover:border-white/50 hover:scale-105",
              )}
              style={{ backgroundColor: p.hex }}
            />
          );
        })}

        {/* Custom colour swatch */}
        <button
          type="button"
          disabled={disabled}
          title={customLabel}
          aria-label={customLabel}
          aria-pressed={isCustom}
          onClick={() => customInputRef.current?.click()}
          className={cn(
            "relative size-7 overflow-hidden rounded-full border-2 transition-[border-color,transform,box-shadow] duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
            "disabled:cursor-not-allowed disabled:opacity-40",
            isCustom
              ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]"
              : "border-white/20 hover:border-white/50 hover:scale-105",
          )}
          style={isCustom ? { backgroundColor: value } : undefined}
        >
          {!isCustom && (
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
                opacity: 0.85,
              }}
              aria-hidden
            />
          )}
          <input
            ref={customInputRef}
            type="color"
            tabIndex={-1}
            aria-hidden
            disabled={disabled}
            value={isCustom ? value : "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </button>

        {value && (
          <span className="ms-1 font-mono text-[11px] tracking-wide text-white/40">
            {value.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function LogoGeneratorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  appId: string;
  appName: string;
  category: string;
  shortDescription: string;
  creditsRemaining: number | null;
  onCreditsRemaining: (n: number) => void;
  onLogoSelected: (httpsUrl: string) => void;
  onLogoGeneratorPersisted?: () => void;
  initialLogoGenerator?: AppLogoGeneratorMetadata | null;
  plan?: string;
  onRequestUpgrade?: () => void;
}) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const t = useTranslations("optimizer.logo");

  const isFreePlan = !props.plan || props.plan === "free";

  // ── Page state ───────────────────────────────────────────────────────────────
  const [page, setPage] = useState<Page>(1);

  // ── Config state ─────────────────────────────────────────────────────────────
  const [style, setStyle] = useState<ListingLogoStyle>("Modern");
  const [brandColor, setBrandColor] = useState<string>("");
  const [bgStyle, setBgStyle] = useState<BgStyle>("solid");
  const [customPrompt, setCustomPrompt] = useState<string>("");

  // Dynamic credit cost
  const creditCost =
    !isFreePlan && customPrompt.trim()
      ? AI_CREDIT_COSTS.listing_logo_generation_custom
      : AI_CREDIT_COSTS.listing_logo_generation;

  // ── Results state ────────────────────────────────────────────────────────────
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const persistSelectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenRef = useRef(false);

  // Reset page to 1 when dialog closes
  useEffect(() => {
    if (!props.open) {
      setPage(1);
    }
  }, [props.open]);

  // Restore state when dialog opens with an existing logo session
  useEffect(() => {
    const opened = props.open && !wasOpenRef.current;
    wasOpenRef.current = props.open;
    if (!opened) return;
    const lg = props.initialLogoGenerator;
    if (lg?.generatedUrls?.length) {
      setImages(lg.generatedUrls);
      const sel =
        lg.selectedUrl && lg.generatedUrls.includes(lg.selectedUrl)
          ? lg.selectedUrl
          : null;
      setSelected(sel);
      // If we have previous results, land on page 2
      setPage(2);
    } else {
      setImages([]);
      setSelected(null);
      setPage(1);
    }
  }, [props.open, props.initialLogoGenerator]);

  useEffect(() => {
    return () => {
      if (persistSelectionTimerRef.current) {
        clearTimeout(persistSelectionTimerRef.current);
      }
    };
  }, []);

  // ── Persist helpers ──────────────────────────────────────────────────────────

  async function persistLogoGeneratorState(meta: AppLogoGeneratorMetadata) {
    const res = await fetch(`/api/workspaces/${props.workspaceId}/apps/${props.appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoGenerator: meta }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
    if (!res.ok || json.ok !== true) {
      toast.error(json.error?.message ?? t("applyError"));
      return false;
    }
    props.onLogoGeneratorPersisted?.();
    return true;
  }

  function schedulePersistLogoSelection(url: string | null, urls: string[]) {
    if (persistSelectionTimerRef.current) {
      clearTimeout(persistSelectionTimerRef.current);
    }
    persistSelectionTimerRef.current = setTimeout(() => {
      persistSelectionTimerRef.current = null;
      void persistLogoGeneratorState({
        generatedUrls: urls.slice(0, 4),
        selectedUrl: url,
        updatedAt: new Date().toISOString(),
      });
    }, 400);
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function runGenerate() {
    if (
      typeof props.creditsRemaining === "number" &&
      props.creditsRemaining < creditCost
    ) {
      toast.message(t("insufficientTitle"), {
        description: t("insufficientBody", {
          rem: props.creditsRemaining,
          req: creditCost,
        }),
      });
      return;
    }
    setBusy(true);
    setImages([]);
    setSelected(null);
    // Move to page 2 immediately so skeleton grid shows there
    setPage(2);
    const toastId = toast.loading(t("generating"));
    try {
      const body: Record<string, unknown> = {
        workspaceId: props.workspaceId,
        appId: props.appId,
        appName: props.appName,
        category: props.category,
        style,
      };
      if (props.shortDescription.trim()) {
        body.shortDescription = props.shortDescription.trim();
      }
      if (/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
        body.brandColor = brandColor;
      }
      if (!isFreePlan && customPrompt.trim()) {
        body.customPrompt = customPrompt.trim();
      }

      const res = await fetch("/api/listings/logo-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as LogoGenOk | LogoGenErr;
      toast.dismiss(toastId);
      if (!json.ok) {
        setPage(1); // bounce back to config on error
        if (res.status === 402 || json.error.code === "insufficient_credits") {
          const rem = json.error.remaining;
          const req =
            typeof json.error.required === "number"
              ? json.error.required
              : creditCost;
          if (typeof rem === "number") {
            props.onCreditsRemaining(rem);
          }
          toast.message(t("insufficientTitle"), {
            description:
              typeof rem === "number"
                ? t("insufficientBody", { rem, req })
                : json.error.message,
          });
        } else if (
          res.status === 503 &&
          json.error.code === "logo_generation_unconfigured"
        ) {
          toast.error(t("errors.unconfigured"));
        } else {
          toast.error(
            json.error.message?.trim()
              ? json.error.message
              : t("errors.generationFailed"),
          );
        }
        return;
      }
      const urls = json.images
        .filter((u) => typeof u === "string" && /^https:\/\//i.test(String(u).trim()))
        .map((u) => String(u).trim())
        .slice(0, 4);
      setImages(urls);
      if (urls.length > 0) {
        await persistLogoGeneratorState({
          generatedUrls: urls,
          selectedUrl: null,
          updatedAt: new Date().toISOString(),
        });
      }
      if (typeof json.meta?.creditsRemaining === "number") {
        props.onCreditsRemaining(json.meta.creditsRemaining);
      }
      toast.success(t("generateSuccess"));
    } catch {
      toast.dismiss(toastId);
      toast.error(t("networkError"));
      setPage(1);
    } finally {
      setBusy(false);
    }
  }

  // ── Canvas download helpers ──────────────────────────────────────────────────

  async function fetchRemoteImageBlob(url: string): Promise<Blob | null> {
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  async function blobTo512PngBlob(blob: Blob, bg: BgStyle): Promise<Blob | null> {
    let bmp: ImageBitmap | undefined;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      return null;
    }
    try {
      const SIZE = 512;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, SIZE, SIZE);

      const w = bmp.width;
      const h = bmp.height;
      const scale = Math.min(SIZE / w, SIZE / h);
      const dw = w * scale;
      const dh = h * scale;
      const ox = (SIZE - dw) / 2;
      const oy = (SIZE - dh) / 2;

      if (bg === "solid") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, SIZE, SIZE);
        const shadowCanvas = document.createElement("canvas");
        shadowCanvas.width = SIZE;
        shadowCanvas.height = SIZE;
        const sCtx = shadowCanvas.getContext("2d");
        if (sCtx) {
          sCtx.shadowColor = "rgba(0,0,0,0.28)";
          sCtx.shadowBlur = 18;
          sCtx.shadowOffsetX = 0;
          sCtx.shadowOffsetY = 5;
          sCtx.drawImage(bmp, ox, oy, dw, dh);
          ctx.drawImage(shadowCanvas, 0, 0);
        }
        ctx.drawImage(bmp, ox, oy, dw, dh);
      } else {
        ctx.drawImage(bmp, ox, oy, dw, dh);
      }

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });
    } finally {
      bmp.close();
    }
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function variantIndex(url: string): number {
    const idx = images.findIndex((u) => u === url);
    return idx >= 0 ? idx : 0;
  }

  async function downloadPlay512(url: string) {
    const index = variantIndex(url);
    const blob = await fetchRemoteImageBlob(url);
    if (!blob) {
      toast.message(t("downloadCorsTitle"), { description: t("downloadCorsBody") });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const png = await blobTo512PngBlob(blob, bgStyle);
    if (!png) {
      toast.error(t("downloadPrepareFailed"));
      return;
    }
    triggerBlobDownload(
      png,
      buildLogoDownloadFilename({
        appName: props.appName,
        category: props.category,
        imageUrl: url,
        index,
        exportTag: bgStyle === "transparent" ? "512-transparent" : "512",
      }),
    );
  }

  async function downloadHighRes(url: string) {
    const index = variantIndex(url);
    const blob = await fetchRemoteImageBlob(url);
    if (!blob) {
      toast.message(t("downloadCorsTitle"), { description: t("downloadCorsBody") });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    triggerBlobDownload(
      blob,
      buildLogoDownloadFilename({
        appName: props.appName,
        category: props.category,
        imageUrl: url,
        index,
        exportTag: "1024",
      }),
    );
  }

  async function applyIcon(url: string) {
    if (!/^https:\/\//i.test(url)) {
      toast.message(t("httpsOnlyTitle"), { description: t("httpsOnlyBody") });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { icon_url: url };
      if (images.length > 0) {
        body.logoGenerator = {
          generatedUrls: images.slice(0, 4),
          selectedUrl: url,
          updatedAt: new Date().toISOString(),
        };
      }
      const res = await fetch(
        `/api/workspaces/${props.workspaceId}/apps/${props.appId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || json.ok !== true) {
        toast.error(json.error?.message ?? t("applyError"));
        return;
      }
      props.onLogoSelected(url);
      toast.success(t("logoUpdated"));
      props.onOpenChange(false);
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  const showSkeletonGrid = busy && images.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className={cn(
          "max-h-[min(92vh,860px)] max-w-[min(96vw,680px)] overflow-y-auto border border-white/[0.1] bg-[#0c1018] p-0 text-white shadow-2xl sm:rounded-2xl",
          isAr && "font-arabic",
        )}
        overlayClassName="bg-black/70 backdrop-blur-md"
      >

        {/* ── Step bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-stretch border-b border-white/[0.07]">
          {/* Step 1 tab */}
          <button
            type="button"
            onClick={() => setPage(1)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2.5 border-b-2 px-4 py-3.5 text-xs font-medium transition-colors duration-150",
              "focus-visible:outline-none",
              page === 1
                ? "border-[#22C55E] text-[#86efac]"
                : "border-transparent text-white/38 hover:text-white/55",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                page === 1
                  ? "bg-[#22C55E] text-white"
                  : page === 2
                    ? "bg-[#22C55E]/20 text-[#86efac]"
                    : "bg-white/[0.08] text-white/38",
              )}
            >
              {page === 2 ? <Check className="size-2.5" /> : "1"}
            </span>
            {t("step1Label")}
          </button>

          {/* Divider */}
          <div className="w-px self-stretch bg-white/[0.07]" />

          {/* Step 2 tab */}
          <button
            type="button"
            disabled={images.length === 0 && !busy}
            onClick={() => images.length > 0 && setPage(2)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2.5 border-b-2 px-4 py-3.5 text-xs font-medium transition-colors duration-150",
              "focus-visible:outline-none disabled:cursor-default",
              page === 2
                ? "border-[#22C55E] text-[#86efac]"
                : images.length > 0
                  ? "border-transparent text-white/38 hover:text-white/55"
                  : "border-transparent text-white/20",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                page === 2
                  ? "bg-[#22C55E] text-white"
                  : "bg-white/[0.08] text-white/38",
              )}
            >
              2
            </span>
            {t("step2Label")}
          </button>
        </div>

        {/* ════════════════ PAGE 1 — Configure ════════════════════════════════ */}
        {page === 1 && (
          <div className="space-y-7 p-7 sm:p-9">

            {/* Header */}
            <DialogHeader className="space-y-2 text-start">
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {t("title")}
              </DialogTitle>
              <p className="text-sm leading-relaxed text-white/58 sm:text-[15px]">
                {t("subtitle")}
              </p>
            </DialogHeader>

            {/* Credits pill */}
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              {t("creditsWarning", { credits: creditCost })}
              {!isFreePlan && customPrompt.trim() && (
                <span className="text-amber-300/55">{t("creditsCustomNote")}</span>
              )}
            </div>

            {/* ── Settings card ──────────────────────────────────────────────── */}
            <div className="space-y-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

              {/* Visual style — chips */}
              <div className="space-y-2.5">
                <span className="text-xs font-medium text-white/60">{t("styleLabel")}</span>
                <div className="flex flex-wrap gap-2">
                  {LISTING_LOGO_STYLES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => setStyle(s)}
                      className={cn(
                        "rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018]",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                        style === s
                          ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]"
                          : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80",
                      )}
                    >
                      {t(`styles.${s}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand colour */}
              <BrandColorPicker
                value={brandColor}
                onChange={setBrandColor}
                label={t("brandColorLabel")}
                noneLabel={t("brandColorNone")}
                customLabel={t("brandColorCustom")}
                disabled={busy}
              />

              {/* Background style */}
              <div className="space-y-2.5">
                <span className="text-xs font-medium text-white/60">{t("bgStyleLabel")}</span>
                <div className="flex gap-2">
                  {(
                    [
                      { v: "solid" as BgStyle, label: t("bgSolid"), hint: t("bgSolidHint") },
                      { v: "transparent" as BgStyle, label: t("bgTransparent"), hint: t("bgTransparentHint") },
                    ] as const
                  ).map(({ v, label, hint }) => (
                    <button
                      key={v}
                      type="button"
                      disabled={busy}
                      onClick={() => setBgStyle(v)}
                      className={cn(
                        "flex-1 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018]",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                        bgStyle === v
                          ? "border-[#22C55E]/45 bg-[#22C55E]/10 font-semibold text-[#86efac]"
                          : "border-white/[0.1] bg-white/[0.03] font-medium text-white/50 hover:border-white/20 hover:text-white/70",
                      )}
                    >
                      <span className="block">{label}</span>
                      <span className="mt-0.5 block text-[10px] font-normal opacity-65 leading-tight">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Icon Concept */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 shrink-0 text-white/45" aria-hidden />
                  <span className="text-xs font-medium text-white/60">{t("customPromptLabel")}</span>
                  {isFreePlan ? (
                    <span className="ms-auto inline-flex items-center gap-1 rounded border border-amber-400/25 bg-amber-400/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-amber-300/75">
                      <Lock className="size-2.5 shrink-0" aria-hidden />
                      {t("customPromptProBadge")}
                    </span>
                  ) : (
                    <span className="ms-auto text-[10px] text-white/28">
                      {customPrompt.trim().length}/300
                    </span>
                  )}
                </div>
                <div className="relative">
                  <textarea
                    disabled={busy || isFreePlan}
                    maxLength={300}
                    rows={3}
                    value={isFreePlan ? "" : customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={
                      isFreePlan
                        ? t("customPromptLockedPlaceholder")
                        : t("customPromptPlaceholder")
                    }
                    className={cn(
                      "w-full resize-none rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed outline-none transition",
                      "focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20",
                      isFreePlan
                        ? "cursor-not-allowed border-white/[0.05] bg-white/[0.015] text-white/20 placeholder:text-white/15"
                        : "border-white/[0.1] bg-white/[0.06] text-white placeholder:text-white/30",
                    )}
                  />
                  {isFreePlan && (
                    <button
                      type="button"
                      onClick={props.onRequestUpgrade}
                      className="absolute inset-0 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-black/35 text-xs font-semibold text-amber-300/85 backdrop-blur-[1px] transition hover:bg-black/45"
                    >
                      <Lock className="size-3.5 shrink-0" aria-hidden />
                      {t("customPromptUpgradeCta")}
                    </button>
                  )}
                </div>
                {!isFreePlan && (
                  <p className="text-[11px] leading-snug text-white/35">
                    {t("customPromptHint")}
                  </p>
                )}
              </div>
            </div>

            {/* Generate button */}
            <button
              type="button"
              disabled={busy}
              onClick={() => { void runGenerate(); }}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
                "disabled:cursor-not-allowed disabled:opacity-45",
                "bg-[#22C55E] hover:bg-[#16a34a]",
              )}
            >
              {busy ? (
                <>
                  <Loader2
                    className="size-4 shrink-0 motion-reduce:animate-none motion-safe:animate-[spin_1.35s_linear_infinite]"
                    aria-hidden
                  />
                  {t("generatingShort")}
                </>
              ) : images.length ? (
                <>
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {t("regenerate")}
                </>
              ) : (
                <>
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {t("generate")}
                </>
              )}
            </button>

            <p className="text-[11px] leading-relaxed text-white/35 sm:text-xs">
              {t("sizeNote")}
            </p>
          </div>
        )}

        {/* ════════════════ PAGE 2 — Pick & Download ══════════════════════════ */}
        {page === 2 && (
          <div className="space-y-6 p-7 sm:p-9">

            {/* Header */}
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {t("step2Title")}
              </h2>
              <p className="text-sm leading-relaxed text-white/55">
                {t("pickHint")}
              </p>
            </div>

            {/* Skeleton grid while generating */}
            {showSkeletonGrid ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
                {[0, 1, 2, 3].map((i) => (
                  <LogoSkeletonTile key={i} />
                ))}
              </div>
            ) : null}

            {/* Logo grid */}
            {images.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
                {images.map((src, i) => (
                  <button
                    key={`${i}-${src.slice(0, 48)}`}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelected(src);
                      props.onLogoSelected(src);
                      schedulePersistLogoSelection(src, images);
                    }}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/35 p-1.5",
                      "shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45),0_14px_28px_-12px_rgba(0,0,0,0.55)]",
                      "ring-1 ring-white/[0.06]",
                      "transition-[transform,box-shadow,border-color,opacity,ring-color] duration-200 ease-out will-change-transform",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
                      "motion-safe:hover:-translate-y-[2px] motion-safe:hover:border-[#22C55E]/45",
                      "motion-safe:hover:shadow-[0_8px_20px_-6px_rgba(34,197,94,0.22),0_20px_40px_-16px_rgba(0,0,0,0.55)]",
                      "motion-safe:hover:ring-[#22C55E]/15",
                      selected === src
                        ? "border-[#22C55E]/60 ring-2 ring-[#22C55E]/40 shadow-[0_6px_18px_-6px_rgba(34,197,94,0.28),0_18px_36px_-14px_rgba(0,0,0,0.55)]"
                        : "hover:border-white/[0.12]",
                      busy && "pointer-events-none opacity-55",
                    )}
                  >
                    {/* Selected checkmark */}
                    {selected === src && (
                      <span className="absolute right-2.5 top-2.5 z-10 flex size-5 items-center justify-center rounded-full bg-[#22C55E] shadow-md">
                        <Check className="size-3 text-white" />
                      </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="aspect-square w-full rounded-[22%] object-cover [image-rendering:auto] transition-[opacity,transform] duration-200 motion-safe:group-hover:scale-[1.02] motion-safe:group-hover:opacity-95"
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {/* Action buttons — only when we have results */}
            {images.length > 0 && (
              <div className="space-y-3">
                {/* Primary: apply */}
                <button
                  type="button"
                  disabled={busy || !selected}
                  onClick={() => selected && void applyIcon(selected)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(34,197,94,0.45)] transition hover:bg-[#16a34a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {t("useThis")}
                </button>

                {/* Download row or free lock */}
                {isFreePlan ? (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                    <Lock className="size-4 shrink-0 text-amber-300/75" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-amber-200/90">
                        {t("downloadLockedTitle")}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-amber-200/55">
                        {t("downloadLockedBody")}
                      </p>
                    </div>
                    {props.onRequestUpgrade && (
                      <button
                        type="button"
                        onClick={props.onRequestUpgrade}
                        className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300/90 transition hover:bg-amber-400/18"
                      >
                        Upgrade
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      disabled={busy || !selected}
                      onClick={() => selected && void downloadPlay512(selected)}
                      className="flex-1 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {t("download512")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !selected}
                      onClick={() => selected && void downloadHighRes(selected)}
                      className="flex-1 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {t("download1024")}
                    </button>
                  </div>
                )}

                <p className="text-center text-[11px] leading-relaxed text-[#86efac]/70 sm:text-start sm:text-xs">
                  {t("playStoreIconNote")}
                </p>
                <p className="text-[11px] leading-relaxed text-white/35 sm:text-xs">
                  {t("downloadHint")}
                </p>
              </div>
            )}

            {/* Back to configure */}
            <div className="border-t border-white/[0.06] pt-4">
              <button
                type="button"
                onClick={() => setPage(1)}
                className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60 focus-visible:outline-none"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {t("backToConfigure")}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
