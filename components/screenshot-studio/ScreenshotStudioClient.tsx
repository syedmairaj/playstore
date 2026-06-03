"use client";

/**
 * ScreenshotStudioClient — Consultant's 3-layer screenshot pipeline.
 *
 * Layer 1  Gemini Semantic Layout Engine → LayoutMap per slide
 * Layer 2  Runware FLUX.1 [dev] → pure atmospheric background (no text/frame)
 * Layer 3  Canvas "Bake-at-Download" compositor (this file):
 *            • FLUX background (full-bleed 1080×1920)
 *            • SVG Pixel 9 phone frame overlay
 *            • Sharp system-font headline + subline text
 *            • Brand accent strip derived from LayoutMap
 *
 * Preview always shows the clean raw FLUX background.
 * Compositing only happens when the user clicks Export.
 *
 * Full EN + AR (RTL) support. Vault-backed persistence via React Query.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Sparkles, ArrowLeft, Check, Lock,
  Smartphone, Archive, ChevronDown, Download, Zap, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { workspaceAppsQueryKey } from "@/hooks/use-app-limits";
import { cn } from "@/lib/utils";
import type { CaptionVariation, CaptionTone } from "@/lib/gemini/generate-screenshot-captions";
import type { LayoutMap } from "@/lib/gemini/generate-screenshot-layout";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppRow = {
  id: string; name: string;
  category?: string | null; short_description?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Step = 1 | 2 | 3;

/** One rendered slide returned by the render API */
type RenderedSlide = {
  backgroundUrl: string;
  layoutMap: LayoutMap;
  slide: { position: number; headline: string; subline: string; uiFocus: string };
};

type CaptionsOk = {
  ok: true;
  variations: CaptionVariation[];
  meta?: { creditsCharged?: number; creditsRemaining?: number };
};
type RenderOk = {
  ok: true;
  slides: RenderedSlide[];
  batchId?: string;
  meta?: { creditsCharged?: number; creditsRemaining?: number };
};
type ApiErr = {
  ok: false;
  error: { code?: string; message: string; remaining?: number; required?: number };
};

// ── SVG Pixel 9 phone frame (static, high-res, portrait) ─────────────────────
// Consultant: "use a high-resolution, static SVG Phone Frame" — no AI draws the frame.
// This SVG is the bounding chrome that gets composited on top of the FLUX background.
const PIXEL9_FRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 690" fill="none">
  <!-- Phone body -->
  <rect x="8" y="2" width="304" height="686" rx="42" ry="42" fill="#1a1a1a" stroke="#333" stroke-width="2"/>
  <!-- Screen area -->
  <rect x="18" y="14" width="284" height="662" rx="34" ry="34" fill="#0a0a0a"/>
  <!-- Side buttons -->
  <rect x="0" y="180" width="6" height="60" rx="3" fill="#222"/>
  <rect x="0" y="260" width="6" height="90" rx="3" fill="#222"/>
  <rect x="314" y="200" width="6" height="80" rx="3" fill="#222"/>
  <!-- Front camera pill -->
  <rect x="136" y="20" width="48" height="14" rx="7" fill="#111"/>
  <!-- Speaker grill -->
  <rect x="126" y="672" width="68" height="6" rx="3" fill="#222"/>
  <!-- Screen inner glow -->
  <rect x="20" y="36" width="280" height="640" rx="30" ry="30" fill="url(#screenGrad)" opacity="0.06"/>
  <defs>
    <linearGradient id="screenGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
