"use client";

/**
 * BrandAssetsClient — Unified Creative Studio.
 *
 * Three native tabs:
 *   • App Icon        — shared AppIconGenerator component
 *   • Feature Graphic — inline Runware banner generation (Configure → Pick & Download)
 *   • Screenshots     — Gemini captions → FLUX backgrounds → Canvas bake-at-export
 *
 * Single "My Vault" view shows all asset types (icons, banners, screenshots).
 * Screenshot language/RTL is inferred from the app's UI locale — no toggle needed.
 * All styles mirror the Brand Kit / Feature Graphic sections exactly.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Sparkles, ArrowLeft, Check, Lock,
  Image as ImageIcon, Layers, Zap, ChevronDown, Archive, Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { workspaceAppsQueryKey } from "@/hooks/use-app-limits";
import { parseLogoGeneratorMetadata } from "@/lib/apps/logo-generator-metadata";
import { saveGeneratedAssetsToVault } from "@/lib/brand-assets/save-to-vault";
import { VaultGrid } from "@/components/brand-assets/VaultGrid";
import { cn } from "@/lib/utils";
import { AppIconGenerator } from "@/components/shared/AppIconGenerator";
// CaptionVariation/CaptionTone no longer used in UI (fused into generate-pack endpoint)
import type { LayoutMap } from "@/lib/gemini/generate-screenshot-layout";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "logo" | "banner" | "screenshot";
type BannerPage = 1 | 2;
type ScreenshotStep = 1 | 2; // 1=Configure, 2=Review & Export (collapsed from 3)

type AppRow = {
  id: string; name: string;
  category?: string | null; short_description?: string | null;
  metadata?: Record<string, unknown> | null;
};
type GenOk = { ok: true; images: string[]; meta?: { creditsCharged?: number; creditsRemaining?: number } };
type GenErr = { ok: false; error: { code?: string; message: string; remaining?: number; required?: number } };
// CaptionsOk removed — captions are now fused server-side in generate-pack
type RenderedSlide = {
  backgroundUrl: string;
  layoutMap: LayoutMap;
  slide: { position: number; headline: string; subline: string; uiFocus: string };
};
type RenderOk = { ok: true; slides: RenderedSlide[]; batchId?: string; optimizedForConversion?: boolean; meta?: { creditsCharged?: number; creditsRemaining?: number } };
// Job pattern — generate route returns 202 with jobId
type JobAccepted = { ok: true; jobId: string; status: "pending"; meta?: { creditsCharged?: number; creditsRemaining?: number } };
type JobStatus = { ok: true; job: { id: string; status: string; progress: number; total: number; slides: RenderedSlide[]; optimizedForConversion: boolean; creditsCharged?: number | null; creditsRemaining?: number | null; errorMessage?: string | null } };

// ── Shared skeleton ───────────────────────────────────────────────────────────

function Skeleton({ aspect }: { aspect: string }) {
  return (
    <div className={`relative ${aspect} overflow-hidden rounded-xl border border-white/[0.08] bg-black/30`} aria-hidden>
      <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.09] to-transparent bg-[length:180%_100%]" />
    </div>
  );
}

// ── SVG Google Pixel 9 Pro — Android-only, hard-coded, no iOS assets ─────────
//
// Distinguishing Android authenticity markers vs iPhone/iOS:
//   ✓ PILL-SHAPED front camera (Pixel 9 Pro) — NOT a circle (generic) or
//     Dynamic Island cutout (iPhone 15/16). The pill is Android-exclusive.
//   ✓ USB-C port centred at the bottom — Apple uses Lightning/USB-C but the
//     port shape + position differ; combined with dual speakers it reads Android.
//   ✓ DUAL bottom speaker grilles (left + right of USB-C) — iPhones have one
//     speaker grille slot. Dual symmetric grilles = Android flagship signature.
//   ✓ Volume UP + Volume DOWN as two separate buttons on the LEFT side — iOS
//     devices have a mute toggle + two volume buttons; Pixel has two clean bars.
//   ✓ Power/lock button on the RIGHT — standard Android placement.
//   ✓ No notch, no Dynamic Island, no Face ID sensor bar — Pixel-correct.
//
// Viewbox 320×690 — proportionally scaled by compositor to fill frame zone.
// Drop-shadow and screen-sheen parameters preserved from previous version.

const PIXEL9_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 690" fill="none">
  <defs>
    <linearGradient id="pg9sheen" x1="0" y1="0" x2="0.28" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="pg9body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#232323"/>
      <stop offset="100%" stop-color="#141414"/>
    </linearGradient>
  </defs>

  <!-- ── Body ── Pixel 9 Pro has slightly flatter sides than rounded predecessors -->
  <rect x="5" y="1" width="310" height="688" rx="44" ry="44" fill="url(#pg9body)" stroke="#2e2e2e" stroke-width="1.2"/>

  <!-- ── Screen glass inset ── -->
  <rect x="13" y="11" width="294" height="668" rx="36" ry="36" fill="#040404"/>

  <!-- ── Active screen area ── -->
  <rect x="17" y="34" width="286" height="630" rx="28" ry="28" fill="#080808"/>

  <!-- ── Pill-shaped front camera (ANDROID / Pixel 9 Pro signature) ──
       A pill punch-hole is the definitive visual marker of modern Pixel phones.
       iPhones use a circle (iPhone 14 and earlier) or Dynamic Island (15/16).
       This pill shape is immediately recognisable as Android to any viewer. -->
  <rect x="144" y="17" width="32" height="14" rx="7" ry="7" fill="#040404"/>
  <!-- Camera lens inside the pill -->
  <circle cx="160" cy="24" r="4.5" fill="#0c0c0c"/>
  <circle cx="160" cy="24" r="2.8" fill="#111"/>
  <!-- Subtle lens sheen -->
  <circle cx="158.5" cy="22.5" r="1" fill="#1e1e1e" opacity="0.6"/>

  <!-- ── Left side: Volume UP then Volume DOWN (two separate bars) ── -->
  <rect x="0" y="168" width="4.5" height="48" rx="2.25" fill="#252525"/>
  <rect x="0" y="228" width="4.5" height="78" rx="2.25" fill="#252525"/>

  <!-- ── Right side: Power / lock button ── -->
  <rect x="315.5" y="192" width="4.5" height="68" rx="2.25" fill="#252525"/>

  <!-- ── Bottom: USB-C port + dual speaker grilles (ANDROID signature) ──
       Symmetrical dual speaker grilles flanking a USB-C port is a hallmark
       of Android flagships (Pixel, Samsung Galaxy, etc.).
       iPhones have one asymmetric speaker grille slot — never this layout. -->
  <!-- Left speaker grille — 7 dots -->
  <circle cx="96"  cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="104" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="112" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="120" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="128" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="136" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="144" cy="678" r="2.2" fill="#1c1c1c"/>
  <!-- USB-C port -->
  <rect x="148" y="673" width="24" height="8" rx="4" fill="#111"/>
  <!-- Right speaker grille — 7 dots (mirror of left) -->
  <circle cx="176" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="184" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="192" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="200" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="208" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="216" cy="678" r="2.2" fill="#1c1c1c"/>
  <circle cx="224" cy="678" r="2.2" fill="#1c1c1c"/>

  <!-- ── Top earpiece speaker (small bar — Pixel 9 Pro style) ── -->
  <rect x="128" y="8" width="64" height="4" rx="2" fill="#1a1a1a"/>

  <!-- ── Screen sheen — preserved from previous version ── -->
  <rect x="17" y="34" width="286" height="630" rx="28" ry="28" fill="url(#pg9sheen)" opacity="0.035"/>
</svg>`;

// ── Hex → RGB helper ──────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ── Brand Mirror canvas compositor (bake-at-export) ──────────────────────────
//
// Android-only. Output: exactly 1080×1920 px, lossless PNG. No iOS sizes.
//
// Pipeline:
//  1. FLUX background — full-bleed, scaled to 1080×1920
//  2. Brand gradient overlay — constrained exactly to canvas bounds (no edge bleeding)
//  3. Bottom fade — constrained to canvas bounds
//  4. Android Pixel 9 frame — right (LTR) or left (RTL)
//  5. Text block with auto-shrink font guard + Arabic-aware backdrop sizing
//  6. PNG export (lossless — zero text compression artefacts)

async function composeScreenshot(opts: {
  backgroundUrl: string;
  layoutMap: LayoutMap;
  headline: string;
  subline: string;
  isRTL: boolean;
  targetW: number; // always 1080
  targetH: number; // always 1920
}): Promise<Blob | null> {
  const { backgroundUrl, layoutMap, headline, subline, isRTL, targetW, targetH } = opts;

  // ── 1. Fetch FLUX background ────────────────────────────────────────────────
  let bgBlob: Blob | null = null;
  try {
    const r = await fetch(backgroundUrl, { mode: "cors", credentials: "omit", cache: "no-store" });
    if (r.ok) bgBlob = await r.blob();
  } catch { /**/ }
  if (!bgBlob) return null;

  const bgBmp = await createImageBitmap(bgBlob).catch(() => null);
  if (!bgBmp) return null;

  // ── 2. Canvas at exact Android spec: 1080×1920, never modified ─────────────
  const canvas = document.createElement("canvas");
  canvas.width  = targetW; // 1080
  canvas.height = targetH; // 1920
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Scale FLUX source (1024×1792) up to fill 1080×1920 — no letterbox, no gaps
  ctx.drawImage(bgBmp, 0, 0, targetW, targetH);
  bgBmp.close();

  // ── 3. Brand gradient overlay — STRICTLY clipped to (0,0,targetW,targetH) ──
  // FIX: Both gradient fillRects use exact canvas bounds — no overflow possible.
  const [r1, g1, b1] = hexToRgb(layoutMap.accentColor);
  const [r2, g2, b2] = hexToRgb(
    (layoutMap as LayoutMap & { accentColorSecondary?: string }).accentColorSecondary
      ?? layoutMap.accentColor,
  );
  const isDark = layoutMap.backgroundLuminance !== "light";

  // Lateral brand gradient: from text-side edge → transparent → frame side
  // Gradient endpoints are clamped to [0, targetW] so paint never bleeds outside.
  const gradX0 = isRTL ? 0          : targetW;
  const gradX1 = isRTL ? targetW * 0.55 : targetW * 0.45;
  const grad = ctx.createLinearGradient(gradX0, 0, gradX1, 0);
  grad.addColorStop(0,   `rgba(${r1},${g1},${b1},${isDark ? 0.42 : 0.28})`);
  grad.addColorStop(0.5, `rgba(${r2},${g2},${b2},${isDark ? 0.16 : 0.09})`);
  grad.addColorStop(1,   `rgba(${r1},${g1},${b1},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, targetW, targetH); // exact canvas bounds

  // Vertical bottom-fade: from transparent at 55% height → dark at exact bottom
  const fadeGrad = ctx.createLinearGradient(0, targetH * 0.55, 0, targetH);
  fadeGrad.addColorStop(0, "rgba(0,0,0,0)");
  fadeGrad.addColorStop(1, isDark ? "rgba(0,0,0,0.52)" : "rgba(0,0,0,0.14)");
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, 0, targetW, targetH); // exact canvas bounds — no edge bleed

  // ── 4. Android Pixel 9 phone frame ─────────────────────────────────────────
  const PAD    = Math.round(targetW * 0.035);
  const frameW = Math.round(targetW * 0.40);         // 40% of 1080 = 432px
  const frameH = Math.round(frameW / (320 / 690));   // preserve 320:690 ≈ 0.464 ratio
  const frameX = isRTL ? PAD : targetW - frameW - PAD;
  const frameY = Math.round((targetH - frameH) / 2);

  const svgBlobFrame = new Blob([PIXEL9_SVG], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlobFrame);
  try {
    const svgImg = new Image();
    await new Promise<void>((resolve, reject) => {
      svgImg.onload = () => resolve();
      svgImg.onerror = reject;
      svgImg.src = svgUrl;
    });
    ctx.save();
    ctx.shadowColor    = "rgba(0,0,0,0.52)";
    ctx.shadowBlur     = Math.round(targetW * 0.038);
    ctx.shadowOffsetX  = isRTL ? -Math.round(targetW * 0.008) : Math.round(targetW * 0.008);
    ctx.shadowOffsetY  = Math.round(targetW * 0.018);
    ctx.drawImage(svgImg, frameX, frameY, frameW, frameH);
    ctx.restore();
  } catch { /**/ } finally {
    URL.revokeObjectURL(svgUrl);
  }

  // ── 5. Text block ───────────────────────────────────────────────────────────
  // Text occupies the opposite side from the phone frame.
  const innerPad  = Math.round(targetW * 0.052);
  const textAreaX = isRTL ? frameX + frameW + Math.round(targetW * 0.022) : innerPad;
  const textAreaW = isRTL
    ? targetW - textAreaX - innerPad    // RTL: after frame → right edge
    : frameX  - innerPad * 1.4;        // LTR: left edge → before frame

  const textCenterY =
    layoutMap.textPosition === "top"    ? Math.round(targetH * 0.21) :
    layoutMap.textPosition === "center" ? Math.round(targetH * 0.49) :
                                          Math.round(targetH * 0.69);

  const textColor   = layoutMap.textColor ?? "#ffffff";
  const isLightText = textColor === "#ffffff";
  const textX       = isRTL ? textAreaX + textAreaW : textAreaX;

  const fontFamily = `-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif`;
  // Non-null alias — TypeScript loses narrowing inside nested function closures.
  // ctx is guaranteed non-null here (we returned null above if !ctx).
  const c = ctx;

  // ── AUTO-SHRINK: start at max size, reduce 10% per step until text fits ────
  // FIX: Prevents "overconsumptio" style clipping on long words/Arabic script.
  // Applied to each text block independently — headline and subline shrink separately.
  function fitFontSize(
    text: string,
    weight: string,
    startPx: number,
    maxW: number,
    maxLines: number,
  ): { size: number; lines: string[] } {
    let size = startPx;
    const MIN_SIZE = Math.round(startPx * 0.45); // floor at 45% of start size
    while (size >= MIN_SIZE) {
      c.font = `${weight} ${size}px ${fontFamily}`;
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      let overflows = false;
      for (const w of words) {
        const candidate = line ? `${line} ${w}` : w;
        // Single word wider than maxW — this word itself overflows at current size
        if (!line && c.measureText(w).width > maxW) { overflows = true; break; }
        if (c.measureText(candidate).width > maxW && line) {
          lines.push(line);
          line = w;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
      if (!overflows && lines.length <= maxLines) return { size, lines };
      size = Math.round(size * 0.90); // shrink 10%
    }
    // Hard floor — render at minimum size even if still long (pathological case)
    c.font = `${weight} ${size}px ${fontFamily}`;
    return { size, lines: [text] };
  }

  // Headline: start 62px@1080, max 3 lines
  const hStart = Math.round(targetW * 0.0574); // 62px at 1080
  const { size: hSize, lines: hLines } = fitFontSize(headline, "bold", hStart, textAreaW, 3);
  const lineH   = Math.round(hSize * 1.24);
  const hBlockH = hLines.length * lineH;

  // Subline: start 36px@1080, max 2 lines
  const subStart = Math.round(targetW * 0.0333); // 36px at 1080
  const { size: subSize, lines: subLines } = fitFontSize(subline, "500", subStart, textAreaW, 2);
  const subLineH  = Math.round(subSize * 1.42);
  const subBlockH = subLines.length * subLineH;

  const gapBetween  = Math.round(hSize * 0.38);
  const totalTextH  = hBlockH + gapBetween + subBlockH;
  let ty = textCenterY - totalTextH / 2;

  // ── ARABIC BACKDROP: measure actual rendered width after font is set ────────
  // FIX: For RTL/Arabic, measure the maximum real pixel width of rendered lines
  // and size the backdrop pill from that, not from the textAreaW box.
  // This prevents Arabic glyphs being cropped by an undersized pill.
  function maxRenderedWidth(lines: string[], weight: string, size: number): number {
    c.font = `${weight} ${size}px ${fontFamily}`;
    return lines.reduce((mx, l) => Math.max(mx, c.measureText(l).width), 0);
  }

  const hMaxW   = maxRenderedWidth(hLines,   "bold", hSize);
  const subMaxW = maxRenderedWidth(subLines, "500",  subSize);
  // For Arabic: use the max measured width + comfortable padding.
  // For LTR: use the full textAreaW (design looks intentional at full width).
  const renderedContentW = isRTL
    ? Math.min(Math.max(hMaxW, subMaxW) + Math.round(targetW * 0.02), textAreaW)
    : textAreaW;

  // ── 5a. Frosted brand-tinted backdrop pill ──────────────────────────────────
  const bPad  = { x: Math.round(targetW * 0.038), y: Math.round(targetW * 0.028) };
  // RTL: anchor pill to right edge of text area, sized by actual content width
  // LTR: anchor to left edge of text area
  const backdropW = renderedContentW + bPad.x * 2;
  const backdropX = isRTL
    ? (textAreaX + textAreaW) - backdropW   // right-anchor for Arabic
    : textAreaX - bPad.x;
  const backdropY = ty - bPad.y;
  const backdropH = totalTextH + bPad.y * 2;
  const backdropR = Math.round(targetW * 0.022);

  const [ba_r, ba_g, ba_b] = hexToRgb(layoutMap.accentColor);
  const backdropAlpha = isDark ? 0.26 : 0.16;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(backdropX, backdropY, backdropW, backdropH, backdropR);
  ctx.fillStyle   = `rgba(${ba_r},${ba_g},${ba_b},${backdropAlpha})`;
  ctx.fill();
  ctx.strokeStyle = isLightText ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.07)";
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.restore();

  // ── 5b. Headline ────────────────────────────────────────────────────────────
  ctx.font         = `bold ${hSize}px ${fontFamily}`;
  ctx.textAlign    = isRTL ? "right" : "left";
  ctx.textBaseline = "top";
  ctx.shadowColor  = isLightText ? "rgba(0,0,0,0.48)" : "rgba(255,255,255,0.28)";
  ctx.shadowBlur   = Math.round(targetW * 0.007);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(targetW * 0.0018);
  ctx.fillStyle    = textColor;
  for (const line of hLines) {
    ctx.fillText(line, textX, ty, textAreaW);
    ty += lineH;
  }

  // ── 5c. Subline ─────────────────────────────────────────────────────────────
  ty += gapBetween;
  ctx.font      = `500 ${subSize}px ${fontFamily}`;
  ctx.shadowBlur = Math.round(targetW * 0.004);
  ctx.fillStyle  = isLightText ? "rgba(255,255,255,0.86)" : "rgba(15,15,15,0.76)";
  for (const line of subLines) {
    ctx.fillText(line, textX, ty, textAreaW);
    ty += subLineH;
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;

  // ── 6. Lossless PNG export — razor-sharp text, zero compression ─────────────
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

// ── Tone card (screenshot step 2) ─────────────────────────────────────────────



// ── Main component ────────────────────────────────────────────────────────────

export function BrandAssetsClient(props: {
  workspaceId: string;
  initialAppId?: string;
  creditsRemaining: number;
  plan?: string;
  onCreditsRemaining?: (n: number) => void;
  onRequestUpgrade?: () => void;
}) {
  const locale = useLocale();
  const isAr = locale === "ar";           // UI language
  const isRTL = isAr;                     // screenshot layout inferred from UI locale — no toggle
  const t = useTranslations("brandAssets");
  const isFreePlan = !props.plan || props.plan === "free";
  const queryClient = useQueryClient();

  // ── Credits ──────────────────────────────────────────────────────────────
  const [credits, setCredits] = useState(props.creditsRemaining);
  function updateCredits(n: number) { setCredits(n); props.onCreditsRemaining?.(n); }

  // ── Apps query ────────────────────────────────────────────────────────────
  const appsQuery = useQuery({
    queryKey: workspaceAppsQueryKey(props.workspaceId),
    enabled: Boolean(props.workspaceId),
    staleTime: 0,
    queryFn: async (): Promise<AppRow[]> => {
      const res = await fetch(`/api/workspaces/${props.workspaceId}/apps`, { credentials: "include" });
      const raw = await res.text();
      let json: unknown;
      try { json = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Apps fetch failed (${res.status})`); }
      const body = json as { ok?: boolean; apps?: AppRow[]; rows?: AppRow[] };
      if (!res.ok || body.ok === false) throw new Error("Could not load apps");
      return body.apps ?? body.rows ?? [];
    },
  });
  const appsList: AppRow[] = appsQuery.data ?? [];

  // ── App selection ─────────────────────────────────────────────────────────
  const [selectedAppId, setSelectedAppId] = useState<string>(props.initialAppId ?? "");
  useEffect(() => { if (appsList.length > 0 && !selectedAppId) setSelectedAppId(appsList[0].id); }, [appsList, selectedAppId]);
  const selectedApp = appsList.find((a) => a.id === selectedAppId) ?? null;
  const appId = selectedApp?.id ?? "";
  const appName = selectedApp?.name ?? "";
  const category = selectedApp?.category ?? "";
  const shortDescription = selectedApp?.short_description ?? "";

  // ── Mode: Generate vs My Vault ────────────────────────────────────────────
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"generate" | "vault">(searchParams.get("mode") === "vault" ? "vault" : "generate");

  // ── Tab (within Generate) — supports ?tab=screenshot deep link ────────────
  const initialTab = (searchParams.get("tab") as Tab | null);
  const [tab, setTab] = useState<Tab>(
    initialTab === "screenshot" ? "screenshot" : initialTab === "banner" ? "banner" : "logo",
  );

  // ── Guard ─────────────────────────────────────────────────────────────────
  function requireApp(): boolean {
    if (!appId || !appName) { toast.message(t("noAppTitle"), { description: t("noAppBody") }); return false; }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BANNER STATE & LOGIC (unchanged from original)
  // ═══════════════════════════════════════════════════════════════════════════

  const [bannerPage, setBannerPage] = useState<BannerPage>(1);
  const [bannerImages, setBannerImages] = useState<string[]>([]);
  const [bannerSelected, setBannerSelected] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);       // true ONLY during live Runware generation
  const [bannerVaultLoading, setBannerVaultLoading] = useState(false); // true ONLY while vault seed is loading
  const [bannerTheme, setBannerTheme] = useState("");
  const [bannerStyle, setBannerStyle] = useState("Modern");
  const [bannerColor, setBannerColor] = useState("");
  const [bannerAddIcon, setBannerAddIcon] = useState(false);
  const [bannerHeadline, setBannerHeadline] = useState("");
  const [bannerSubline, setBannerSubline] = useState("");
  const [kitBusy, setKitBusy] = useState(false);

  const latestVaultBannerKey = ["brand-assets-vault-latest", props.workspaceId, appId];
  const latestVaultBannerQuery = useQuery({
    queryKey: latestVaultBannerKey,
    enabled: Boolean(props.workspaceId && appId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const params = new URLSearchParams({ workspaceId: props.workspaceId, appId, assetType: "banner", limit: "16" });
      const res = await fetch(`/api/brand-assets/vault?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = (await res.json()) as { ok: boolean; assets?: { signedUrl: string; meta?: Record<string, unknown> | null }[] };
      if (!json.ok || !json.assets?.length) return [];
      const latestBatchId = (json.assets[0].meta as Record<string, unknown> | null)?.batchId as string | undefined;
      if (latestBatchId) return json.assets.filter((a) => (a.meta as Record<string, unknown> | null)?.batchId === latestBatchId).map((a) => a.signedUrl);
      return json.assets.slice(0, 4).map((a) => a.signedUrl);
    },
  });

  useEffect(() => { setBannerImages([]); setBannerSelected(null); setBannerPage(1); if (shortDescription) setBannerHeadline(shortDescription.split(".")[0].trim().slice(0, 40)); }, [selectedAppId, shortDescription]);
  // Vault-seed skeleton: show page 2 with shimmer while vault query loads.
  // Uses bannerVaultLoading — NOT bannerBusy — so it never disables other tab controls.
  useEffect(() => { if (bannerImages.length > 0) return; if (!latestVaultBannerQuery.isLoading) return; setBannerPage(2); setBannerVaultLoading(true); }, [latestVaultBannerQuery.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bannerImages.length > 0) return; if (latestVaultBannerQuery.isLoading) return; setBannerVaultLoading(false); if (!latestVaultBannerQuery.data?.length) return; setBannerImages(latestVaultBannerQuery.data); setBannerPage(2); }, [latestVaultBannerQuery.data, latestVaultBannerQuery.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runBannerGenerate() {
    if (!requireApp()) return;
    const cost = AI_CREDIT_COSTS.banner_generation;
    if (credits < cost) { toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: credits, req: cost }) }); return; }
    setBannerBusy(true); setBannerImages([]); setBannerSelected(null); setBannerPage(2);
    const tid = toast.loading(t("generatingBanners"));
    try {
      const body: Record<string, unknown> = { workspaceId: props.workspaceId, appId, appName, category, style: bannerStyle };
      if (shortDescription.trim()) body.shortDescription = shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(bannerColor)) body.brandColor = bannerColor;
      if (bannerTheme.trim()) body.theme = bannerTheme.trim();
      const res = await fetch("/api/brand-assets/banner-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as GenOk | GenErr;
      toast.dismiss(tid);
      if (!json.ok) {
        setBannerPage(1);
        const err = (json as GenErr).error;
        if (err.code === "insufficient_credits") { if (typeof err.remaining === "number") updateCredits(err.remaining); toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: err.remaining ?? credits, req: err.required ?? cost }) }); }
        else toast.error(err.message?.trim() || t("generationFailed"));
        return;
      }
      const ok = json as GenOk;
      const urls = ok.images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4);
      setBannerImages(urls);
      if (urls.length > 0) {
        const batchId = crypto.randomUUID();
        void saveGeneratedAssetsToVault({ workspaceId: props.workspaceId, appId, assetType: "banner", imageUrls: urls, batchId, meta: { style: bannerStyle, brandColor: bannerColor || undefined, theme: bannerTheme || undefined } });
      }
      if (typeof ok.meta?.creditsRemaining === "number") updateCredits(ok.meta.creditsRemaining);
      void queryClient.invalidateQueries({ queryKey: latestVaultBannerKey });
      toast.success(t("bannersReady"));
    } catch { toast.dismiss(tid); toast.error(t("networkError")); setBannerPage(1); }
    finally { setBannerBusy(false); }
  }

  async function runBrandKit() {
    if (!requireApp()) return;
    const cost = AI_CREDIT_COSTS.brand_kit_batch;
    if (credits < cost) { toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: credits, req: cost }) }); return; }
    setKitBusy(true); setBannerImages([]); setBannerSelected(null);
    const tid = toast.loading(t("generatingKit"));
    try {
      const logoBody: Record<string, unknown> = { workspaceId: props.workspaceId, appId, appName, category, style: bannerStyle };
      if (shortDescription.trim()) logoBody.shortDescription = shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(bannerColor)) logoBody.brandColor = bannerColor;
      const bannerBody = { ...logoBody }; if (bannerTheme.trim()) (bannerBody as Record<string, unknown>).theme = bannerTheme.trim();
      const [logoRes, bannerRes] = await Promise.all([
        fetch("/api/listings/logo-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logoBody) }),
        fetch("/api/brand-assets/banner-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bannerBody) }),
      ]);
      const [logoJson, bannerJson] = await Promise.all([logoRes.json() as Promise<GenOk | GenErr>, bannerRes.json() as Promise<GenOk | GenErr>]);
      toast.dismiss(tid);
      const bannerUrls = bannerJson.ok ? (bannerJson as GenOk).images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4) : [];
      setBannerImages(bannerUrls);
      const lastCredits = bannerJson.ok ? (bannerJson as GenOk).meta?.creditsRemaining : logoJson.ok ? (logoJson as GenOk).meta?.creditsRemaining : undefined;
      if (typeof lastCredits === "number") updateCredits(lastCredits);
      if ((logoJson.ok && (logoJson as GenOk).images.length > 0) || bannerUrls.length > 0) {
        toast.success(t("kitReady"));
        if (bannerUrls.length > 0) { setTab("banner"); setBannerPage(2); void queryClient.invalidateQueries({ queryKey: latestVaultBannerKey }); }
        else setTab("logo");
      } else toast.error(t("kitFailed"));
    } catch { toast.dismiss(tid); toast.error(t("networkError")); }
    finally { setKitBusy(false); }
  }

  async function downloadComposited(bannerUrl: string, filename: string) {
    const W = 1024, H = 576;
    let bannerBlob: Blob | null = null;
    try { const r = await fetch(bannerUrl, { mode: "cors", credentials: "omit", cache: "no-store" }); if (r.ok) bannerBlob = await r.blob(); } catch { /**/ }
    if (!bannerBlob) { window.open(bannerUrl, "_blank", "noopener,noreferrer"); return; }
    let bannerBmp: ImageBitmap; try { bannerBmp = await createImageBitmap(bannerBlob); } catch { window.open(bannerUrl, "_blank", "noopener,noreferrer"); return; }
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"); if (!ctx) { window.open(bannerUrl, "_blank", "noopener,noreferrer"); return; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bannerBmp, 0, 0, W, H); bannerBmp.close();
    if (bannerAddIcon) {
      const iconUrl = selectedApp?.metadata ? (() => { const lg = selectedApp.metadata as Record<string, unknown>; const raw = (lg.logoGenerator as Record<string, unknown> | undefined); return typeof raw?.selectedUrl === "string" ? raw.selectedUrl : null; })() : null;
      if (iconUrl) { try { const ir = await fetch(iconUrl, { mode: "cors", credentials: "omit", cache: "no-store" }); if (ir.ok) { const ib = await ir.blob(); const ibmp = await createImageBitmap(ib); const ICON = 150; const ix = W - ICON - 20; const iy = H - ICON - 20; const sc = document.createElement("canvas"); sc.width = W; sc.height = H; const sCtx = sc.getContext("2d"); if (sCtx) { sCtx.shadowColor = "rgba(0,0,0,0.45)"; sCtx.shadowBlur = 24; sCtx.shadowOffsetY = 6; const r = ICON * 0.22; sCtx.beginPath(); sCtx.moveTo(ix + r, iy); sCtx.lineTo(ix + ICON - r, iy); sCtx.arcTo(ix + ICON, iy, ix + ICON, iy + r, r); sCtx.lineTo(ix + ICON, iy + ICON - r); sCtx.arcTo(ix + ICON, iy + ICON, ix + ICON - r, iy + ICON, r); sCtx.lineTo(ix + r, iy + ICON); sCtx.arcTo(ix, iy + ICON, ix, iy + ICON - r, r); sCtx.lineTo(ix, iy + r); sCtx.arcTo(ix, iy, ix + r, iy, r); sCtx.closePath(); sCtx.clip(); sCtx.drawImage(ibmp, ix, iy, ICON, ICON); ctx.drawImage(sc, 0, 0); } ctx.save(); ctx.beginPath(); const ri = ICON * 0.22; ctx.moveTo(ix + ri, iy); ctx.lineTo(ix + ICON - ri, iy); ctx.arcTo(ix + ICON, iy, ix + ICON, iy + ri, ri); ctx.lineTo(ix + ICON, iy + ICON - ri); ctx.arcTo(ix + ICON, iy + ICON, ix + ICON - ri, iy + ICON, ri); ctx.lineTo(ix + ri, iy + ICON); ctx.arcTo(ix, iy + ICON, ix, iy + ICON - ri, ri); ctx.lineTo(ix, iy + ri); ctx.arcTo(ix, iy, ix + ri, iy, ri); ctx.closePath(); ctx.clip(); ctx.drawImage(ibmp, ix, iy, ICON, ICON); ctx.restore(); ibmp.close(); } } catch { /**/ } }
    }
    const headline = bannerHeadline.trim(); const subline = bannerSubline.trim();
    if (headline || subline) {
      const TX = Math.round(W * 0.65); const TW = W - TX - 32;
      function wrapTxt(c: CanvasRenderingContext2D, text: string, font: string, maxW: number): string[] { c.font = font; const words = text.split(" "); const lines: string[] = []; let line = ""; for (const w of words) { const test = line ? `${line} ${w}` : w; if (c.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; } if (line) lines.push(line); return lines; }
      if (headline) { const hFont = `bold 42px system-ui,-apple-system,sans-serif`; const hLines = wrapTxt(ctx, headline, hFont, TW); const hLineH = 52; const hBlockH = hLines.length * hLineH; const subLines = subline ? wrapTxt(ctx, subline, `500 28px system-ui,-apple-system,sans-serif`, TW) : []; const subBlockH = subLines.length * 36; const totalH = hBlockH + (subline ? subBlockH + 12 : 0); let ty = Math.round((H - totalH) / 2); ctx.font = hFont; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; ctx.fillStyle = "#ffffff"; for (const line of hLines) { ctx.fillText(line, TX, ty, TW); ty += hLineH; } if (subline && subLines.length > 0) { ty += 12; ctx.font = `500 28px system-ui,-apple-system,sans-serif`; ctx.shadowBlur = 8; ctx.fillStyle = "rgba(255,255,255,0.85)"; for (const sl of subLines) { ctx.fillText(sl, TX, ty, TW); ty += 36; } } ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; }
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) { window.open(bannerUrl, "_blank", "noopener,noreferrer"); return; }
    const u = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: u, download: filename, rel: "noopener" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREENSHOT STATE & LOGIC
  // Single 20-credit action: captions + render fused into one call.
  // Style/colour/theme/headline/subline are shared with the banner tab.
  // Language/RTL inferred from useLocale() — no user toggle.
  // ═══════════════════════════════════════════════════════════════════════════

  const [ssStep, setSsStep] = useState<ScreenshotStep>(1);
  // ssStyle/ssColor intentionally reference bannerStyle/bannerColor — one palette per app.
  // primaryColor is the secondary brand gradient stop — screenshot-specific.
  const [primaryColor, setPrimaryColor] = useState("");
  // ssTheme/ssHeadline/ssSubline share bannerTheme/bannerHeadline/bannerSubline — same inputs.

  // Job pattern state
  const [ssGenerateBusy, setSsGenerateBusy] = useState(false); // true while submitting or polling
  const [ssJobId, setSsJobId] = useState<string | null>(null);
  const [ssJobStatus, setSsJobStatus] = useState<string>("idle"); // idle|pending|running|completed|failed
  const [ssJobProgress, setSsJobProgress] = useState(0);         // 0–6
  const [ssJobTotal, setSsJobTotal] = useState(6);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ssSlides, setSsSlides] = useState<RenderedSlide[]>([]);
  const [ssOptimized, setSsOptimized] = useState(false); // true when Tier 1 listing data used
  const [ssExporting, setSsExporting] = useState(false);
  const [ssVaultLoading, setSsVaultLoading] = useState(false); // vault seed loading — must NOT lock controls

  // Vault seed for screenshots
  const ssVaultKey = ["brand-assets-vault-screenshots", props.workspaceId, appId];
  const ssVaultQuery = useQuery({
    queryKey: ssVaultKey,
    enabled: Boolean(props.workspaceId && appId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RenderedSlide[]> => {
      const params = new URLSearchParams({ workspaceId: props.workspaceId, appId, assetType: "screenshot", limit: "12" });
      const res = await fetch(`/api/brand-assets/vault?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = (await res.json()) as { ok: boolean; assets?: { signedUrl: string; meta?: Record<string, unknown> | null; variantIndex?: number | null }[] };
      if (!json.ok || !json.assets?.length) return [];
      const latestBatchId = (json.assets[0].meta as Record<string, unknown> | null)?.batchId as string | undefined;
      const batch = latestBatchId ? json.assets.filter((a) => (a.meta as Record<string, unknown> | null)?.batchId === latestBatchId) : json.assets.slice(0, 3);
      return batch.map((a) => {
        const meta = (a.meta ?? {}) as Record<string, unknown>;
        const lm = (meta.layoutMap ?? {}) as Record<string, unknown>;
        return {
          backgroundUrl: a.signedUrl,
          layoutMap: { backgroundPrompt: "", negativeAdditions: "", textPosition: (lm.textPosition as LayoutMap["textPosition"]) ?? "bottom", textColor: (lm.textColor as LayoutMap["textColor"]) ?? "#ffffff", accentColor: String(lm.accentColor ?? "#22C55E"), accentColorSecondary: String((lm as Record<string,unknown>).accentColorSecondary ?? "#16a34a"), backgroundMood: String(lm.backgroundMood ?? ""), uiMockDescription: String((lm as Record<string,unknown>).uiMockDescription ?? ""), backgroundLuminance: ((lm as Record<string,unknown>).backgroundLuminance as "dark"|"light") ?? "dark", selectedSchema: ((lm as Record<string,unknown>).selectedSchema as LayoutMap["selectedSchema"]) ?? "minimalist-professional", typographyConfig: ((lm as Record<string,unknown>).typographyConfig as LayoutMap["typographyConfig"]) ?? { primaryColor: "#6366F1", fontStyle: "clean", shadowProfile: "subtle" } },
          slide: { position: Number(a.variantIndex ?? 0) + 1, headline: String(meta.headline ?? ""), subline: String(meta.subline ?? ""), uiFocus: "" },
        };
      });
    },
  });

  // Seed from vault when screenshot tab opens.
  // Uses ssVaultLoading — NOT ssGenerateBusy — so vault hydration never locks controls.
  useEffect(() => {
    if (ssSlides.length > 0 || ssGenerateBusy) return;
    if (ssVaultQuery.isLoading) { setSsStep(2); setSsVaultLoading(true); return; }
    setSsVaultLoading(false);
    if (!ssVaultQuery.data?.length) return;
    setSsSlides(ssVaultQuery.data); setSsStep(2);
  }, [ssVaultQuery.data, ssVaultQuery.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop polling helper — declared before any effect that uses it
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Reset when app changes — also stop any in-flight poll
  useEffect(() => {
    stopPolling();
    setSsSlides([]); setSsOptimized(false); setSsStep(1);
    setSsJobId(null); setSsJobStatus("idle"); setSsJobProgress(0);
    setSsGenerateBusy(false);
  }, [selectedAppId, stopPolling]);

  /**
   * Poll the job-status endpoint every 2.5 s until completed or failed.
   * Updates progress bar and slide thumbnails incrementally as each slide arrives.
   */
  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    let staleTicks = 0; // detect stalls

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/screenshot-studio/job/${jobId}`, { credentials: "include" });
        if (!res.ok) { staleTicks++; if (staleTicks > 8) { stopPolling(); setSsGenerateBusy(false); setSsJobStatus("failed"); toast.error(t("screenshotJobFailed")); } return; }
        staleTicks = 0;

        const json = (await res.json()) as JobStatus | { ok: false };
        if (!json.ok) return;

        const { job } = json as JobStatus;
        setSsJobStatus(job.status);
        setSsJobProgress(job.progress);
        setSsJobTotal(job.total);

        // Stream slide thumbnails as they complete
        if (job.slides.length > 0) setSsSlides(job.slides as RenderedSlide[]);

        if (job.status === "completed") {
          stopPolling();
          setSsGenerateBusy(false);
          setSsOptimized(job.optimizedForConversion);
          setSsSlides(job.slides as RenderedSlide[]);
          if (typeof job.creditsRemaining === "number") updateCredits(job.creditsRemaining);
          void queryClient.invalidateQueries({ queryKey: ssVaultKey });
          toast.success(t("screenshotJobCompleted", { total: job.total }));
          setSsStep(2);
        } else if (job.status === "failed") {
          stopPolling();
          setSsGenerateBusy(false);
          toast.error(job.errorMessage || t("screenshotJobFailed"));
        }
      } catch { staleTicks++; }
    }, 2500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPolling, ssVaultKey]);

  /**
   * Submit the generate job: POST → 202 → start polling.
   * Returns immediately — no timeout risk.
   */
  async function runSsGenerate() {
    if (!requireApp()) return;
    const cost = AI_CREDIT_COSTS.screenshot_render;
    if (credits < cost) { toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: credits, req: cost }) }); return; }

    setSsGenerateBusy(true); setSsSlides([]); setSsOptimized(false);
    setSsJobId(null); setSsJobStatus("pending"); setSsJobProgress(0);
    stopPolling();

    try {
      const res = await fetch("/api/screenshot-studio/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: props.workspaceId, appId, appName, category,
          shortDescription: shortDescription || undefined,
          style: bannerStyle,
          brandColor: /^#[0-9a-fA-F]{6}$/.test(bannerColor) ? bannerColor : undefined,
          primaryColor: /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : undefined,
          theme: bannerTheme.trim() || undefined,
          headlineOverride: bannerHeadline.trim() || undefined,
          sublineOverride: bannerSubline.trim() || undefined,
          locale: isAr ? "ar" : "en",
        }),
      });

      const json = (await res.json()) as JobAccepted | GenErr;

      if (!json.ok) {
        const err = (json as GenErr).error;
        if (err.code === "insufficient_credits") {
          if (typeof err.remaining === "number") updateCredits(err.remaining);
          toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: err.remaining ?? credits, req: err.required ?? cost }) });
        } else { toast.error(err.message || t("screenshotFailed")); }
        setSsGenerateBusy(false);
        return;
      }

      const accepted = json as JobAccepted;
      setSsJobId(accepted.jobId);
      setSsJobStatus("pending");
      if (typeof accepted.meta?.creditsCharged === "number") {
        // Optimistically update credits display
        updateCredits(credits - accepted.meta.creditsCharged);
      }
      toast.success(t("screenshotJobQueued"));

      // Start polling — progress bar will fill as slides arrive
      startPolling(accepted.jobId);
    } catch {
      setSsGenerateBusy(false);
      toast.error(t("networkError"));
    }
    // Note: setSsGenerateBusy(false) is handled by the poll completion, not here
  }

  async function ssExportAll() {
    if (isFreePlan) { props.onRequestUpgrade?.(); return; }
    if (!ssSlides.length) return;
    setSsExporting(true);
    const slug = appName.replace(/\s+/g, "-").toLowerCase();
    try {
      // Android-only: single export at 1080×1920. No iOS/App Store sizes.
      for (let i = 0; i < ssSlides.length; i++) {
        const { backgroundUrl, layoutMap, slide } = ssSlides[i];
        const blob = await composeScreenshot({
          backgroundUrl, layoutMap,
          headline: slide.headline, subline: slide.subline,
          isRTL,
          targetW: 1080, targetH: 1920,
        });
        if (!blob) { window.open(backgroundUrl, "_blank", "noopener,noreferrer"); continue; }
        const u = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), {
          href: u,
          download: `${slug}-screenshot-${i + 1}.png`,
          rel: "noopener",
        });
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(u);
      }
      toast.success(t("screenshotJobCompleted", { total: ssSlides.length }));
    } catch { toast.error(t("networkError")); }
    finally { setSsExporting(false); }
  }

  // ── Derived busy flags ────────────────────────────────────────────────────
  // bannerVaultLoading = vault query hydrating in background — must NEVER lock any UI control.
  // bannerBusy         = live Runware generation in flight — locks banner tab controls only.
  // ssTabBusy          = screenshot caption/render/export in flight — locks ss tab only.
  // anyBusy            = used for Brand Kit CTA (cross-tab operation).
  // appSelectorBusy    = only true during actual AI generation calls, never during vault loads.
  const bannerTabBusy = bannerBusy || kitBusy;
  const ssTabBusy = ssGenerateBusy || ssExporting;
  const anyBusy = bannerTabBusy || ssTabBusy;
  const appSelectorBusy = bannerBusy || kitBusy || ssGenerateBusy || ssExporting; // never includes vault loading flags
  const appsLoading = appsQuery.isLoading;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div dir={isAr ? "rtl" : "ltr"} className={cn("min-h-full w-full", isAr && "font-arabic")}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">

        {/* Page header */}
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t("pageTitle")}</h1>
          <p className="text-sm leading-relaxed text-white/55 sm:text-base">{t("pageSubtitle")}</p>
        </div>

        {/* Generate / My Vault top tabs */}
        <div className="mb-8 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {([
            { key: "generate" as const, label: t("modeGenerate"), icon: <Sparkles className="size-4 shrink-0" aria-hidden /> },
            { key: "vault"    as const, label: t("modeVault"),    icon: <Archive  className="size-4 shrink-0" aria-hidden /> },
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

        {/* ── My Vault ──────────────────────────────────────────────────── */}
        {mode === "vault" && (
          <VaultGrid workspaceId={props.workspaceId} appId={appId || undefined} />
        )}

        {/* ── Generate mode ─────────────────────────────────────────────── */}
        {mode === "generate" && (<>

          {/* App selector */}
          <div className="mb-8">
            {appsLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <Loader2 className="size-4 animate-spin text-white/40" aria-hidden />
                <span className="text-sm text-white/40">{t("loadingApps")}</span>
              </div>
            ) : appsList.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300/70" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-amber-200/90">{t("noAppTitle")}</p>
                  <p className="mt-0.5 text-xs leading-snug text-amber-200/60">{t("noAppBody")}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="ba-app-select" className="text-xs font-medium text-white/55">{t("appSelectorLabel")}</label>
                <div className="relative">
                  <select id="ba-app-select" value={selectedAppId} onChange={(e) => setSelectedAppId(e.target.value)} disabled={appSelectorBusy}
                    className="w-full appearance-none rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 pe-10 text-sm text-white outline-none transition focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40">
                    {appsList.map((app) => <option key={app.id} value={app.id} className="bg-[#0c1018]">{app.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden />
                </div>
              </div>
            )}
          </div>

          {/* Brand Kit CTA */}
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
              <button type="button" disabled={anyBusy || !appId || appsLoading} onClick={() => { void runBrandKit(); }} aria-label={t("brandKitCta")}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                {kitBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}
                {kitBusy ? t("generating") : t("brandKitCta")}
              </button>
            </div>
          </div>

          {/* ── 3-tab bar: App Icon / Feature Graphic / Screenshots ────────── */}
          <div className="mb-6 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
            {([
              { id: "logo"       as Tab, icon: <ImageIcon  className="size-4 shrink-0" aria-hidden />, label: t("tabLogo")       },
              { id: "banner"     as Tab, icon: <Layers     className="size-4 shrink-0" aria-hidden />, label: t("tabBanner")     },
              { id: "screenshot" as Tab, icon: <Smartphone className="size-4 shrink-0" aria-hidden />, label: t("tabScreenshot") },
            ]).map(({ id, icon, label }) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none",
                  tab === id ? "bg-[#22C55E]/15 text-[#86efac] ring-1 ring-[#22C55E]/30" : "text-white/45 hover:text-white/70",
                )}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* ══════════ APP ICON TAB ══════════════════════════════════════════ */}
          {tab === "logo" && (
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c1018]">
              {appId ? (
                <AppIconGenerator key={appId} workspaceId={props.workspaceId} appId={appId} appName={appName} category={category} shortDescription={shortDescription} creditsRemaining={credits} onCreditsRemaining={updateCredits} onIconSelected={() => {}} onIconPersisted={() => { void appsQuery.refetch(); }} initialLogoGenerator={parseLogoGeneratorMetadata(selectedApp?.metadata ?? null)} plan={props.plan} onRequestUpgrade={props.onRequestUpgrade} />
              ) : (
                <div className="p-8 text-center text-sm text-white/40">{appsLoading ? t("loadingApps") : t("noAppTitle")}</div>
              )}
            </div>
          )}

          {/* ══════════ FEATURE GRAPHIC TAB ═══════════════════════════════════ */}
          {tab === "banner" && (
            <div className="space-y-6">
              {/* Step bar */}
              <div className="flex items-stretch rounded-xl border border-white/[0.07] bg-white/[0.02]">
                {([1, 2] as BannerPage[]).map((p, idx) => (
                  <button key={p} type="button" onClick={() => { if (p === 1 || bannerImages.length > 0) setBannerPage(p); }} disabled={p === 2 && bannerImages.length === 0 && !bannerBusy}
                    className={cn("flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors focus-visible:outline-none disabled:cursor-default", idx === 0 ? "rounded-s-xl" : "rounded-e-xl", bannerPage === p ? "border-[#22C55E] text-[#86efac]" : bannerImages.length > 0 && p === 1 ? "border-transparent text-white/40 hover:text-white/60" : "border-transparent text-white/25")}>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", bannerPage === p ? "bg-[#22C55E] text-white" : bannerPage === 2 && p === 1 ? "bg-[#22C55E]/20 text-[#86efac]" : "bg-white/[0.08] text-white/35")}>
                      {bannerPage === 2 && p === 1 ? <Check className="size-2.5" /> : p}
                    </span>
                    {t(p === 1 ? "step1Label" : "step2Label")}
                  </button>
                ))}
              </div>

              {/* Banner page 1 — Configure */}
              {bannerPage === 1 && (
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
                    <Sparkles className="size-3 shrink-0" aria-hidden />{t("bannerCredits")}
                  </div>
                  <div className="space-y-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                    {/* Style */}
                    <div className="space-y-2.5">
                      <span className="text-xs font-medium text-white/60">{t("styleLabel")}</span>
                      <div className="flex flex-wrap gap-2">
                        {["Minimalist","Modern","Bold","Playful","Professional","Flat Design"].map((s) => (
                          <button key={s} type="button" disabled={bannerBusy} onClick={() => setBannerStyle(s)}
                            className={cn("rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", bannerStyle === s ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]" : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80")}>
                            {t(`styles.${s}` as Parameters<typeof t>[0])}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Colour */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-white/60">{t("brandColorLabel")}</span>
                        {bannerColor && <button type="button" onClick={() => setBannerColor("")} className="ms-auto text-[10px] text-white/35 hover:text-white/60">{t("brandColorNone")}</button>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {[{ hex: "#1A73E8" }, { hex: "#0B8043" }, { hex: "#D93025" }, { hex: "#E37400" }, { hex: "#7B1FA2" }].map(({ hex }) => (
                          <button key={hex} type="button" disabled={bannerBusy} onClick={() => setBannerColor(bannerColor === hex ? "" : hex)}
                            className={cn("size-7 rounded-full border-2 transition-[border-color,transform,box-shadow] disabled:opacity-40", bannerColor === hex ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]" : "border-white/20 hover:border-white/50 hover:scale-105")}
                            style={{ backgroundColor: hex }} />
                        ))}
                        {bannerColor && <span className="ms-1 font-mono text-[11px] text-white/40">{bannerColor.toUpperCase()}</span>}
                      </div>
                    </div>
                    {/* Theme */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-white/60">{t("bannerThemeLabel")}</span>
                      <input type="text" maxLength={150} value={bannerTheme} onChange={(e) => setBannerTheme(e.target.value)} disabled={bannerBusy} placeholder={t("bannerThemePlaceholder")} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                      <p className="text-[11px] text-white/35">{t("bannerThemeHint")}</p>
                    </div>
                    {/* Download enhancements */}
                    <div className="space-y-4 border-t border-white/[0.06] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/30">{t("downloadEnhancementsLabel")}</p>
                      <label className="flex cursor-pointer items-start gap-3">
                        <div className="relative mt-0.5 shrink-0">
                          <input type="checkbox" checked={bannerAddIcon} onChange={(e) => setBannerAddIcon(e.target.checked)} disabled={bannerBusy} className="sr-only" />
                          <div className={cn("flex size-5 items-center justify-center rounded border-2 transition-colors", bannerAddIcon ? "border-[#22C55E] bg-[#22C55E]" : "border-white/25 bg-white/[0.04]")}>
                            {bannerAddIcon && <Check className="size-3 text-white" />}
                          </div>
                        </div>
                        <div><span className="text-xs font-medium text-white/75">{t("bannerAddIconLabel")}</span><p className="mt-0.5 text-[11px] leading-snug text-white/35">{t("bannerAddIconHint")}</p></div>
                      </label>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5"><span className="text-xs font-medium text-white/60">{t("bannerHeadlineLabel")}</span><span className="ms-auto text-[10px] text-white/28">{bannerHeadline.length}/40</span></div>
                        <input type="text" maxLength={40} value={bannerHeadline} onChange={(e) => setBannerHeadline(e.target.value)} disabled={bannerBusy} placeholder={t("bannerHeadlinePlaceholder")} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5"><span className="text-xs font-medium text-white/60">{t("bannerSublineLabel")}</span><span className="ms-auto text-[10px] text-white/28">{bannerSubline.length}/80</span></div>
                        <input type="text" maxLength={80} value={bannerSubline} onChange={(e) => setBannerSubline(e.target.value)} disabled={bannerBusy} placeholder={t("bannerSublinePlaceholder")} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                        <p className="text-[11px] text-white/30">{t("bannerOverlayHint")}</p>
                      </div>
                    </div>
                  </div>
                  <button type="button" disabled={bannerBusy || !appId} onClick={() => { void runBannerGenerate(); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                    {bannerBusy ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t("generating")}</> : <><Layers className="size-4" aria-hidden />{bannerImages.length ? t("regenerate") : t("generateBanners")}</>}
                  </button>
                  <p className="text-[11px] text-white/35">{t("bannerSizeNote")}</p>
                </div>
              )}

              {/* Banner page 2 — Pick & Download */}
              {bannerPage === 2 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-white/55">{t("pickBannerHint")}</p>
                    {bannerImages.length > 0 && !bannerBusy && latestVaultBannerQuery.data?.length === bannerImages.length && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/40">
                        <Archive className="size-3 shrink-0" aria-hidden />{t("fromVault")}
                      </span>
                    )}
                  </div>
                  {(bannerBusy || bannerVaultLoading) && bannerImages.length === 0 && (
                    <><p className="text-xs text-white/35">{bannerVaultLoading ? t("vaultLoading") : t("generating")}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[0,1,2,3].map((i) => <Skeleton key={i} aspect="aspect-[2/1]" />)}</div></>
                  )}
                  {bannerImages.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {bannerImages.map((src, i) => (
                        <button key={`${i}-${src.slice(0,48)}`} type="button" disabled={bannerBusy} onClick={() => setBannerSelected(src)}
                          className={cn("group relative aspect-[2/1] overflow-hidden rounded-xl border p-1 transition-[border-color,box-shadow] duration-200 focus:outline-none motion-safe:hover:-translate-y-[2px] motion-safe:hover:border-[#22C55E]/45", bannerSelected === src ? "border-[#22C55E]/60 shadow-[0_6px_18px_-6px_rgba(34,197,94,0.28)] ring-2 ring-[#22C55E]/40" : "border-white/[0.08] hover:border-white/[0.15]", bannerBusy && "pointer-events-none opacity-55")}>
                          {bannerSelected === src && <span className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full bg-[#22C55E]"><Check className="size-3 text-white" /></span>}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="h-full w-full rounded-lg object-cover transition duration-200 motion-safe:group-hover:scale-[1.02]" />
                        </button>
                      ))}
                    </div>
                  )}
                  {bannerImages.length > 0 && (
                    isFreePlan ? (
                      <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                        <Lock className="size-4 shrink-0 text-amber-300/75" aria-hidden />
                        <div className="flex-1"><p className="text-xs font-semibold text-amber-200/90">{t("downloadLockedTitle")}</p><p className="mt-0.5 text-[11px] text-amber-200/55">{t("downloadLockedBody")}</p></div>
                        {props.onRequestUpgrade && <button type="button" onClick={props.onRequestUpgrade} className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300/90 hover:bg-amber-400/18">{t("upgrade")}</button>}
                      </div>
                    ) : (
                      <button type="button" disabled={!bannerSelected} onClick={() => bannerSelected && void downloadComposited(bannerSelected, `banner-${appName.replace(/\s+/g, "-").toLowerCase()}-1024x576.png`)}
                        className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] disabled:cursor-not-allowed disabled:opacity-45">
                        {t("downloadBanner")}
                      </button>
                    )
                  )}
                  <p className="text-[11px] text-white/35">{t("bannerDownloadHint")}</p>
                  <div className="border-t border-white/[0.06] pt-4">
                    <button type="button" onClick={() => setBannerPage(1)} className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                      <ArrowLeft className="size-3.5" aria-hidden />{t("backToConfigure")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════ SCREENSHOTS TAB ════════════════════════════════════════ */}
          {tab === "screenshot" && (
            <div className="space-y-6">
              {/* Step bar — 2 steps, matches banner style */}
              <div className="flex items-stretch rounded-xl border border-white/[0.07] bg-white/[0.02]">
                {([1, 2] as ScreenshotStep[]).map((s, idx) => {
                  const labels: Record<ScreenshotStep, string> = { 1: t("screenshotStep1Label"), 2: t("screenshotStep2Label") };
                  const reachable = s === 1 || ssSlides.length > 0;
                  return (
                    <button key={s} type="button" onClick={() => { if (reachable) setSsStep(s); }} disabled={!reachable}
                      className={cn("flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors focus-visible:outline-none disabled:cursor-default", idx === 0 ? "rounded-s-xl" : "rounded-e-xl", ssStep === s ? "border-[#22C55E] text-[#86efac]" : reachable ? "border-transparent text-white/40 hover:text-white/60" : "border-transparent text-white/25")}>
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", ssStep === s ? "bg-[#22C55E] text-white" : ssStep > s ? "bg-[#22C55E]/20 text-[#86efac]" : "bg-white/[0.08] text-white/35")}>
                        {ssStep > s ? <Check className="size-2.5" /> : s}
                      </span>
                      <span className="hidden sm:inline">{labels[s]}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── Step 1: Configure ─────────────────────────────────────── */}
              {ssStep === 1 && (
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
                    <Sparkles className="size-3 shrink-0" aria-hidden />{t("screenshotCredits")}
                  </div>
                  <div className="space-y-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

                    {/* Visual style — identical chips to banner tab */}
                    <div className="space-y-2.5">
                      <span className="text-xs font-medium text-white/60">{t("styleLabel")}</span>
                      <div className="flex flex-wrap gap-2">
                        {["Minimalist","Modern","Bold","Playful","Professional","Flat Design"].map((s) => (
                          <button key={s} type="button" disabled={ssTabBusy} onClick={() => setBannerStyle(s)}
                            className={cn("rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", bannerStyle === s ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]" : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80")}>
                            {t(`styles.${s}` as Parameters<typeof t>[0])}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Primary brand colour */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-white/60">{t("brandColorLabel")}</span>
                        {bannerColor && <button type="button" onClick={() => setBannerColor("")} className="ms-auto text-[10px] text-white/35 hover:text-white/60">{t("brandColorNone")}</button>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {[{ hex: "#1A73E8" }, { hex: "#0B8043" }, { hex: "#D93025" }, { hex: "#E37400" }, { hex: "#7B1FA2" }].map(({ hex }) => (
                          <button key={hex} type="button" disabled={ssTabBusy} onClick={() => setBannerColor(bannerColor === hex ? "" : hex)}
                            className={cn("size-7 rounded-full border-2 transition-[border-color,transform,box-shadow] disabled:opacity-40", bannerColor === hex ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]" : "border-white/20 hover:border-white/50 hover:scale-105")}
                            style={{ backgroundColor: hex }} />
                        ))}
                        {bannerColor && <span className="ms-1 font-mono text-[11px] text-white/40">{bannerColor.toUpperCase()}</span>}
                      </div>
                    </div>

                    {/* Secondary brand colour — gradient stop 2 */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-white/60">{t("primaryColorLabel")}</span>
                        {primaryColor && <button type="button" onClick={() => setPrimaryColor("")} className="ms-auto text-[10px] text-white/35 hover:text-white/60">{t("brandColorNone")}</button>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {[{ hex: "#0EA5E9" }, { hex: "#10B981" }, { hex: "#F59E0B" }, { hex: "#8B5CF6" }, { hex: "#EC4899" }].map(({ hex }) => (
                          <button key={hex} type="button" disabled={ssTabBusy} onClick={() => setPrimaryColor(primaryColor === hex ? "" : hex)}
                            className={cn("size-7 rounded-full border-2 transition-[border-color,transform,box-shadow] disabled:opacity-40", primaryColor === hex ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]" : "border-white/20 hover:border-white/50 hover:scale-105")}
                            style={{ backgroundColor: hex }} />
                        ))}
                        {primaryColor && <span className="ms-1 font-mono text-[11px] text-white/40">{primaryColor.toUpperCase()}</span>}
                      </div>
                      <p className="text-[11px] text-white/30">{t("primaryColorHint")}</p>
                    </div>

                    {/* Theme / mood — mirrors banner tab */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-white/60">{t("screenshotThemeLabel")}</span>
                      <input type="text" maxLength={150} value={bannerTheme} onChange={(e) => setBannerTheme(e.target.value)} disabled={ssTabBusy}
                        placeholder={t("screenshotThemePlaceholder")}
                        className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                      <p className="text-[11px] text-white/35">{t("screenshotThemeHint")}</p>
                    </div>

                    {/* Download enhancements — headline + subline overrides */}
                    <div className="space-y-4 border-t border-white/[0.06] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/30">{t("downloadEnhancementsLabel")}</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white/60">{t("screenshotHeadlineLabel")}</span>
                          <span className="ms-auto text-[10px] text-white/28">{bannerHeadline.length}/40</span>
                        </div>
                        <input type="text" maxLength={40} value={bannerHeadline} onChange={(e) => setBannerHeadline(e.target.value)} disabled={ssTabBusy}
                          placeholder={t("screenshotHeadlinePlaceholder")}
                          className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white/60">{t("screenshotSublineLabel")}</span>
                          <span className="ms-auto text-[10px] text-white/28">{bannerSubline.length}/80</span>
                        </div>
                        <input type="text" maxLength={80} value={bannerSubline} onChange={(e) => setBannerSubline(e.target.value)} disabled={ssTabBusy}
                          placeholder={t("screenshotSublinePlaceholder")}
                          className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                        <p className="text-[11px] text-white/30">{t("screenshotOverlayHint")}</p>
                      </div>
                    </div>

                    {/* Locale badge — inferred, no toggle */}
                    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                      <span className="text-sm">🌐</span>
                      <div>
                        <p className="text-[11px] font-medium text-white/60">{isAr ? t("localeAr") : t("localeEn")}</p>
                        <p className="text-[10px] text-white/35">{isAr ? "RTL — text mirrors right-to-left automatically" : "LTR — standard left-to-right text placement"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Quality + sync badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#22C55E]/25 bg-[#22C55E]/[0.07] px-3 py-1.5 text-[11px] font-medium text-[#86efac]">
                      <Zap className="size-3 shrink-0" aria-hidden />{t("brandMirrorBadge")}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/45">
                      <Smartphone className="size-3 shrink-0" aria-hidden />{t("androidOnlyBadge")}
                    </span>
                  </div>
                  {/* Listing sync info — shown always so user knows sync will happen automatically */}
                  <div className="flex items-start gap-2.5 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/[0.04] px-3.5 py-3">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#86efac]" aria-hidden />
                    <div>
                      <p className="text-[11px] font-semibold text-[#86efac]">{t("listingSyncBadge")}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-white/45">{t("listingSyncHint")}</p>
                    </div>
                  </div>

                  <button type="button" disabled={ssTabBusy || !appId || appsLoading} onClick={() => { void runSsGenerate(); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                    {ssGenerateBusy
                      ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t("screenshotGenerating")}</>
                      : <><Smartphone className="size-4" aria-hidden />{t("screenshotGenerateAll")}</>}
                  </button>
                  <p className="text-[11px] text-white/35">{t("screenshotSizeNote")}</p>
                </div>
              )}

              {/* ── Step 2: Review & Export ───────────────────────────────── */}
              {ssStep === 2 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-white/55">{t("screenshotReady")}</p>
                    {/* Optimized for Conversion badge */}
                    {ssOptimized && ssSlides.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/[0.08] px-2.5 py-1 text-[11px] font-medium text-[#86efac]">
                        <Sparkles className="size-3 shrink-0" aria-hidden />{t("listingSyncBadge")}
                      </span>
                    )}
                    {/* From vault badge */}
                    {ssSlides.length > 0 && !ssGenerateBusy && !ssOptimized && ssVaultQuery.data?.length === ssSlides.length && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/40">
                        <Archive className="size-3 shrink-0" aria-hidden />{t("screenshotFromVault")}
                      </span>
                    )}
                  </div>

                  {/* Progress bar + incremental thumbnails while generating */}
                  {(ssGenerateBusy || ssVaultLoading) && (
                    <div className="space-y-4">
                      {/* Status message */}
                      <p className="text-xs text-white/50">
                        {ssVaultLoading ? t("screenshotVaultLoading")
                          : ssJobStatus === "pending" ? t("screenshotJobQueued")
                          : ssJobStatus === "running" && ssJobProgress === 0 ? t("screenshotJobRunning")
                          : ssJobProgress > 0 && ssJobProgress < ssJobTotal
                            ? t("screenshotJobProgress", { done: ssJobProgress, total: ssJobTotal })
                          : t("screenshotGenerating")}
                      </p>

                      {/* Progress bar */}
                      {!ssVaultLoading && (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full bg-[#22C55E] transition-all duration-500"
                            style={{ width: `${Math.max(4, Math.round((ssJobProgress / ssJobTotal) * 100))}%` }}
                          />
                        </div>
                      )}

                      {/* Grid: show completed thumbnails + remaining skeletons */}
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 6 }, (_, i) => {
                          const slide = ssSlides[i];
                          return slide ? (
                            <div key={i} className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-[#22C55E]/30 bg-black/30">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={slide.backgroundUrl} alt="" className="h-full w-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/0">
                                <Check className="size-6 text-[#22C55E] drop-shadow" />
                              </span>
                            </div>
                          ) : (
                            <Skeleton key={i} aspect="aspect-[9/16]" />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 6-slide preview grid */}
                  {ssSlides.length > 0 && (
                    <>
                      <p className="text-[11px] text-white/30">{t("screenshotExportHint")}</p>
                      <div dir={isRTL ? "rtl" : "ltr"} className="grid grid-cols-3 gap-3">
                        {ssSlides.map(({ backgroundUrl, layoutMap }, i) => {
                          // 6-slide narrative arc labels
                          // Slot labels follow the Show-and-Tell methodology:
                          // 1-2 = strongest value props, 3-5 = core features, 6 = trust/CTA
                          const slideLabels = [
                            t("slotValueProp1"), t("slotValueProp2"),
                            t("slotFeature1"), t("slotFeature2"), t("slotFeature3"),
                            t("slotTrustCta"),
                          ];
                          const slideLabel = slideLabels[i] ?? `Slide ${i + 1}`;
                          return (
                            <div key={`${i}-${backgroundUrl.slice(0,32)}`}
                              className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 transition hover:border-white/[0.2]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={backgroundUrl} alt="" className="h-full w-full object-cover transition duration-200 motion-safe:group-hover:scale-[1.02]" />
                              <div className="absolute start-2 top-2">
                                <span className="inline-flex items-center rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/70 backdrop-blur-sm">{slideLabel}</span>
                              </div>
                              {layoutMap.backgroundMood && (
                                <div className="absolute bottom-2 start-2 end-2">
                                  <span className="inline-flex items-center truncate rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] text-white/50 backdrop-blur-sm">{layoutMap.backgroundMood}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Export / upgrade */}
                  {ssSlides.length > 0 && (
                    isFreePlan ? (
                      <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                        <Lock className="size-4 shrink-0 text-amber-300/75" aria-hidden />
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
                        <button type="button" disabled={ssExporting} onClick={() => { void ssExportAll(); }}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                          {ssExporting
                            ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t("screenshotExporting")}</>
                            : <><Smartphone className="size-4" aria-hidden />{t("screenshotExportAll")}</>}
                        </button>
                        <p className="text-center text-[11px] text-white/30">{t("androidOnlyBadge")}</p>
                      </div>
                    )
                  )}

                  <div className="border-t border-white/[0.06] pt-4">
                    <button type="button" onClick={() => setSsStep(1)}
                      className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                      <ArrowLeft className="size-3.5" aria-hidden />{t("screenshotStep2BackLabel")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </>)} {/* end Generate mode */}
      </div>
    </div>
  );
}
