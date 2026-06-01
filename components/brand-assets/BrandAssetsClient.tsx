"use client";

import { useState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Loader2, Sparkles, ArrowLeft, Check, Lock, Image as ImageIcon, Layers, Zap,
} from "lucide-react";
import { toast } from "sonner";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import {
  LISTING_LOGO_STYLES,
  type ListingLogoStyle,
} from "@/lib/validation/listing-logo-generate-body";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "logo" | "banner";
type Page = 1 | 2;
type BgStyle = "solid" | "transparent";

type GenOk = {
  ok: true;
  images: string[];
  meta?: { creditsCharged?: number; creditsRemaining?: number };
};
type GenErr = {
  ok: false;
  error: { code?: string; message: string; remaining?: number; required?: number };
};

const BRAND_COLOR_PRESETS = [
  { hex: "#1A73E8", label: "Blue" },
  { hex: "#0B8043", label: "Green" },
  { hex: "#D93025", label: "Red" },
  { hex: "#E37400", label: "Orange" },
  { hex: "#7B1FA2", label: "Purple" },
] as const;

// ── Shared skeleton tile ──────────────────────────────────────────────────────
function SkeletonTile({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/30",
        wide ? "aspect-[2/1]" : "aspect-square",
      )}
      aria-hidden
    >
      <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.09] to-transparent bg-[length:180%_100%]" />
    </div>
  );
}

// ── Brand Color Picker (shared) ───────────────────────────────────────────────
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
                "disabled:cursor-not-allowed disabled:opacity-40",
                active ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]"
                  : "border-white/20 hover:border-white/50 hover:scale-105",
              )}
              style={{ backgroundColor: p.hex }} />
          );
        })}
        <button type="button" disabled={disabled} title={customLabel} aria-label={customLabel}
          aria-pressed={isCustom} onClick={() => customInputRef.current?.click()}
          className={cn(
            "relative size-7 overflow-hidden rounded-full border-2 transition-[border-color,transform,box-shadow] duration-150",
            "disabled:cursor-not-allowed disabled:opacity-40",
            isCustom ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]"
              : "border-white/20 hover:border-white/50 hover:scale-105",
          )}
          style={isCustom ? { backgroundColor: value } : undefined}>
          {!isCustom && (
            <span className="absolute inset-0 rounded-full"
              style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)", opacity: 0.85 }}
              aria-hidden />
          )}
          <input ref={customInputRef} type="color" tabIndex={-1} aria-hidden disabled={disabled}
            value={isCustom ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
        </button>
        {value && <span className="ms-1 font-mono text-[11px] text-white/40">{value.toUpperCase()}</span>}
      </div>
    </div>
  );
}

