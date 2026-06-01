"use client";

/**
 * AppIconGenerator — shared inner panel.
 *
 * Single source of truth for app icon generation logic.
 * Renders the step bar + configure page + pick/download page.
 * Has NO Dialog wrapper — can be embedded inside a Dialog (Listing Optimizer)
 * or rendered inline on a page (Brand Assets).
 *
 * Usage:
 *   <AppIconGenerator {...props} />
 */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Lock, Sparkles, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { saveGeneratedAssetsToVault } from "@/lib/brand-assets/save-to-vault";
import { buildLogoDownloadFilename } from "@/lib/listing/logo-download-filename";
import {
  LISTING_LOGO_STYLES,
  type ListingLogoStyle,
} from "@/lib/validation/listing-logo-generate-body";
import { cn } from "@/lib/utils";
import type { AppLogoGeneratorMetadata } from "@/lib/apps/logo-generator-metadata";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenOk = {
  ok: true;
  images: string[];
  meta?: { creditsCharged?: number; creditsRemaining?: number };
};
type GenErr = {
  ok: false;
  error: { code?: string; message: string; remaining?: number; required?: number };
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
function SkeletonTile() {
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
  value, onChange, label, noneLabel, customLabel, disabled,
}: {
  value: string; onChange: (hex: string) => void;
  label: string; noneLabel: string; customLabel: string; disabled?: boolean;
}) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const isCustom = value !== "" && !BRAND_COLOR_PRESETS.some((p) => p.hex === value);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-white/60">{label}</span>
        {value && (
          <button type="button" disabled={disabled} onClick={() => onChange("")}
            className="ms-auto text-[10px] text-white/35 transition hover:text-white/60 disabled:pointer-events-none">
            {noneLabel}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {BRAND_COLOR_PRESETS.map((p) => {
          const active = value === p.hex;
          return (
            <button key={p.hex} type="button" disabled={disabled} title={p.label}
              aria-label={p.label} aria-pressed={active}
              onClick={() => onChange(active ? "" : p.hex)}
              className={cn(
                "size-7 rounded-full border-2 transition-[border-color,transform,box-shadow] duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
                "disabled:cursor-not-allowed disabled:opacity-40",
                active ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]"
                  : "border-white/20 hover:border-white/50 hover:scale-105",
              )}
              style={{ backgroundColor: p.hex }} />
          );
        })}
        <button type="button" disabled={disabled} title={customLabel}
          aria-label={customLabel} aria-pressed={isCustom}
          onClick={() => customInputRef.current?.click()}
          className={cn(
            "relative size-7 overflow-hidden rounded-full border-2 transition-[border-color,transform,box-shadow] duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
            "disabled:cursor-not-allowed disabled:opacity-40",
            isCustom ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]"
              : "border-white/20 hover:border-white/50 hover:scale-105",
          )}
          style={isCustom ? { backgroundColor: value } : undefined}>
          {!isCustom && (
            <span className="absolute inset-0 rounded-full" aria-hidden
              style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)", opacity: 0.85 }} />
          )}
          <input ref={customInputRef} type="color" tabIndex={-1} aria-hidden disabled={disabled}
            value={isCustom ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
        </button>
        {value && <span className="ms-1 font-mono text-[11px] tracking-wide text-white/40">{value.toUpperCase()}</span>}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export type AppIconGeneratorProps = {
  workspaceId: string;
  appId: string;
  appName: string;
  category: string;
  shortDescription: string;
  creditsRemaining: number | null;
  onCreditsRemaining: (n: number) => void;
  /**
   * Called when the user taps a generated icon — updates the live mockup preview.
   * Also called on "Use this icon" (apply), just before onRequestClose fires.
   */
  onIconSelected: (httpsUrl: string) => void;
  /** Called after icon + logoGenerator metadata are saved to the app row. */
  onIconPersisted?: () => void;
  /** Restored from apps.metadata.logoGenerator on re-open. */
  initialLogoGenerator?: AppLogoGeneratorMetadata | null;
  plan?: string;
  onRequestUpgrade?: () => void;
  /**
   * Called when the user clicks "Use this icon" and the PATCH succeeds.
   * In dialog mode the parent closes the dialog. In page mode, ignored.
   */
  onRequestClose?: () => void;
};

// ── Main component ────────────────────────────────────────────────────────────

export function AppIconGenerator(props: AppIconGeneratorProps) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const t = useTranslations("optimizer.logo");

  const isFreePlan = !props.plan || props.plan === "free";

  const [page, setPage] = useState<Page>(1);
  const [style, setStyle] = useState<ListingLogoStyle>("Modern");
  const [brandColor, setBrandColor] = useState("");
  const [bgStyle, setBgStyle] = useState<BgStyle>("solid");
  const [customPrompt, setCustomPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const creditCost = !isFreePlan && customPrompt.trim()
    ? AI_CREDIT_COSTS.listing_logo_generation_custom
    : AI_CREDIT_COSTS.listing_logo_generation;

  // Restore state from saved session (used when reopening "Change icon")
  useEffect(() => {
    const lg = props.initialLogoGenerator;
    if (lg?.generatedUrls?.length) {
      setImages(lg.generatedUrls);
      setSelected(
        lg.selectedUrl && lg.generatedUrls.includes(lg.selectedUrl)
          ? lg.selectedUrl : null,
      );
      setPage(2);
    } else {
      setImages([]);
      setSelected(null);
      setPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current); };
  }, []);

  // ── Persist helpers ──────────────────────────────────────────────────────────

  async function persistState(meta: AppLogoGeneratorMetadata) {
    const res = await fetch(
      `/api/workspaces/${props.workspaceId}/apps/${props.appId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoGenerator: meta }) },
    );
    const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
    if (!res.ok || json.ok !== true) { toast.error(json.error?.message ?? t("applyError")); return false; }
    props.onIconPersisted?.();
    return true;
  }

  function scheduleSelectionPersist(url: string | null, urls: string[]) {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistState({ generatedUrls: urls.slice(0, 4), selectedUrl: url, updatedAt: new Date().toISOString() });
    }, 400);
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function runGenerate() {
    if (typeof props.creditsRemaining === "number" && props.creditsRemaining < creditCost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: props.creditsRemaining, req: creditCost }) });
      return;
    }
    setBusy(true); setImages([]); setSelected(null); setPage(2);
    const toastId = toast.loading(t("generating"));
    try {
      const body: Record<string, unknown> = {
        workspaceId: props.workspaceId, appId: props.appId,
        appName: props.appName, category: props.category, style,
      };
      if (props.shortDescription.trim()) body.shortDescription = props.shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(brandColor)) body.brandColor = brandColor;
      if (!isFreePlan && customPrompt.trim()) body.customPrompt = customPrompt.trim();

      const res = await fetch("/api/listings/logo-generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = (await res.json()) as GenOk | GenErr;
      toast.dismiss(toastId);
      if (!json.ok) {
        setPage(1);
        const err = (json as GenErr).error;
        if (res.status === 402 || err.code === "insufficient_credits") {
          if (typeof err.remaining === "number") props.onCreditsRemaining(err.remaining);
          toast.message(t("insufficientTitle"), {
            description: typeof err.remaining === "number"
              ? t("insufficientBody", { rem: err.remaining, req: err.required ?? creditCost })
              : err.message,
          });
        } else if (res.status === 503 && err.code === "logo_generation_unconfigured") {
          toast.error(t("errors.unconfigured"));
        } else {
          toast.error(err.message?.trim() ? err.message : t("errors.generationFailed"));
        }
        return;
      }
      const ok = json as GenOk;
      const urls = ok.images.filter((u) => /^https:\/\//i.test(String(u).trim())).map((u) => String(u).trim()).slice(0, 4);
      setImages(urls);
      if (urls.length > 0) {
        await persistState({ generatedUrls: urls, selectedUrl: null, updatedAt: new Date().toISOString() });
        // Fire-and-forget: save to Vault in background — doesn't block UI
        void saveGeneratedAssetsToVault({
          workspaceId: props.workspaceId,
          appId: props.appId,
          assetType: "icon",
          imageUrls: urls,
          meta: { style, brandColor: brandColor || undefined, hasCustomPrompt: !!customPrompt.trim() },
        });
      }
      if (typeof ok.meta?.creditsRemaining === "number") props.onCreditsRemaining(ok.meta.creditsRemaining);
      toast.success(t("generateSuccess"));
    } catch {
      toast.dismiss(toastId); toast.error(t("networkError")); setPage(1);
    } finally { setBusy(false); }
  }

  // ── Canvas download helpers ──────────────────────────────────────────────────

  async function fetchBlob(url: string): Promise<Blob | null> {
    try {
      const r = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
      return r.ok ? r.blob() : null;
    } catch { return null; }
  }

  async function blobTo512(blob: Blob, bg: BgStyle): Promise<Blob | null> {
    let bmp: ImageBitmap | undefined;
    try { bmp = await createImageBitmap(blob); } catch { return null; }
    try {
      const S = 512;
      const canvas = document.createElement("canvas"); canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext("2d"); if (!ctx) return null;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.clearRect(0, 0, S, S);
      const scale = Math.min(S / bmp.width, S / bmp.height);
      const dw = bmp.width * scale, dh = bmp.height * scale;
      const ox = (S - dw) / 2, oy = (S - dh) / 2;
      if (bg === "solid") {
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, S, S);
        const sc = document.createElement("canvas"); sc.width = S; sc.height = S;
        const sCtx = sc.getContext("2d");
        if (sCtx) {
          sCtx.shadowColor = "rgba(0,0,0,0.28)"; sCtx.shadowBlur = 18; sCtx.shadowOffsetY = 5;
          sCtx.drawImage(bmp, ox, oy, dw, dh); ctx.drawImage(sc, 0, 0);
        }
        ctx.drawImage(bmp, ox, oy, dw, dh);
      } else { ctx.drawImage(bmp, ox, oy, dw, dh); }
      return new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    } finally { bmp.close(); }
  }

  function downloadBlob(blob: Blob, name: string) {
    const u = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: u, download: name, rel: "noopener" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  }

  function variantIdx(url: string) { const i = images.findIndex((u) => u === url); return i >= 0 ? i : 0; }

  async function downloadPlay512(url: string) {
    const blob = await fetchBlob(url);
    if (!blob) { toast.message(t("downloadCorsTitle"), { description: t("downloadCorsBody") }); window.open(url, "_blank", "noopener,noreferrer"); return; }
    const png = await blobTo512(blob, bgStyle);
    if (!png) { toast.error(t("downloadPrepareFailed")); return; }
    downloadBlob(png, buildLogoDownloadFilename({ appName: props.appName, category: props.category, imageUrl: url, index: variantIdx(url), exportTag: bgStyle === "transparent" ? "512-transparent" : "512" }));
  }

  async function downloadHighRes(url: string) {
    const blob = await fetchBlob(url);
    if (!blob) { toast.message(t("downloadCorsTitle"), { description: t("downloadCorsBody") }); window.open(url, "_blank", "noopener,noreferrer"); return; }
    downloadBlob(blob, buildLogoDownloadFilename({ appName: props.appName, category: props.category, imageUrl: url, index: variantIdx(url), exportTag: "1024" }));
  }

  // ── Apply to app ─────────────────────────────────────────────────────────────

  async function applyIcon(url: string) {
    if (!/^https:\/\//i.test(url)) { toast.message(t("httpsOnlyTitle"), { description: t("httpsOnlyBody") }); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { icon_url: url };
      if (images.length > 0) body.logoGenerator = { generatedUrls: images.slice(0, 4), selectedUrl: url, updatedAt: new Date().toISOString() };
      const res = await fetch(`/api/workspaces/${props.workspaceId}/apps/${props.appId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || json.ok !== true) { toast.error(json.error?.message ?? t("applyError")); return; }
      props.onIconSelected(url);
      toast.success(t("iconUpdated"));
      props.onRequestClose?.();
    } catch { toast.error(t("networkError")); }
    finally { setBusy(false); }
  }

  const showSkeleton = busy && images.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div dir={isAr ? "rtl" : "ltr"} className={isAr ? "font-arabic" : undefined}>

      {/* ── Step bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-stretch border-b border-white/[0.07]">
        <button type="button" onClick={() => setPage(1)}
          className={cn(
            "flex flex-1 items-center justify-center gap-2.5 border-b-2 px-4 py-3.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none",
            page === 1 ? "border-[#22C55E] text-[#86efac]" : "border-transparent text-white/38 hover:text-white/55",
          )}>
          <span className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
            page === 1 ? "bg-[#22C55E] text-white" : page === 2 ? "bg-[#22C55E]/20 text-[#86efac]" : "bg-white/[0.08] text-white/38",
          )}>
            {page === 2 ? <Check className="size-2.5" /> : "1"}
          </span>
          {t("step1Label")}
        </button>

        <div className="w-px self-stretch bg-white/[0.07]" />

        <button type="button" disabled={images.length === 0 && !busy}
          onClick={() => images.length > 0 && setPage(2)}
          className={cn(
            "flex flex-1 items-center justify-center gap-2.5 border-b-2 px-4 py-3.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none disabled:cursor-default",
            page === 2 ? "border-[#22C55E] text-[#86efac]"
              : images.length > 0 ? "border-transparent text-white/38 hover:text-white/55"
                : "border-transparent text-white/20",
          )}>
          <span className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
            page === 2 ? "bg-[#22C55E] text-white" : "bg-white/[0.08] text-white/38",
          )}>2</span>
          {t("step2Label")}
        </button>
      </div>

      {/* ══════════ PAGE 1 — Configure ══════════════════════════════════════ */}
      {page === 1 && (
        <div className="space-y-7 p-7 sm:p-9">
          {/* Credits pill */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
            <Sparkles className="size-3 shrink-0" aria-hidden />
            {t("creditsWarning")}
          </div>

          {/* Settings card */}
          <div className="space-y-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

            {/* Style chips */}
            <div className="space-y-2.5">
              <span className="text-xs font-medium text-white/60">{t("styleLabel")}</span>
              <div className="flex flex-wrap gap-2">
                {LISTING_LOGO_STYLES.map((s) => (
                  <button key={s} type="button" disabled={busy} onClick={() => setStyle(s)}
                    className={cn(
                      "rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018]",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                      style === s
                        ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]"
                        : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80",
                    )}>
                    {t(`styles.${s}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand colour */}
            <BrandColorPicker value={brandColor} onChange={setBrandColor}
              label={t("brandColorLabel")} noneLabel={t("brandColorNone")}
              customLabel={t("brandColorCustom")} disabled={busy} />

            {/* Background style */}
            <div className="space-y-2.5">
              <span className="text-xs font-medium text-white/60">{t("bgStyleLabel")}</span>
              <div className="flex gap-2">
                {(["solid", "transparent"] as BgStyle[]).map((v) => (
                  <button key={v} type="button" disabled={busy} onClick={() => setBgStyle(v)}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018]",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                      bgStyle === v
                        ? "border-[#22C55E]/45 bg-[#22C55E]/10 font-semibold text-[#86efac]"
                        : "border-white/[0.1] bg-white/[0.03] font-medium text-white/50 hover:border-white/20 hover:text-white/70",
                    )}>
                    <span className="block">{t(v === "solid" ? "bgSolid" : "bgTransparent")}</span>
                    <span className="mt-0.5 block text-[10px] font-normal opacity-65 leading-tight">
                      {t(v === "solid" ? "bgSolidHint" : "bgTransparentHint")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom icon concept */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 shrink-0 text-white/45" aria-hidden />
                <span className="text-xs font-medium text-white/60">{t("customPromptLabel")}</span>
                {isFreePlan ? (
                  <span className="ms-auto inline-flex items-center gap-1 rounded border border-amber-400/25 bg-amber-400/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-amber-300/75">
                    <Lock className="size-2.5 shrink-0" aria-hidden />{t("customPromptProBadge")}
                  </span>
                ) : (
                  <span className="ms-auto text-[10px] text-white/28">{customPrompt.trim().length}/300</span>
                )}
              </div>
              <div className="relative">
                <textarea disabled={busy || isFreePlan} maxLength={300} rows={3}
                  value={isFreePlan ? "" : customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={isFreePlan ? t("customPromptLockedPlaceholder") : t("customPromptPlaceholder")}
                  className={cn(
                    "w-full resize-none rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed outline-none transition",
                    "focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20",
                    isFreePlan
                      ? "cursor-not-allowed border-white/[0.05] bg-white/[0.015] text-white/20 placeholder:text-white/15"
                      : "border-white/[0.1] bg-white/[0.06] text-white placeholder:text-white/30",
                  )} />
                {isFreePlan && (
                  <button type="button" onClick={props.onRequestUpgrade}
                    className="absolute inset-0 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-black/35 text-xs font-semibold text-amber-300/85 backdrop-blur-[1px] transition hover:bg-black/45">
                    <Lock className="size-3.5 shrink-0" aria-hidden />{t("customPromptUpgradeCta")}
                  </button>
                )}
              </div>
              {!isFreePlan && (
                <p className="text-[11px] leading-snug text-white/35">{t("customPromptHint")}</p>
              )}
            </div>
          </div>

          {/* Generate button */}
          <button type="button" disabled={busy} onClick={() => { void runGenerate(); }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
              "disabled:cursor-not-allowed disabled:opacity-45 bg-[#22C55E] hover:bg-[#16a34a]",
            )}>
            {busy ? (
              <><Loader2 className="size-4 shrink-0 motion-reduce:animate-none motion-safe:animate-[spin_1.35s_linear_infinite]" aria-hidden />{t("generatingShort")}</>
            ) : images.length ? (
              <><Sparkles className="size-4 shrink-0" aria-hidden />{t("regenerate")}</>
            ) : (
              <><Sparkles className="size-4 shrink-0" aria-hidden />{t("generate")}</>
            )}
          </button>

          <p className="text-[11px] leading-relaxed text-white/35 sm:text-xs">{t("sizeNote")}</p>
        </div>
      )}

      {/* ══════════ PAGE 2 — Pick & Download ════════════════════════════════ */}
      {page === 2 && (
        <div className="space-y-6 p-7 sm:p-9">
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{t("step2Title")}</h2>
            <p className="text-sm leading-relaxed text-white/55">{t("pickHint")}</p>
          </div>

          {/* Skeleton */}
          {showSkeleton && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
              {[0,1,2,3].map((i) => <SkeletonTile key={i} />)}
            </div>
          )}

          {/* Icon grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
              {images.map((src, i) => (
                <button key={`${i}-${src.slice(0, 48)}`} type="button" disabled={busy}
                  onClick={() => { setSelected(src); props.onIconSelected(src); scheduleSelectionPersist(src, images); }}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/35 p-1.5",
                    "shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45),0_14px_28px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]",
                    "transition-[transform,box-shadow,border-color,opacity,ring-color] duration-200 ease-out will-change-transform",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
                    "motion-safe:hover:-translate-y-[2px] motion-safe:hover:border-[#22C55E]/45 motion-safe:hover:shadow-[0_8px_20px_-6px_rgba(34,197,94,0.22),0_20px_40px_-16px_rgba(0,0,0,0.55)] motion-safe:hover:ring-[#22C55E]/15",
                    selected === src ? "border-[#22C55E]/60 ring-2 ring-[#22C55E]/40 shadow-[0_6px_18px_-6px_rgba(34,197,94,0.28),0_18px_36px_-14px_rgba(0,0,0,0.55)]" : "hover:border-white/[0.12]",
                    busy && "pointer-events-none opacity-55",
                  )}>
                  {selected === src && (
                    <span className="absolute right-2.5 top-2.5 z-10 flex size-5 items-center justify-center rounded-full bg-[#22C55E] shadow-md">
                      <Check className="size-3 text-white" />
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt=""
                    className="aspect-square w-full rounded-[22%] object-cover [image-rendering:auto] transition-[opacity,transform] duration-200 motion-safe:group-hover:scale-[1.02] motion-safe:group-hover:opacity-95" />
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          {images.length > 0 && (
            <div className="space-y-3">
              {/* "Use this icon" — dialog mode only (Listing Optimizer).
                  In page/Brand Assets mode this button is intentionally absent —
                  download is the only action there. */}
              {props.onRequestClose && (
                <button type="button" disabled={busy || !selected}
                  onClick={() => selected && void applyIcon(selected)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(34,197,94,0.45)] transition hover:bg-[#16a34a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45">
                  {t("useThis")}
                </button>
              )}

              {/* Download or free lock */}
              {isFreePlan ? (
                <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                  <Lock className="size-4 shrink-0 text-amber-300/75" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-amber-200/90">{t("downloadLockedTitle")}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-amber-200/55">{t("downloadLockedBody")}</p>
                  </div>
                  {props.onRequestUpgrade && (
                    <button type="button" onClick={props.onRequestUpgrade}
                      className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300/90 transition hover:bg-amber-400/18">
                      {t("upgrade")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2.5">
                  <button type="button" disabled={busy || !selected}
                    onClick={() => selected && void downloadPlay512(selected)}
                    className="flex-1 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45">
                    {t("download512")}
                  </button>
                  <button type="button" disabled={busy || !selected}
                    onClick={() => selected && void downloadHighRes(selected)}
                    className="flex-1 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45">
                    {t("download1024")}
                  </button>
                </div>
              )}

              <p className="text-center text-[11px] leading-relaxed text-[#86efac]/70 sm:text-start sm:text-xs">{t("playStoreIconNote")}</p>
              <p className="text-[11px] leading-relaxed text-white/35 sm:text-xs">{t("downloadHint")}</p>

              {/* Page mode only: guide users to Listing Optimizer for mockup preview */}
              {!props.onRequestClose && props.workspaceId && (
                <p className="text-[11px] leading-snug text-white/40 sm:text-xs">
                  {t("mockupHint")}{" "}
                  <Link
                    href={`/app/${props.workspaceId}/listing-optimizer`}
                    className="underline underline-offset-2 transition hover:text-white/70"
                  >
                    {t("mockupHintLink")}
                  </Link>
                </p>
              )}
            </div>
          )}

          {/* Back to configure */}
          <div className="border-t border-white/[0.06] pt-4">
            <button type="button" onClick={() => setPage(1)}
              className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60 focus-visible:outline-none">
              <ArrowLeft className="size-3.5" aria-hidden />{t("backToConfigure")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