</svg>`;

// ── Canvas compositor ─────────────────────────────────────────────────────────

/**
 * Bake-at-download canvas compositor.
 * Consultant plan: FLUX background → SVG phone frame → system-font text overlay.
 * Only runs at export time; preview always shows clean FLUX background.
 */
async function composeScreenshot(opts: {
  backgroundUrl: string;
  layoutMap: LayoutMap;
  headline: string;
  subline: string;
  locale: "en" | "ar";
  targetW: number;
  targetH: number;
}): Promise<Blob | null> {
  const { backgroundUrl, layoutMap, headline, subline, locale, targetW, targetH } = opts;
  const isRTL = locale === "ar";

  // 1. Fetch background blob from Supabase Storage / Runware CDN
  let bgBlob: Blob | null = null;
  try {
    const r = await fetch(backgroundUrl, { mode: "cors", credentials: "omit", cache: "no-store" });
    if (r.ok) bgBlob = await r.blob();
  } catch { /* fall through */ }
  if (!bgBlob) return null;

  let bgBmp: ImageBitmap;
  try { bgBmp = await createImageBitmap(bgBlob); }
  catch { return null; }

  // 2. Set up canvas at target export size
  const canvas = document.createElement("canvas");
  canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 3. Draw FLUX background (full bleed)
  ctx.drawImage(bgBmp, 0, 0, targetW, targetH);
  bgBmp.close();

  // 4. Accent strip — semi-transparent brand colour bar
  // Position: bottom strip (or top for textPosition === "top")
  const stripH = Math.round(targetH * 0.07);
  const stripY = layoutMap.textPosition === "top" ? 0 : targetH - stripH;
  ctx.fillStyle = layoutMap.accentColor + "CC"; // 80% opacity
  ctx.fillRect(0, stripY, targetW, stripH);

  // 5. SVG Phone frame — draw on the right (LTR) or left (RTL) half
  const frameAspect = 320 / 690;
  const frameH = Math.round(targetH * 0.72);
  const frameW = Math.round(frameH * frameAspect);
  const frameX = isRTL
    ? Math.round(targetW * 0.04)                    // RTL: left side
    : Math.round(targetW - frameW - targetW * 0.04); // LTR: right side
  const frameY = Math.round((targetH - frameH) / 2);

  const svgBlob = new Blob([PIXEL9_FRAME_SVG], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const svgImg = new Image();
    await new Promise<void>((resolve, reject) => {
      svgImg.onload = () => resolve();
      svgImg.onerror = reject;
      svgImg.src = svgUrl;
    });
    ctx.drawImage(svgImg, frameX, frameY, frameW, frameH);
  } catch { /* frame draw failed — continue without frame */ }
  finally { URL.revokeObjectURL(svgUrl); }

  // 6. Text overlay — in the opposite half from the phone frame
  // Consultant: "sharp, system-font text overlay" — not rendered by FLUX
  const textAreaX = isRTL
    ? Math.round(targetW * 0.04 + frameW + targetW * 0.04)  // RTL: right of frame
    : Math.round(targetW * 0.04);                             // LTR: left area
  const textAreaW = isRTL
    ? Math.round(targetW - textAreaX - targetW * 0.04)
    : Math.round(frameX - targetW * 0.06);

  // Text vertical anchor depends on layoutMap.textPosition
  const textCenterY = layoutMap.textPosition === "top"
    ? Math.round(targetH * 0.22)
    : layoutMap.textPosition === "center"
      ? Math.round(targetH * 0.5)
      : Math.round(targetH * 0.75);

  // Headline
  const headlineFontSize = Math.round(targetW * 0.052);
  ctx.font = `bold ${headlineFontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = isRTL ? "right" : "left";
  ctx.textBaseline = "middle";

  // Text shadow for legibility over any background
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = Math.round(targetW * 0.018);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(targetW * 0.004);
  ctx.fillStyle = layoutMap.textColor;

  // Word-wrap headline
  const headlineLines = wrapText(ctx, headline, textAreaW);
  const lineH = Math.round(headlineFontSize * 1.25);
  const headlineBlockH = headlineLines.length * lineH;
  let ty = textCenterY - headlineBlockH / 2;
  const textX = isRTL ? textAreaX + textAreaW : textAreaX;

  for (const line of headlineLines) {
    ctx.fillText(line, textX, ty, textAreaW);
    ty += lineH;
  }

  // Subline
  const sublineFontSize = Math.round(headlineFontSize * 0.6);
  ctx.font = `500 ${sublineFontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillStyle = layoutMap.textColor === "#ffffff" ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.72)";
  ctx.shadowBlur = Math.round(targetW * 0.012);

  ty += Math.round(headlineFontSize * 0.4);
  const sublineLines = wrapText(ctx, subline, textAreaW);
  for (const sl of sublineLines) {
    ctx.fillText(sl, textX, ty, textAreaW);
    ty += Math.round(sublineFontSize * 1.4);
  }

  // Reset shadow
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

  return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = w;
    } else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ScreenshotSkeleton() {
  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30" aria-hidden>
      <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.09] to-transparent bg-[length:180%_100%]" />
    </div>
  );
}

// ── Tone card ─────────────────────────────────────────────────────────────────

function ToneCard({
  variation, selected, onSelect, locale, isRTL,
}: {
  variation: CaptionVariation;
  selected: boolean;
  onSelect: () => void;
  locale: "en" | "ar";
  isRTL: boolean;
}) {
  const t = useTranslations("screenshotStudio");
  const slides = locale === "ar" ? variation.slidesAr : variation.slides;
  const label = locale === "ar" ? variation.toneLabelAr : variation.toneLabel;
  const toneHintKey = (
    variation.tone === "feature" ? "toneFeatureHint"
    : variation.tone === "benefit" ? "toneBenefitHint"
    : "toneEmotionalHint"
  ) as Parameters<typeof t>[0];

  return (
    <button type="button" onClick={onSelect} dir={isRTL ? "rtl" : "ltr"}
      className={cn(
        "w-full rounded-2xl border p-4 text-start transition-[border-color,box-shadow] focus:outline-none",
        selected
          ? "border-[#22C55E]/60 bg-[#22C55E]/[0.06] shadow-[0_0_0_2px_rgba(34,197,94,0.25)]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]",
      )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <span className={cn(
            "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold",
            variation.tone === "feature" ? "bg-blue-500/15 text-blue-300"
              : variation.tone === "benefit" ? "bg-purple-500/15 text-purple-300"
                : "bg-amber-500/15 text-amber-300",
          )}>
            {label}
          </span>
          <p className="mt-1.5 text-[11px] text-white/40">{t(toneHintKey)}</p>
        </div>
        {selected && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#22C55E]">
            <Check className="size-3 text-white" />
          </span>
        )}
      </div>
      <div className="space-y-2">
        {slides.map((slide, i) => {
          const slideLabel = i === 0 ? t("slideHero") : i === 1 ? t("slideFeature") : t("slideSocial");
          return (
            <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-0.5">{slideLabel}</p>
              <p className="text-xs font-semibold text-white/80">{slide.headline}</p>
              <p className="text-[11px] text-white/45 leading-snug">{slide.subline}</p>
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScreenshotStudioClient(props: {
  workspaceId: string;
  creditsRemaining: number;
  plan?: string;
  onCreditsRemaining?: (n: number) => void;
  onRequestUpgrade?: () => void;
}) {
  const uiLocale = useLocale();
  const isUiAr = uiLocale === "ar";
  const t = useTranslations("screenshotStudio");
  const isFreePlan = !props.plan || props.plan === "free";
  const queryClient = useQueryClient();

  const [credits, setCredits] = useState(props.creditsRemaining);
  function updateCredits(n: number) { setCredits(n); props.onCreditsRemaining?.(n); }

  // ── Workspace apps ────────────────────────────────────────────────────────
  const appsQuery = useQuery({
    queryKey: workspaceAppsQueryKey(props.workspaceId),
    enabled: Boolean(props.workspaceId),
    staleTime: 0,
    queryFn: async (): Promise<AppRow[]> => {
      const res = await fetch(`/api/workspaces/${props.workspaceId}/apps`, { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; apps?: AppRow[]; rows?: AppRow[] };
      if (!res.ok || json.ok === false) throw new Error("Could not load apps");
      return json.apps ?? json.rows ?? [];
    },
  });
  const appsList = appsQuery.data ?? [];

  const [selectedAppId, setSelectedAppId] = useState("");
  useEffect(() => {
    if (appsList.length > 0 && !selectedAppId) setSelectedAppId(appsList[0].id);
  }, [appsList, selectedAppId]);

  const selectedApp = appsList.find((a) => a.id === selectedAppId) ?? null;
  const appId = selectedApp?.id ?? "";
  const appName = selectedApp?.name ?? "";
  const category = selectedApp?.category ?? "";
  const shortDescription = selectedApp?.short_description ?? "";

  // ── Mode ──────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"generate" | "vault">(
    searchParams.get("mode") === "vault" ? "vault" : "generate",
  );

  // ── Wizard step ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: configure ─────────────────────────────────────────────────────
  const [style, setStyle] = useState("Modern");
  const [brandColor, setBrandColor] = useState("");
  const [screenshotLocale, setScreenshotLocale] = useState<"en" | "ar">("en");
  const isScreenshotRTL = screenshotLocale === "ar";

  // ── Step 2: captions ──────────────────────────────────────────────────────
  const [captionVariations, setCaptionVariations] = useState<CaptionVariation[]>([]);
  const [selectedTone, setSelectedTone] = useState<CaptionTone | null>(null);
  const [captionsBusy, setCaptionsBusy] = useState(false);

  // ── Step 3: rendered slides (backgrounds + layout maps) ───────────────────
  const [renderedSlides, setRenderedSlides] = useState<RenderedSlide[]>([]);
  const [renderBusy, setRenderBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Vault: latest screenshot batch ───────────────────────────────────────
  const vaultKey = ["screenshot-studio-vault-latest", props.workspaceId, appId];
  const vaultQuery = useQuery({
    queryKey: vaultKey,
    enabled: Boolean(props.workspaceId && appId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RenderedSlide[]> => {
      const params = new URLSearchParams({
        workspaceId: props.workspaceId, appId, assetType: "screenshot", limit: "12",
      });
      const res = await fetch(`/api/brand-assets/vault?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        ok: boolean;
        assets?: {
          signedUrl: string;
          meta?: Record<string, unknown> | null;
          variantIndex?: number | null;
        }[];
      };
      if (!json.ok || !json.assets?.length) return [];
      const latestBatchId = (json.assets[0].meta as Record<string, unknown> | null)?.batchId as string | undefined;
      const batch = latestBatchId
        ? json.assets.filter((a) => (a.meta as Record<string, unknown> | null)?.batchId === latestBatchId)
        : json.assets.slice(0, 3);

      return batch.map((a) => {
        const meta = (a.meta ?? {}) as Record<string, unknown>;
        const lm = (meta.layoutMap ?? {}) as Partial<LayoutMap>;
        return {
          backgroundUrl: a.signedUrl,
          layoutMap: {
            backgroundPrompt: String(lm.backgroundPrompt ?? ""),
            negativeAdditions: String(lm.negativeAdditions ?? ""),
            textPosition: (lm.textPosition as LayoutMap["textPosition"]) ?? "bottom",
            textColor: (lm.textColor as LayoutMap["textColor"]) ?? "#ffffff",
            accentColor: String(lm.accentColor ?? "#22C55E"),
            accentColorSecondary: String((lm as Record<string,unknown>).accentColorSecondary ?? "#16a34a"),
            backgroundMood: String(lm.backgroundMood ?? ""),
            uiMockDescription: String(lm.uiMockDescription ?? ""),
            backgroundLuminance: ((lm as Record<string,unknown>).backgroundLuminance as "dark"|"light") ?? "dark",
          },
          slide: {
            position: Number(a.variantIndex ?? 0) + 1,
            headline: String(meta.headline ?? ""),
            subline: String(meta.subline ?? ""),
            uiFocus: String(lm.uiMockDescription ?? ""),
          },
        };
      });
    },
  });

  // Seed from vault on mount
  useEffect(() => {
    if (renderedSlides.length > 0 || renderBusy) return;
    if (vaultQuery.isLoading) { setStep(3); setRenderBusy(true); return; }
    setRenderBusy(false);
    if (!vaultQuery.data?.length) return;
    setRenderedSlides(vaultQuery.data);
    setStep(3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultQuery.data, vaultQuery.isLoading]);

  // Reset on app change
  useEffect(() => {
    setCaptionVariations([]); setSelectedTone(null); setRenderedSlides([]); setStep(1);
  }, [selectedAppId]);

  function requireApp() {
    if (!appId || !appName) { toast.message(t("noAppTitle"), { description: t("noAppBody") }); return false; }
    return true;
  }

  // ── Generate captions (Step 1 → 2) ───────────────────────────────────────
  async function runGenerateCaptions() {
    if (!requireApp()) return;
    const cost = AI_CREDIT_COSTS.screenshot_captions;
    if (credits < cost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: credits, req: cost }) }); return;
    }
    setCaptionsBusy(true);
    const tid = toast.loading(t("generatingCaptions"));
    try {
      const res = await fetch("/api/screenshot-studio/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: props.workspaceId, appId, appName, category,
          shortDescription: shortDescription || undefined,
          style,
          brandColor: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : undefined,
          locale: screenshotLocale,
        }),
      });
      const json = (await res.json()) as CaptionsOk | ApiErr;
      toast.dismiss(tid);
      if (!json.ok) {
        const err = (json as ApiErr).error;
        if (err.code === "insufficient_credits") {
          if (typeof err.remaining === "number") updateCredits(err.remaining);
          toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: err.remaining ?? credits, req: err.required ?? cost }) });
        } else { toast.error(err.message || t("captionsFailed")); }
        return;
      }
      const ok = json as CaptionsOk;
      setCaptionVariations(ok.variations);
      setSelectedTone(ok.variations[0]?.tone ?? null);
      if (typeof ok.meta?.creditsRemaining === "number") updateCredits(ok.meta.creditsRemaining);
      toast.success(t("captionsReady"));
      setStep(2);
    } catch { toast.dismiss(tid); toast.error(t("networkError")); }
    finally { setCaptionsBusy(false); }
  }

  // ── Render backgrounds (Step 2 → 3) ──────────────────────────────────────
  async function runRender() {
    if (!requireApp()) return;
    const selectedVariation = captionVariations.find((v) => v.tone === selectedTone);
    if (!selectedVariation) { toast.error(t("captionsFailed")); return; }

    const cost = AI_CREDIT_COSTS.screenshot_render;
    if (credits < cost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: credits, req: cost }) }); return;
    }
    setRenderBusy(true); setRenderedSlides([]);
    const tid = toast.loading(t("rendering"));
    try {
      const slides = screenshotLocale === "ar" ? selectedVariation.slidesAr : selectedVariation.slides;
      const res = await fetch("/api/screenshot-studio/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: props.workspaceId, appId, appName, category,
          shortDescription: shortDescription || undefined,
          style,
          brandColor: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : undefined,
          slides,
          locale: screenshotLocale,
        }),
      });
      const json = (await res.json()) as RenderOk | ApiErr;
      toast.dismiss(tid);
      if (!json.ok) {
        const err = (json as ApiErr).error;
        if (err.code === "insufficient_credits") {
          if (typeof err.remaining === "number") updateCredits(err.remaining);
          toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: err.remaining ?? credits, req: err.required ?? cost }) });
        } else { toast.error(err.message || t("renderFailed")); }
        return;
      }
      const ok = json as RenderOk;
      setRenderedSlides(ok.slides);
      if (typeof ok.meta?.creditsRemaining === "number") updateCredits(ok.meta.creditsRemaining);
      void queryClient.invalidateQueries({ queryKey: vaultKey });
      toast.success(t("rendersReady"));
      setStep(3);
    } catch { toast.dismiss(tid); toast.error(t("networkError")); }
    finally { setRenderBusy(false); }
  }

  // ── Export: bake-at-download canvas compositor ────────────────────────────
  // Consultant: FLUX background → SVG frame → system-font text, only at export.
  async function exportAll() {
    if (isFreePlan) { props.onRequestUpgrade?.(); return; }
    if (!renderedSlides.length) return;
    setExporting(true);
    const slug = appName.replace(/\s+/g, "-").toLowerCase();

    // Export sizes: Play Store (1080×1920) + App Store (1242×2208)
    const sizes = [
      { w: 1080, h: 1920, label: "play" },
      { w: 1242, h: 2208, label: "appstore" },
    ];

    try {
      for (let i = 0; i < renderedSlides.length; i++) {
        const { backgroundUrl, layoutMap, slide } = renderedSlides[i];
        // Only compose slides where we have actual caption copy
        const headline = slide.headline || "";
        const subline = slide.subline || "";

        for (const { w, h, label } of sizes) {
          const blob = await composeScreenshot({
            backgroundUrl, layoutMap, headline, subline,
            locale: screenshotLocale, targetW: w, targetH: h,
          });
          if (!blob) {
            // Fallback: direct download of raw background
            const a = Object.assign(document.createElement("a"), {
              href: backgroundUrl, download: `${slug}-screenshot-${label}-${i + 1}.png`, rel: "noopener",
            });
            document.body.appendChild(a); a.click(); a.remove();
            continue;
          }
          const u = URL.createObjectURL(blob);
          const a = Object.assign(document.createElement("a"), {
            href: u, download: `${slug}-screenshot-${label}-${i + 1}.png`, rel: "noopener",
          });
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(u);
        }
      }
      toast.success("All screenshots exported!");
    } catch { toast.error(t("networkError")); }
    finally { setExporting(false); }
  }

  const anyBusy = captionsBusy || renderBusy || exporting;

  return (
    <div dir={isUiAr ? "rtl" : "ltr"} className={cn("min-h-full w-full", isUiAr && "font-arabic")}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">

        {/* Header */}
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t("pageTitle")}</h1>
          <p className="text-sm leading-relaxed text-white/55 sm:text-base">{t("pageSubtitle")}</p>
        </div>

        {/* Architecture info badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-xs text-white/40">
          <Zap className="size-3.5 shrink-0 text-[#86efac]" />
          <span>
            <span className="text-[#86efac] font-medium">Gemini</span> layout engine →{" "}
            <span className="text-[#86efac] font-medium">FLUX</span> background →{" "}
            <span className="text-[#86efac] font-medium">Canvas</span> text + frame bake
          </span>
        </div>

        {/* Mode tabs */}
        <div className="mb-8 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {([
            { key: "generate" as const, label: t("tabGenerate"), icon: <Sparkles className="size-4 shrink-0" /> },
            { key: "vault" as const, label: t("tabVault"), icon: <Archive className="size-4 shrink-0" /> },
          ]).map(({ key, label, icon }) => (
            <button key={key} type="button" onClick={() => setMode(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none",
                mode === key ? "bg-[#22C55E]/15 text-[#86efac] ring-1 ring-[#22C55E]/30" : "text-white/45 hover:text-white/70",
              )}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Vault ─────────────────────────────────────────────────────── */}
        {mode === "vault" && (
          <ScreenshotVaultGrid workspaceId={props.workspaceId} appId={appId || undefined} />
        )}

        {/* ── Generate mode ─────────────────────────────────────────────── */}
        {mode === "generate" && (<>

          {/* App selector */}
          <div className="mb-8">
            {appsQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <Loader2 className="size-4 animate-spin text-white/40" />
                <span className="text-sm text-white/40">{t("loadingApps")}</span>
              </div>
            ) : appsList.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300/70" />
                <div>
                  <p className="text-sm font-semibold text-amber-200/90">{t("noAppTitle")}</p>
                  <p className="mt-0.5 text-xs leading-snug text-amber-200/60">{t("noAppBody")}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="ss-app" className="text-xs font-medium text-white/55">{t("appSelectorLabel")}</label>
                <div className="relative">
                  <select id="ss-app" value={selectedAppId} onChange={(e) => setSelectedAppId(e.target.value)} disabled={anyBusy}
                    className="w-full appearance-none rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 pe-10 text-sm text-white outline-none transition focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40">
                    {appsList.map((a) => <option key={a.id} value={a.id} className="bg-[#0c1018]">{a.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                </div>
              </div>
            )}
          </div>

          {/* Step bar */}
          <div className="mb-6 flex items-stretch rounded-xl border border-white/[0.07] bg-white/[0.02]">
            {([1, 2, 3] as Step[]).map((s, idx) => {
              const labels: Record<Step, string> = { 1: t("step1Label"), 2: t("step2Label"), 3: t("step3Label") };
              const reachable = s === 1 || (s === 2 && captionVariations.length > 0) || (s === 3 && renderedSlides.length > 0);
              return (
                <button key={s} type="button" onClick={() => { if (reachable) setStep(s); }} disabled={!reachable}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-xs font-medium transition-colors focus-visible:outline-none disabled:cursor-default",
                    idx === 0 ? "rounded-s-xl" : idx === 2 ? "rounded-e-xl" : "",
                    step === s ? "border-[#22C55E] text-[#86efac]"
                      : reachable ? "border-transparent text-white/40 hover:text-white/60"
                        : "border-transparent text-white/20",
                  )}>
                  <span className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    step === s ? "bg-[#22C55E] text-white"
                      : step > s ? "bg-[#22C55E]/20 text-[#86efac]"
                        : "bg-white/[0.08] text-white/35",
                  )}>
                    {step > s ? <Check className="size-2.5" /> : s}
                  </span>
                  <span className="hidden sm:inline">{labels[s]}</span>
                </button>
              );
            })}
          </div>

          {/* ══ STEP 1: Configure ════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

                {/* Style */}
                <div className="space-y-2.5">
                  <span className="text-xs font-medium text-white/60">{t("styleLabel")}</span>
                  <div className="flex flex-wrap gap-2">
                    {["Minimalist", "Modern", "Bold", "Playful", "Professional", "Flat Design"].map((s) => (
                      <button key={s} type="button" disabled={anyBusy} onClick={() => setStyle(s)}
                        className={cn(
                          "rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                          style === s ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]" : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80",
                        )}>
                        {t(`styles.${s}` as Parameters<typeof t>[0])}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brand colour */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-white/60">{t("brandColorLabel")}</span>
                    {brandColor && <button type="button" onClick={() => setBrandColor("")} className="ms-auto text-[10px] text-white/35 hover:text-white/60">{t("brandColorNone")}</button>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[{ hex: "#1A73E8" }, { hex: "#0B8043" }, { hex: "#D93025" }, { hex: "#E37400" }, { hex: "#7B1FA2" }].map(({ hex }) => (
                      <button key={hex} type="button" disabled={anyBusy}
                        onClick={() => setBrandColor(brandColor === hex ? "" : hex)}
                        className={cn("size-7 rounded-full border-2 transition-[border-color,transform,box-shadow] disabled:opacity-40",
                          brandColor === hex ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]" : "border-white/20 hover:border-white/50 hover:scale-105")}
                        style={{ backgroundColor: hex }} />
                    ))}
                    {brandColor && <span className="ms-1 font-mono text-[11px] text-white/40">{brandColor.toUpperCase()}</span>}
                  </div>
                </div>

                {/* Screenshot locale */}
                <div className="space-y-2.5">
                  <span className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                    <Globe className="size-3.5" />{t("localeLabel")}
                  </span>
                  <div className="flex gap-2">
                    {(["en", "ar"] as const).map((loc) => (
                      <button key={loc} type="button" disabled={anyBusy} onClick={() => setScreenshotLocale(loc)}
                        className={cn(
                          "rounded-lg border px-4 py-2 text-xs font-medium transition-colors disabled:opacity-40",
                          screenshotLocale === loc ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]" : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80",
                        )}>
                        {loc === "en" ? t("localeEn") : t("localeAr")}
                      </button>
                    ))}
                  </div>
                  {isScreenshotRTL && (
                    <p className="text-[11px] text-[#86efac]/70">
                      ✓ RTL layout — Gemini will draft Arabic copy, FLUX backgrounds leave right-side space for the phone frame, canvas text flows right-to-left.
                    </p>
                  )}
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
                <Sparkles className="size-3 shrink-0" />{t("captionsCredits")}
              </div>

              <button type="button" disabled={captionsBusy || !appId || appsQuery.isLoading} onClick={() => { void runGenerateCaptions(); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                {captionsBusy ? <><Loader2 className="size-4 animate-spin" />{t("generatingCaptions")}</> : <><Zap className="size-4" />{t("generateCaptions")}</>}
              </button>
            </div>
          )}

          {/* ══ STEP 2: Choose copy tone ══════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-white/55">{t("captionsReady")}</p>
              <div className="grid gap-4 lg:grid-cols-3">
                {captionVariations.map((v) => (
                  <ToneCard key={v.tone} variation={v}
                    selected={selectedTone === v.tone}
                    onSelect={() => setSelectedTone(v.tone)}
                    locale={screenshotLocale}
                    isRTL={isScreenshotRTL}
                  />
                ))}
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-1">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">What happens next</p>
                <p className="text-xs text-white/50">
                  Gemini builds a layout map for each slide → FLUX generates pure atmospheric backgrounds (no text) →
                  your phone frame and text are composited at export time for pixel-perfect sharpness.
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
                <Sparkles className="size-3 shrink-0" />{t("renderCredits")}
              </div>

              <button type="button" disabled={renderBusy || !selectedTone || !appId} onClick={() => { void runRender(); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                {renderBusy ? <><Loader2 className="size-4 animate-spin" />{t("rendering")}</> : <><Smartphone className="size-4" />{t("renderScreenshots")}</>}
              </button>

              <div className="border-t border-white/[0.06] pt-4">
                <button type="button" onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                  <ArrowLeft className="size-3.5" />{t("backToConfigure")}
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 3: Review & Export ════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-white/55">{t("rendersReady")}</p>
                {renderedSlides.length > 0 && !renderBusy && vaultQuery.data?.length === renderedSlides.length && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/40">
                    <Archive className="size-3 shrink-0" />{t("fromVault")}
                  </span>
                )}
              </div>

              {/* Skeleton while vault/render in flight */}
              {renderBusy && renderedSlides.length === 0 && (
                <>
                  <p className="text-xs text-white/35">
                    {vaultQuery.isLoading ? t("vaultLoading") : t("rendering")}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[0, 1, 2].map((i) => <ScreenshotSkeleton key={i} />)}
                  </div>
                </>
              )}

              {/* Preview: clean FLUX backgrounds (no composite in preview — bake only at export) */}
              {renderedSlides.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] text-white/30">
                    Preview shows raw FLUX backgrounds. Phone frame + text are composited at export.
                  </p>
                  <div dir={isScreenshotRTL ? "rtl" : "ltr"} className="grid grid-cols-3 gap-3">
                    {renderedSlides.map(({ backgroundUrl, slide }, i) => (
                      <div key={`${i}-${backgroundUrl.slice(0, 32)}`}
                        className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 transition hover:border-white/[0.2]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={backgroundUrl} alt="" className="h-full w-full object-cover transition duration-200 motion-safe:group-hover:scale-[1.02]" />

                        {/* Slide label */}
                        <div className="absolute start-2 top-2">
                          <span className="inline-flex items-center rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/70 backdrop-blur-sm">
                            {i === 0 ? t("slideHero") : i === 1 ? t("slideFeature") : t("slideSocial")}
                          </span>
                        </div>

                        {/* Mood badge */}
                        {renderedSlides[i].layoutMap.backgroundMood && (
                          <div className="absolute bottom-2 start-2 end-2">
                            <span className="inline-flex items-center rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] text-white/50 backdrop-blur-sm truncate">
                              {renderedSlides[i].layoutMap.backgroundMood}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Export */}
              {renderedSlides.length > 0 && (
                isFreePlan ? (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                    <Lock className="size-4 shrink-0 text-amber-300/75" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-200/90">{t("downloadLockedTitle")}</p>
                      <p className="mt-0.5 text-[11px] text-amber-200/55">{t("downloadLockedBody")}</p>
                    </div>
                    {props.onRequestUpgrade && (
                      <button type="button" onClick={props.onRequestUpgrade}
                        className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300/90 hover:bg-amber-400/18">
                        {t("upgrade")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button type="button" disabled={exporting} onClick={() => { void exportAll(); }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                      {exporting
                        ? <><Loader2 className="size-4 animate-spin" />Compositing &amp; exporting…</>
                        : <><Download className="size-4" />{t("exportAll")}</>}
                    </button>
                    <p className="text-center text-[11px] text-white/30">
                      {t("exportPlayStore")} + {t("exportAppStore")} — phone frame + text composited on download
                    </p>
                  </div>
                )
              )}

              <div className="border-t border-white/[0.06] pt-4 flex gap-4">
                {captionVariations.length > 0 && (
                  <button type="button" onClick={() => setStep(2)}
                    className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                    <ArrowLeft className="size-3.5" />{t("backToCaption")}
                  </button>
                )}
                <button type="button" onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                  <ArrowLeft className="size-3.5" />{t("backToConfigure")}
                </button>
              </div>
            </div>
          )}

        </>)} {/* end generate mode */}
      </div>
    </div>
  );
}

// ── Screenshot Vault Grid ─────────────────────────────────────────────────────

function ScreenshotVaultGrid({ workspaceId, appId }: { workspaceId: string; appId?: string }) {
  const t = useTranslations("screenshotStudio.vault");
  const [assets, setAssets] = useState<{ id: string; signedUrl: string; fileName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  async function load(reset = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceId, assetType: "screenshot", limit: "24" });
      if (appId) params.set("appId", appId);
      if (!reset) params.set("offset", String(offset));
      const res = await fetch(`/api/brand-assets/vault?${params}`, { credentials: "include" });
      const json = (await res.json()) as { ok: boolean; assets?: typeof assets; hasMore?: boolean };
      if (!json.ok || !json.assets) return;
      setAssets(reset ? json.assets : (prev) => [...prev, ...json.assets!]);
      setHasMore(json.hasMore ?? false);
      if (!reset) setOffset((o) => o + json.assets!.length);
    } catch { toast.error(t("loadError")); }
    finally { setLoading(false); }
  }

  useEffect(() => { setOffset(0); setAssets([]); void load(true); }, [workspaceId, appId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && assets.length === 0) {
    return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-white/30" /></div>;
  }
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Smartphone className="size-10 text-white/15" />
        <p className="text-sm font-medium text-white/40">{t("empty")}</p>
        <p className="text-xs text-white/25">{t("emptyHint")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {assets.map((a) => (
          <div key={a.id} className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-white/[0.08] bg-black/30 hover:border-white/[0.2] transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.signedUrl} alt={a.fileName} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 flex items-end justify-end p-1.5 opacity-0 transition group-hover:opacity-100">
              <button type="button" title={t("download")}
                onClick={() => {
                  const el = Object.assign(document.createElement("a"), { href: a.signedUrl, download: a.fileName, rel: "noopener" });
                  document.body.appendChild(el); el.click(); el.remove();
                }}
                className="flex size-7 items-center justify-center rounded-lg bg-black/70 text-white/80 backdrop-blur-sm hover:bg-[#22C55E]/80 hover:text-white">
                <Download className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <button type="button" disabled={loading} onClick={() => { void load(false); }}
            className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] disabled:opacity-40">
            {loading ? <Loader2 className="size-4 animate-spin inline me-2" /> : null}{t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