// ── Style chips (shared) ──────────────────────────────────────────────────────
function StyleChips({
  value, onChange, disabled, t,
}: { value: ListingLogoStyle; onChange: (s: ListingLogoStyle) => void; disabled?: boolean; t: ReturnType<typeof useTranslations<"brandAssets">> }) {
  return (
    <div className="space-y-2.5">
      <span className="text-xs font-medium text-white/60">{t("styleLabel")}</span>
      <div className="flex flex-wrap gap-2">
        {LISTING_LOGO_STYLES.map((s) => (
          <button key={s} type="button" disabled={disabled} onClick={() => onChange(s)}
            className={cn(
              "rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150",
              "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
              value === s
                ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]"
                : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80",
            )}>
            {t(`styles.${s}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Image grid + download (shared between logo and banner) ────────────────────
function ImageGrid({
  images, selected, onSelect, busy, wide = false,
}: {
  images: string[]; selected: string | null;
  onSelect: (url: string) => void; busy: boolean; wide?: boolean;
}) {
  return (
    <div className={cn("grid gap-3", wide ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
      {images.map((src, i) => (
        <button
          key={`${i}-${src.slice(0, 48)}`} type="button" disabled={busy}
          onClick={() => onSelect(src)}
          className={cn(
            "group relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/35",
            wide ? "aspect-[2/1]" : "aspect-square",
            "p-1 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06]",
            "transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform",
            "focus:outline-none motion-safe:hover:-translate-y-[2px] motion-safe:hover:border-[#22C55E]/45",
            selected === src
              ? "border-[#22C55E]/60 ring-2 ring-[#22C55E]/40"
              : "hover:border-white/[0.12]",
            busy && "pointer-events-none opacity-55",
          )}>
          {selected === src && (
            <span className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full bg-[#22C55E]">
              <Check className="size-3 text-white" />
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full rounded-lg object-cover transition duration-200 motion-safe:group-hover:scale-[1.02]" />
        </button>
      ))}
    </div>
  );
}

// ── Main BrandAssetsClient ────────────────────────────────────────────────────
export function BrandAssetsClient(props: {
  workspaceId: string;
  appId: string;
  appName: string;
  category: string;
  shortDescription: string;
  creditsRemaining: number;
  plan?: string;
  onCreditsRemaining?: (n: number) => void;
  onRequestUpgrade?: () => void;
}) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const t = useTranslations("brandAssets");

  const isFreePlan = !props.plan || props.plan === "free";

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("logo");

  // ── Shared config ─────────────────────────────────────────────────────────
  const [style, setStyle] = useState<ListingLogoStyle>("Modern");
  const [brandColor, setBrandColor] = useState("");

  // ── Logo state ────────────────────────────────────────────────────────────
  const [logoPage, setLogoPage] = useState<Page>(1);
  const [logoImages, setLogoImages] = useState<string[]>([]);
  const [logoSelected, setLogoSelected] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [bgStyle, setBgStyle] = useState<BgStyle>("solid");
  const [customPrompt, setCustomPrompt] = useState("");
  const logoCreditCost = !isFreePlan && customPrompt.trim()
    ? AI_CREDIT_COSTS.listing_logo_generation_custom
    : AI_CREDIT_COSTS.listing_logo_generation;

  // ── Banner state ──────────────────────────────────────────────────────────
  const [bannerPage, setBannerPage] = useState<Page>(1);
  const [bannerImages, setBannerImages] = useState<string[]>([]);
  const [bannerSelected, setBannerSelected] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerTheme, setBannerTheme] = useState("");

  // ── Brand Kit state ───────────────────────────────────────────────────────
  const [kitBusy, setKitBusy] = useState(false);

  // ── Logo generate ─────────────────────────────────────────────────────────
  async function runLogoGenerate() {
    if (!props.appId || !props.appName) {
      toast.message(t("noAppTitle"), { description: t("noAppBody") });
      return;
    }
    if (props.creditsRemaining < logoCreditCost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: props.creditsRemaining, req: logoCreditCost }) });
      return;
    }
    setLogoBusy(true);
    setLogoImages([]);
    setLogoSelected(null);
    setLogoPage(2);
    const toastId = toast.loading(t("generatingLogos"));
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
      if (!json.ok) { handleGenError(json, logoCreditCost, setLogoPage); return; }
      const urls = (json as GenOk).images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4);
      setLogoImages(urls);
      if (typeof (json as GenOk).meta?.creditsRemaining === "number") {
        props.onCreditsRemaining?.((json as GenOk).meta!.creditsRemaining!);
      }
      toast.success(t("logosReady"));
    } catch {
      toast.dismiss(toastId);
      toast.error(t("networkError"));
      setLogoPage(1);
    } finally { setLogoBusy(false); }
  }

  // ── Banner generate ───────────────────────────────────────────────────────
  async function runBannerGenerate() {
    if (!props.appId || !props.appName) {
      toast.message(t("noAppTitle"), { description: t("noAppBody") });
      return;
    }
    const cost = AI_CREDIT_COSTS.banner_generation;
    if (props.creditsRemaining < cost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: props.creditsRemaining, req: cost }) });
      return;
    }
    setBannerBusy(true);
    setBannerImages([]);
    setBannerSelected(null);
    setBannerPage(2);
    const toastId = toast.loading(t("generatingBanners"));
    try {
      const body: Record<string, unknown> = {
        workspaceId: props.workspaceId, appId: props.appId,
        appName: props.appName, category: props.category, style,
      };
      if (props.shortDescription.trim()) body.shortDescription = props.shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(brandColor)) body.brandColor = brandColor;
      if (bannerTheme.trim()) body.theme = bannerTheme.trim();

      const res = await fetch("/api/brand-assets/banner-generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = (await res.json()) as GenOk | GenErr;
      toast.dismiss(toastId);
      if (!json.ok) { handleGenError(json, cost, setBannerPage); return; }
      const urls = (json as GenOk).images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4);
      setBannerImages(urls);
      if (typeof (json as GenOk).meta?.creditsRemaining === "number") {
        props.onCreditsRemaining?.((json as GenOk).meta!.creditsRemaining!);
      }
      toast.success(t("bannersReady"));
    } catch {
      toast.dismiss(toastId);
      toast.error(t("networkError"));
      setBannerPage(1);
    } finally { setBannerBusy(false); }
  }

  // ── Brand Kit batch ───────────────────────────────────────────────────────
  async function runBrandKit() {
    if (!props.appId || !props.appName) {
      toast.message(t("noAppTitle"), { description: t("noAppBody") });
      return;
    }
    const cost = AI_CREDIT_COSTS.brand_kit_batch;
    if (props.creditsRemaining < cost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: props.creditsRemaining, req: cost }) });
      return;
    }
    setKitBusy(true);
    setLogoImages([]);
    setBannerImages([]);
    setLogoSelected(null);
    setBannerSelected(null);
    const toastId = toast.loading(t("generatingKit"));
    try {
      // Base body shared by both calls — only include fields each route accepts
      const logoBody: Record<string, unknown> = {
        workspaceId: props.workspaceId, appId: props.appId,
        appName: props.appName, category: props.category, style,
      };
      if (props.shortDescription.trim()) logoBody.shortDescription = props.shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(brandColor)) logoBody.brandColor = brandColor;
      // Do NOT send customPrompt in kit mode — leave blank so AI picks concept

      const bannerBody: Record<string, unknown> = {
        workspaceId: props.workspaceId, appId: props.appId,
        appName: props.appName, category: props.category, style,
      };
      if (props.shortDescription.trim()) bannerBody.shortDescription = props.shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(brandColor)) bannerBody.brandColor = brandColor;
      if (bannerTheme.trim()) bannerBody.theme = bannerTheme.trim(); // correct key: "theme"

      // Fire both in parallel — each route gets its own clean body
      const [logoRes, bannerRes] = await Promise.all([
        fetch("/api/listings/logo-generate", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logoBody),
        }),
        fetch("/api/brand-assets/banner-generate", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bannerBody),
        }),
      ]);
      const [logoJson, bannerJson] = await Promise.all([
        logoRes.json() as Promise<GenOk | GenErr>,
        bannerRes.json() as Promise<GenOk | GenErr>,
      ]);
      toast.dismiss(toastId);

      const logoUrls = logoJson.ok ? (logoJson as GenOk).images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4) : [];
      const bannerUrls = bannerJson.ok ? (bannerJson as GenOk).images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4) : [];

      setLogoImages(logoUrls);
      setBannerImages(bannerUrls);

      // Update credits from last successful response
      const lastCredits = bannerJson.ok
        ? (bannerJson as GenOk).meta?.creditsRemaining
        : logoJson.ok ? (logoJson as GenOk).meta?.creditsRemaining : undefined;
      if (typeof lastCredits === "number") props.onCreditsRemaining?.(lastCredits);

      if (logoUrls.length > 0 || bannerUrls.length > 0) {
        toast.success(t("kitReady"));
        // Auto-navigate to logo tab to review results
        setTab("logo");
        setLogoPage(2);
        setBannerPage(2);
      } else {
        toast.error(t("kitFailed"));
      }
    } catch {
      toast.dismiss(toastId);
      toast.error(t("networkError"));
    } finally { setKitBusy(false); }
  }

  // ── Generic error handler ─────────────────────────────────────────────────
  function handleGenError(json: GenErr, creditCost: number, setPage: (p: Page) => void) {
    setPage(1);
    if (json.error.code === "insufficient_credits") {
      const rem = json.error.remaining;
      const req = json.error.required ?? creditCost;
      if (typeof rem === "number") props.onCreditsRemaining?.(rem);
      toast.message(t("insufficientTitle"), {
        description: typeof rem === "number" ? t("insufficientBody", { rem, req }) : json.error.message,
      });
    } else {
      toast.error(json.error.message?.trim() || t("generationFailed"));
    }
  }

  // ── Download helper ───────────────────────────────────────────────────────
  function triggerDownload(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }

  const anyBusy = logoBusy || bannerBusy || kitBusy;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir={isAr ? "rtl" : "ltr"} className={cn("min-h-full w-full", isAr && "font-arabic")}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div className="mb-8 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {t("pageTitle")}
          </h1>
          <p className="text-sm leading-relaxed text-white/55 sm:text-base">
            {t("pageSubtitle")}
          </p>
        </div>

        {/* ── No-app warning (shown when workspace has no apps yet) ────── */}
        {!props.appId && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300/70" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-amber-200/90">{t("noAppTitle")}</p>
              <p className="mt-0.5 text-xs leading-snug text-amber-200/60">{t("noAppBody")}</p>
            </div>
          </div>
        )}

        {/* ── Brand Kit CTA ─────────────────────────────────────────────── */}
        <div className="mb-8 rounded-2xl border border-[#22C55E]/20 bg-[#22C55E]/[0.06] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="size-4 shrink-0 text-[#86efac]" aria-hidden />
                <span className="text-sm font-semibold text-[#86efac]">{t("brandKitTitle")}</span>
              </div>
              <p className="text-xs leading-relaxed text-white/55">{t("brandKitSubtitle")}</p>
              <p className="text-xs text-amber-200/70">{t("brandKitCredits", { credits: AI_CREDIT_COSTS.brand_kit_batch })}</p>
            </div>
            <button
              type="button"
              disabled={anyBusy || !props.appId}
              onClick={() => { void runBrandKit(); }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55"
            >
              {kitBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}
              {kitBusy ? t("generating") : t("brandKitCta")}
            </button>
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <div className="mb-6 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {(["logo", "banner"] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-none",
                tab === id
                  ? "bg-[#22C55E]/15 text-[#86efac] ring-1 ring-[#22C55E]/30"
                  : "text-white/45 hover:text-white/70",
              )}
            >
              {id === "logo" ? <ImageIcon className="size-4 shrink-0" aria-hidden /> : <Layers className="size-4 shrink-0" aria-hidden />}
              {t(id === "logo" ? "tabLogo" : "tabBanner")}
            </button>
          ))}
        </div>

        {/* ════════════ LOGO TAB ════════════════════════════════════════════ */}
        {tab === "logo" && (
          <div className="space-y-6">
            {/* Step bar */}
            <div className="flex items-stretch rounded-xl border border-white/[0.07] bg-white/[0.02]">
              {([1, 2] as Page[]).map((p, idx) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { if (p === 1 || logoImages.length > 0) setLogoPage(p); }}
                  disabled={p === 2 && logoImages.length === 0 && !logoBusy}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors",
                    "focus-visible:outline-none disabled:cursor-default",
                    idx === 0 ? "rounded-s-xl" : "rounded-e-xl",
                    logoPage === p ? "border-[#22C55E] text-[#86efac]"
                      : logoImages.length > 0 && p === 1 ? "border-transparent text-white/40 hover:text-white/60"
                        : "border-transparent text-white/25",
                  )}
                >
                  <span className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    logoPage === p ? "bg-[#22C55E] text-white"
                      : logoPage === 2 && p === 1 ? "bg-[#22C55E]/20 text-[#86efac]"
                        : "bg-white/[0.08] text-white/35",
                  )}>
                    {logoPage === 2 && p === 1 ? <Check className="size-2.5" /> : p}
                  </span>
                  {t(p === 1 ? "step1Label" : "step2Label")}
                </button>
              ))}
            </div>

            {/* Page 1 — Configure */}
            {logoPage === 1 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
                  <Sparkles className="size-3 shrink-0" aria-hidden />
                  {t("logoCredits")}
                </div>

                <div className="space-y-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                  <StyleChips value={style} onChange={setStyle} disabled={logoBusy} t={t} />
                  <BrandColorPicker value={brandColor} onChange={setBrandColor}
                    label={t("brandColorLabel")} noneLabel={t("brandColorNone")}
                    customLabel={t("brandColorCustom")} disabled={logoBusy} />

                  {/* Background style */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-medium text-white/60">{t("bgStyleLabel")}</span>
                    <div className="flex gap-2">
                      {(["solid", "transparent"] as BgStyle[]).map((v) => (
                        <button key={v} type="button" disabled={logoBusy} onClick={() => setBgStyle(v)}
                          className={cn(
                            "flex-1 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                            bgStyle === v
                              ? "border-[#22C55E]/45 bg-[#22C55E]/10 font-semibold text-[#86efac]"
                              : "border-white/[0.1] bg-white/[0.03] font-medium text-white/50 hover:border-white/20 hover:text-white/70",
                          )}>
                          <span className="block">{t(v === "solid" ? "bgSolid" : "bgTransparent")}</span>
                          <span className="mt-0.5 block text-[10px] font-normal opacity-65">{t(v === "solid" ? "bgSolidHint" : "bgTransparentHint")}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom prompt */}
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
                      <textarea disabled={logoBusy || isFreePlan} maxLength={300} rows={3}
                        value={isFreePlan ? "" : customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={isFreePlan ? t("customPromptLockedPlaceholder") : t("customPromptPlaceholder")}
                        className={cn(
                          "w-full resize-none rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed outline-none transition",
                          "focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20",
                          isFreePlan ? "cursor-not-allowed border-white/[0.05] bg-white/[0.015] text-white/20 placeholder:text-white/15"
                            : "border-white/[0.1] bg-white/[0.06] text-white placeholder:text-white/30",
                        )} />
                      {isFreePlan && (
                        <button type="button" onClick={props.onRequestUpgrade}
                          className="absolute inset-0 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-black/35 text-xs font-semibold text-amber-300/85 backdrop-blur-[1px] transition hover:bg-black/45">
                          <Lock className="size-3.5 shrink-0" aria-hidden />{t("customPromptUpgradeCta")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <button type="button" disabled={logoBusy} onClick={() => { void runLogoGenerate(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                  {logoBusy ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t("generating")}</> : <><Sparkles className="size-4" aria-hidden />{logoImages.length ? t("regenerate") : t("generateLogos")}</>}
                </button>
              </div>
            )}

            {/* Page 2 — Pick */}
            {logoPage === 2 && (
              <div className="space-y-5">
                <p className="text-sm text-white/55">{t("pickHint")}</p>
                {logoBusy && logoImages.length === 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[0,1,2,3].map((i) => <SkeletonTile key={i} />)}
                  </div>
                )}
                {logoImages.length > 0 && (
                  <ImageGrid images={logoImages} selected={logoSelected}
                    onSelect={setLogoSelected} busy={logoBusy} />
                )}
                {logoImages.length > 0 && (
                  <div className="space-y-3">
                    {isFreePlan ? (
                      <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                        <Lock className="size-4 shrink-0 text-amber-300/75" aria-hidden />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-amber-200/90">{t("downloadLockedTitle")}</p>
                          <p className="mt-0.5 text-[11px] text-amber-200/55">{t("downloadLockedBody")}</p>
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
                        {["512", "1024"].map((size) => (
                          <button key={size} type="button" disabled={!logoSelected}
                            onClick={() => logoSelected && triggerDownload(logoSelected, `logo-${props.appName.replace(/\s+/g, "-").toLowerCase()}-${size}.png`)}
                            className="flex-1 rounded-xl border border-white/[0.12] bg-white/[0.04] py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] disabled:cursor-not-allowed disabled:opacity-45">
                            {size === "512" ? t("download512") : t("download1024")}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-center text-[11px] text-[#86efac]/70">{t("playStoreIconNote")}</p>
                  </div>
                )}
                <div className="border-t border-white/[0.06] pt-4">
                  <button type="button" onClick={() => setLogoPage(1)}
                    className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                    <ArrowLeft className="size-3.5" aria-hidden />{t("backToConfigure")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ BANNER TAB ══════════════════════════════════════════ */}
        {tab === "banner" && (
          <div className="space-y-6">
            {/* Step bar */}
            <div className="flex items-stretch rounded-xl border border-white/[0.07] bg-white/[0.02]">
              {([1, 2] as Page[]).map((p, idx) => (
                <button key={p} type="button"
                  onClick={() => { if (p === 1 || bannerImages.length > 0) setBannerPage(p); }}
                  disabled={p === 2 && bannerImages.length === 0 && !bannerBusy}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors",
                    "focus-visible:outline-none disabled:cursor-default",
                    idx === 0 ? "rounded-s-xl" : "rounded-e-xl",
                    bannerPage === p ? "border-[#22C55E] text-[#86efac]"
                      : bannerImages.length > 0 && p === 1 ? "border-transparent text-white/40 hover:text-white/60"
                        : "border-transparent text-white/25",
                  )}>
                  <span className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    bannerPage === p ? "bg-[#22C55E] text-white"
                      : bannerPage === 2 && p === 1 ? "bg-[#22C55E]/20 text-[#86efac]"
                        : "bg-white/[0.08] text-white/35",
                  )}>
                    {bannerPage === 2 && p === 1 ? <Check className="size-2.5" /> : p}
                  </span>
                  {t(p === 1 ? "step1Label" : "step2Label")}
                </button>
              ))}
            </div>

            {/* Page 1 — Configure */}
            {bannerPage === 1 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
                  <Sparkles className="size-3 shrink-0" aria-hidden />
                  {t("bannerCredits")}
                </div>

                <div className="space-y-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                  <StyleChips value={style} onChange={setStyle} disabled={bannerBusy} t={t} />
                  <BrandColorPicker value={brandColor} onChange={setBrandColor}
                    label={t("brandColorLabel")} noneLabel={t("brandColorNone")}
                    customLabel={t("brandColorCustom")} disabled={bannerBusy} />

                  {/* Banner theme */}
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-white/60">{t("bannerThemeLabel")}</span>
                    <input type="text" maxLength={150} value={bannerTheme}
                      onChange={(e) => setBannerTheme(e.target.value)}
                      disabled={bannerBusy}
                      placeholder={t("bannerThemePlaceholder")}
                      className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                    <p className="text-[11px] text-white/35">{t("bannerThemeHint")}</p>
                  </div>
                </div>

                <button type="button" disabled={bannerBusy} onClick={() => { void runBannerGenerate(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                  {bannerBusy ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t("generating")}</> : <><Layers className="size-4" aria-hidden />{bannerImages.length ? t("regenerate") : t("generateBanners")}</>}
                </button>
                <p className="text-[11px] text-white/35">{t("bannerSizeNote")}</p>
              </div>
            )}

            {/* Page 2 — Pick */}
            {bannerPage === 2 && (
              <div className="space-y-5">
                <p className="text-sm text-white/55">{t("pickBannerHint")}</p>
                {bannerBusy && bannerImages.length === 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[0,1,2,3].map((i) => <SkeletonTile key={i} wide />)}
                  </div>
                )}
                {bannerImages.length > 0 && (
                  <ImageGrid images={bannerImages} selected={bannerSelected}
                    onSelect={setBannerSelected} busy={bannerBusy} wide />
                )}
                {bannerImages.length > 0 && !isFreePlan && (
                  <button type="button" disabled={!bannerSelected}
                    onClick={() => bannerSelected && triggerDownload(bannerSelected, `banner-${props.appName.replace(/\s+/g, "-").toLowerCase()}-1024x500.png`)}
                    className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] disabled:cursor-not-allowed disabled:opacity-45">
                    {t("downloadBanner")}
                  </button>
                )}
                {bannerImages.length > 0 && isFreePlan && (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                    <Lock className="size-4 shrink-0 text-amber-300/75" aria-hidden />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-200/90">{t("downloadLockedTitle")}</p>
                      <p className="mt-0.5 text-[11px] text-amber-200/55">{t("downloadLockedBody")}</p>
                    </div>
                    {props.onRequestUpgrade && (
                      <button type="button" onClick={props.onRequestUpgrade}
                        className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300/90 transition hover:bg-amber-400/18">
                        {t("upgrade")}
                      </button>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-white/35">{t("bannerDownloadHint")}</p>
                <div className="border-t border-white/[0.06] pt-4">
                  <button type="button" onClick={() => setBannerPage(1)}
                    className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                    <ArrowLeft className="size-3.5" aria-hidden />{t("backToConfigure")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
