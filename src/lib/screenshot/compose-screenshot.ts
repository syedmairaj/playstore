import "server-only";
/**
 * compose-screenshot.ts — Schema-Driven Composition-First Pipeline
 *
 * Architecture:
 *   AI generates ONLY pure background art (gradient + atmosphere, no device).
 *   This module composites the static Android frame on top deterministically.
 *   Typography overlays are rendered with schema-driven fonts + shadows.
 *   Result: 100% device consistency + deterministic typography per schema.
 *
 * Canvas spec: 1080×1920 px (Play Store portrait screenshot)
 * Frame asset:  Pixel 9 Pro SVG → rendered to canvas
 *
 * Schema Integration:
 *   selectedSchema    → asset folder path (frame.svg, badge.png)
 *   fontStyle         → font file selection (clean/bold/elegant)
 *   shadowProfile     → blur/opacity configuration
 *
 * Localization (LTR/RTL):
 *   English (LTR):   device frame positioned in the RIGHT zone
 *   Arabic (RTL):    flop-composite-flop: flip BG → composite frame on left → flip back
 */

import sharp, { OverlayOptions } from "sharp";
import path from "path";
import fs from "fs/promises";
import { getAndroidFrameBuffer } from "./android-frame";
import type { LayoutMap } from "@/lib/gemini/generate-screenshot-layout";
import { MOOD_SCHEMAS, type MoodSchemaType } from "@/lib/gemini/mood-schema";

/** Re-exported alias used by the generate route for clarity */
export const getAndroidFrameAndCache = getAndroidFrameBuffer;

// ── Canvas dimensions (Play Store spec) ───────────────────────────────────────
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

// ── RTL locale detection ──────────────────────────────────────────────────────

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug"]);

/**
 * Returns true if the given locale code requires right-to-left layout.
 * Accepts both short codes ("ar") and BCP-47 tags ("ar-SA", "ar-EG").
 */
export function isRTLLocale(locale: string): boolean {
  if (!locale) return false;
  const base = locale.split(/[-_]/)[0].toLowerCase();
  return RTL_LOCALES.has(base);
}

// ── Frame geometry ────────────────────────────────────────────────────────────
// The frame occupies the right/left 42% of the canvas width and is vertically
// centred. Text occupies the opposite 52% (6% is shared padding/breathing room).

const FRAME_W_PCT  = 0.42;   // frame zone width as fraction of CANVAS_W
const FRAME_MARGIN = 0.035;  // edge padding as fraction of CANVAS_W

function getFrameGeometry(isRTL: boolean): {
  frameW: number; frameH: number; frameLeft: number; frameTop: number;
} {
  const frameW    = Math.round(CANVAS_W * FRAME_W_PCT);
  // Pixel 9 Pro aspect ratio from SVG viewBox: 1080:2340 ≈ 0.4615
  const frameH    = Math.round(frameW / (1080 / 2340));
  const edgePad   = Math.round(CANVAS_W * FRAME_MARGIN);

  // LTR: device sits in the right third.  RTL: device sits in the left third.
  const frameLeft = isRTL
    ? edgePad
    : CANVAS_W - frameW - edgePad;

  // Vertically centred on the canvas
  const frameTop  = Math.round((CANVAS_H - frameH) / 2);

  return { frameW, frameH, frameLeft, frameTop };
}

// ── SCHEMA-DRIVEN ASSET RESOLUTION ────────────────────────────────────────────

/**
 * Asset Resolver: Maps schema ID to asset folder paths.
 * Resolves frame SVG, badge PNG, and other schema-specific assets.
 */
export interface SchemaAssets {
  frameSvgPath: string;        // Full path to frame.svg
  badgePngPath: string;        // Full path to badge.png (optional)
  assetFolder: string;         // Base folder for this schema
}

/**
 * Resolves asset paths for a given schema.
 * Assets are expected in: /public/assets/{schema-id}/
 *
 * CRITICAL: If schemaId is undefined, defaults to 'minimalist-professional'.
 * IMPORTANT: If assets don't exist, falls back to using the built-in Pixel 9 Pro frame.
 *
 * @param schemaId  One of the 5 MoodSchemaType IDs (or undefined → defaults to minimalist-professional)
 * @returns         Resolved asset paths (may be fallback paths)
 */
export function resolveSchemaAssets(schemaId: MoodSchemaType | undefined): SchemaAssets {
  // ── CRITICAL FIX: Default to 'minimalist-professional' if schemaId is undefined ──
  const safeSchemaId: MoodSchemaType = schemaId || "minimalist-professional";

  // Try to resolve from /public/assets/{schema-id}
  // If not available, use fallback path
  const cwd = process.cwd?.() || "";
  const baseFolder = cwd
    ? path.join(cwd, "public", "assets", safeSchemaId)
    : `/public/assets/${safeSchemaId}`;

  return {
    frameSvgPath: path.join(baseFolder, "frame.svg"),
    badgePngPath: path.join(baseFolder, "badge.png"),
    assetFolder: baseFolder,
  };
}

/**
 * Validates that schema assets exist before composition.
 * Returns true if assets are available, false if should use fallback frame.
 *
 * @param assets  SchemaAssets from resolveSchemaAssets()
 * @returns       true if schema assets exist, false if should use built-in frame
 */
export async function validateSchemaAssets(assets: SchemaAssets): Promise<boolean> {
  try {
    await fs.access(assets.frameSvgPath);
    return true;  // Schema assets exist
  } catch {
    // Schema assets don't exist — will use fallback built-in frame
    return false;
  }
}

// ── TYPOGRAPHY ORCHESTRATION ──────────────────────────────────────────────────

/**
 * Font style mapped to actual font file paths.
 * These fonts are expected to exist in /public/fonts/
 */
const FONT_PATHS: Record<"bold" | "elegant" | "clean", string> = {
  bold: path.join(process.cwd(), "public", "fonts", "Poppins-ExtraBold.ttf"),
  elegant: path.join(process.cwd(), "public", "fonts", "PlayfairDisplay-Bold.ttf"),
  clean: path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf"),
};

/**
 * Gets the absolute path to a font file based on fontStyle.
 *
 * @param fontStyle  One of: bold, elegant, clean
 * @returns          Absolute path to .ttf file
 */
export function getFontPath(fontStyle: "bold" | "elegant" | "clean"): string {
  return FONT_PATHS[fontStyle];
}

/**
 * Validates that font files exist.
 * Throws if any font is missing.
 *
 * @throws  Error if font files are not found
 */
export async function validateFonts(): Promise<void> {
  for (const [style, fontPath] of Object.entries(FONT_PATHS)) {
    try {
      await fs.access(fontPath);
    } catch {
      throw new Error(
        `Font file missing: ${fontPath} (fontStyle: ${style}). ` +
        `Ensure all 5 fonts exist in /public/fonts/`
      );
    }
  }
}

// ── SHADOW PROFILES ───────────────────────────────────────────────────────────

/**
 * Shadow Profile Configuration
 * Defines blur, opacity, and offset for frame + badge shadows.
 */
export interface ShadowConfig {
  offsetX: number;   // Horizontal offset in pixels
  offsetY: number;   // Vertical offset in pixels
  blur: number;      // Gaussian blur sigma
  opacity: number;   // 0-1 shadow transparency
  color: string;     // Shadow color hex (typically #000000)
}

/**
 * Pre-defined shadow profiles per Mood Schema.
 * Ensures consistent shadow rendering across all compositions.
 */
export const SHADOW_PROFILES: Record<
  "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep",
  ShadowConfig
> = {
  sharp: {
    offsetX: 2,
    offsetY: 2,
    blur: 0,         // No blur = crisp, defined shadow
    opacity: 0.8,
    color: "#000000",
  },
  "soft-spread": {
    offsetX: 4,
    offsetY: 4,
    blur: 8,         // Soft, diffused shadow
    opacity: 0.4,
    color: "#000000",
  },
  subtle: {
    offsetX: 1,
    offsetY: 1,
    blur: 2,         // Minimal shadow
    opacity: 0.3,
    color: "#000000",
  },
  "hard-edge": {
    offsetX: 3,
    offsetY: 3,
    blur: 0,         // Maximum contrast, no softness
    opacity: 1.0,
    color: "#000000",
  },
  deep: {
    offsetX: 6,
    offsetY: 6,
    blur: 12,        // Deep, pronounced shadow
    opacity: 0.6,
    color: "#000000",
  },
};

/**
 * Gets shadow configuration for a given shadowProfile.
 *
 * @param shadowProfile  One of the 5 shadow profile names
 * @returns              ShadowConfig with blur/opacity/offset
 */
export function getShadowConfig(
  shadowProfile: "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep"
): ShadowConfig {
  return SHADOW_PROFILES[shadowProfile];
}

/**
 * Applies a shadow effect to an image buffer using sharp.
 * Creates a shadow layer and composites it behind the input image.
 *
 * @param imageBuffer   Input PNG/JPEG buffer
 * @param width         Image width in pixels
 * @param height        Image height in pixels
 * @param shadowConfig  ShadowConfig with blur/opacity/offset
 * @returns             PNG buffer with shadow applied
 */
export async function applyShadowEffect(
  imageBuffer: Buffer,
  width: number,
  height: number,
  shadowConfig: ShadowConfig
): Promise<Buffer> {
  // For blurred shadows: create a shadow layer using Gaussian blur
  let shadowLayer = await sharp(imageBuffer)
    .negate()  // Invert to create dark shadow base
    .blur(Math.max(shadowConfig.blur, 0.1))  // Apply blur
    .png()
    .toBuffer();

  // If blur is 0 (hard shadow), skip the blur step and use the image directly
  if (shadowConfig.blur === 0) {
    shadowLayer = await sharp(imageBuffer).png().toBuffer();
  }

  // Create a composite with shadow behind the original
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: shadowLayer,
        left: shadowConfig.offsetX,
        top: shadowConfig.offsetY,
        blend: "over",
      },
      {
        input: imageBuffer,
        left: 0,
        top: 0,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
}

// ── CORE COMPOSITION FUNCTION (SCHEMA-AWARE) ──────────────────────────────────

/**
 * Composes a Play Store screenshot with schema-driven styling.
 *
 * Features:
 *   • AI-generated background (pure, no device frames)
 *   • Schema-specific Android frame overlay
 *   • Deterministic typography (font + shadow from schema)
 *   • RTL support: flop-composite-flop for Arabic
 *
 * @param background  PNG/JPEG buffer from Runware (will be scaled to CANVAS_W×CANVAS_H)
 * @param layoutMap   LayoutMap from Gemini with schema metadata
 * @param locale      BCP-47 locale string ("en", "ar", "ar-SA", etc.)
 * @param frame       (Optional) PNG buffer of custom frame. If omitted, uses schema frame.
 * @returns           Optimized PNG buffer at exactly CANVAS_W × CANVAS_H
 *
 * @example
 *   const png = await composeScreenshot(bgBuffer, layoutMap, "ar");
 *   await fs.writeFile("slide-1.png", png);
 */
export async function composeScreenshot(
  background: Buffer,
  layoutMap: LayoutMap,
  locale: string,
  frame?: Buffer | null,
): Promise<Buffer> {
  const rtl = isRTLLocale(locale);

  // ── 1. Resolve schema assets (with fallback to built-in frame) ──────────
  const schemaId = layoutMap.selectedSchema;
  const schemaAssets = resolveSchemaAssets(schemaId);
  const hasSchemaAssets = await validateSchemaAssets(schemaAssets);

  // ── 2. Scale background to canvas (fill, no letterbox) ───────────────────
  // Background from Runware is 1024×1792 — upscale to 1080×1920.
  let bg = sharp(background)
    .resize(CANVAS_W, CANVAS_H, { fit: "fill", kernel: sharp.kernel.lanczos3 });

  // ── 3. For RTL: flip background horizontally so content faces the right ──
  // We flip the background (not the frame) because the frame is symmetric.
  // Flipping background + compositing frame on left = device-on-left, content-on-right.
  if (rtl) {
    bg = bg.flop(); // horizontal flip
  }

  const bgBuffer = await bg.png().toBuffer();

  // ── 4. Get frame buffer (schema assets → provided → built-in fallback) ────
  let frameBuffer: Buffer;
  if (frame) {
    frameBuffer = frame;
  } else if (hasSchemaAssets) {
    // Schema assets exist, use them
    frameBuffer = await sharp(schemaAssets.frameSvgPath).png().toBuffer();
  } else {
    // Fall back to built-in Pixel 9 Pro frame
    frameBuffer = await getAndroidFrameBuffer();
  }

  // ── 5. Apply shadow effect to frame based on schema shadowProfile ─────────
  const { frameW, frameH, frameLeft, frameTop } = getFrameGeometry(rtl);
  const shadowConfig = getShadowConfig(layoutMap.typographyConfig.shadowProfile);

  // Resize frame first, then apply shadow
  const resizedFrame = await sharp(frameBuffer)
    .resize(frameW, frameH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  // Apply shadow effect to the resized frame
  const framedWithShadow = await applyShadowEffect(
    resizedFrame,
    frameW,
    frameH,
    shadowConfig
  );

  // ── 6. Composite frame (with shadow) over background ────────────────────
  const overlayOptions: OverlayOptions = {
    input: framedWithShadow,
    top: frameTop,
    left: frameLeft,
    blend: "over",        // standard alpha compositing
  };

  let composed = await sharp(bgBuffer)
    .composite([overlayOptions])
    .png({ compressionLevel: 9, quality: 100 }) // lossless
    .toBuffer();

  // ── 7. For RTL: flip the entire composed image back ────────────────────
  // BG was flipped → frame composited (on left) → flip back.
  // Net effect: device on left, background on right = RTL layout.
  if (rtl) {
    composed = await sharp(composed)
      .flop()
      .png({ compressionLevel: 9, quality: 100 })
      .toBuffer();
  }

  return composed;
}

// ── LEGACY FUNCTION (BACKWARD COMPATIBILITY) ──────────────────────────────────

/**
 * Legacy composeScreenshot signature (without LayoutMap).
 * Provided for backward compatibility. Uses default (Pixel 9 Pro) frame.
 *
 * @deprecated Use composeScreenshot(background, layoutMap, locale) instead
 */
export async function composeScreenshotLegacy(
  background: Buffer,
  frame: Buffer | null,
  locale: string,
): Promise<Buffer> {
  const rtl = isRTLLocale(locale);

  let bg = sharp(background)
    .resize(CANVAS_W, CANVAS_H, { fit: "fill", kernel: sharp.kernel.lanczos3 });

  if (rtl) {
    bg = bg.flop();
  }

  const bgBuffer = await bg.png().toBuffer();
  const frameBuffer = frame ?? await getAndroidFrameBuffer();

  const { frameW, frameH, frameLeft, frameTop } = getFrameGeometry(rtl);

  const resizedFrame = await sharp(frameBuffer)
    .resize(frameW, frameH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  const overlayOptions: OverlayOptions = {
    input: resizedFrame,
    top: frameTop,
    left: frameLeft,
    blend: "over",
  };

  let composed = await sharp(bgBuffer)
    .composite([overlayOptions])
    .png({ compressionLevel: 9, quality: 100 })
    .toBuffer();

  if (rtl) {
    composed = await sharp(composed)
      .flop()
      .png({ compressionLevel: 9, quality: 100 })
      .toBuffer();
  }

  return composed;
}

// ── BATCH HELPER ──────────────────────────────────────────────────────────────

/**
 * Composes multiple background buffers in parallel with the same LayoutMap + locale.
 * Useful for processing all 6 slides at once with consistent schema styling.
 *
 * @param backgrounds  Array of background PNG/JPEG buffers (one per slide)
 * @param layoutMap    Shared LayoutMap for all slides (schema metadata)
 * @param locale       BCP-47 locale string
 * @returns            Array of composed PNG buffers in the same order
 */
export async function composeScreenshotBatch(
  backgrounds: Buffer[],
  layoutMap: LayoutMap,
  locale: string,
): Promise<Buffer[]> {
  return Promise.all(
    backgrounds.map((bg) => composeScreenshot(bg, layoutMap, locale))
  );
}

// ── LEGACY BATCH HELPER (BACKWARD COMPATIBILITY) ───────────────────────────────

/**
 * Legacy batch compose (without LayoutMap).
 *
 * @deprecated Use composeScreenshotBatch(backgrounds, layoutMap, locale) instead
 */
export async function composeScreenshotBatchLegacy(
  backgrounds: Buffer[],
  frame: Buffer | null,
  locale: string,
): Promise<Buffer[]> {
  const sharedFrame = frame ?? await getAndroidFrameBuffer();
  return Promise.all(
    backgrounds.map((bg) => composeScreenshotLegacy(bg, sharedFrame, locale))
  );
}

// ── BANNER COMPOSITION (1024×500 WITH SCRIM) ────────────────────────────────────

/**
 * Composes a Google Play Store banner (1024×500) with text scrim overlay.
 *
 * PRODUCTION-SAFE: Implements full RTL flop-composite-flop on entire composition.
 * The scrim ensures text readability by applying a semi-transparent dark overlay
 * (40% opacity, #1a1a1a) behind the text zone.
 *
 * RTL Flow (Arabic):
 *   1. Scale background to 1024×500
 *   2. Flop background (content mirrors right)
 *   3. Create scrim in LEFT third (text zone for flipped layout)
 *   4. Composite scrim + background
 *   5. FLOP ENTIRE COMPOSITION BACK (critical for visual balance)
 *   6. Result: Device on left, text zone on left = RTL-correct
 *
 * LTR Flow (English):
 *   1. Scale background to 1024×500
 *   2. No flop (content faces left)
 *   3. Create scrim in RIGHT third (text zone)
 *   4. Composite scrim + background
 *   5. No final flop
 *   6. Result: Content on left, text zone on right = LTR-correct
 *
 * Features:
 *   • Scrim: 40% dark overlay (#1a1a1a) in safe text zone
 *   • RTL: Full flop-composite-flop (entire composition, not just frame)
 *   • Text Zone: Smart positioning (right third LTR, left third RTL)
 *   • Lossless: PNG compression level 9 (highest quality)
 *
 * @param background  PNG/JPEG buffer from Runware (1024×500 preferred)
 * @param layoutMap   LayoutMap with schema metadata + typography config
 * @param locale      BCP-47 locale string ("en", "ar", "ar-SA", etc.)
 * @returns           Optimized PNG buffer at exactly 1024×500
 *
 * @example
 *   // English banner
 *   const enPng = await composeBanner(bgBuffer, layoutMap, "en");
 *   // Result: Content LEFT, scrim + text RIGHT
 *
 *   // Arabic banner (RTL)
 *   const arPng = await composeBanner(bgBuffer, layoutMap, "ar");
 *   // Result: Content RIGHT, scrim + text LEFT (after flop-back)
 */
export async function composeBanner(
  background: Buffer,
  layoutMap: LayoutMap,
  locale: string,
): Promise<Buffer> {
  const rtl = isRTLLocale(locale);
  const BANNER_W = 1024;
  const BANNER_H = 500;

  console.log(
    `[composeBanner] Composing banner: locale=${locale}, rtl=${rtl}, schema=${layoutMap.selectedSchema}`
  );

  // ── 1. Scale background to banner dimensions ──────────────────────────────
  let bg = sharp(background).resize(BANNER_W, BANNER_H, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  });

  // ── 2. For RTL: FLIP BACKGROUND (first step of flop-composite-flop) ────────
  if (rtl) {
    console.log(
      `[composeBanner] RTL detected: Flopping background for right-to-left layout`
    );
    bg = bg.flop();
  }

  const bgBuffer = await bg.png().toBuffer();
  console.log(`[composeBanner] Background scaled to ${BANNER_W}×${BANNER_H}`);

  // ── 3. CREATE SCRIM OVERLAY FOR TEXT READABILITY ──────────────────────────
  // Scrim properties:
  //   - Color: Dark grey (#1a1a1a)
  //   - Opacity: 40% (alpha: 0.4)
  //   - Position: Right third (LTR) / Left third (RTL after flop)
  //   - Width: 1024 / 3 = 341px
  //   - Height: 500px (full height)

  const textZoneWidth = Math.round(BANNER_W / 3); // 341px
  const textZoneLeft = rtl ? 0 : BANNER_W - textZoneWidth; // LTR: right | RTL: left

  console.log(
    `[composeBanner] Scrim zone: left=${textZoneLeft}, width=${textZoneWidth}, opacity=40%`
  );

  // Create scrim as transparent rectangle
  const scrimBuffer = await sharp({
    create: {
      width: textZoneWidth,
      height: BANNER_H,
      channels: 4,
      background: { r: 26, g: 26, b: 26, alpha: 0.4 }, // Dark grey, 40% opacity
    },
  })
    .png()
    .toBuffer();

  // ── 4. COMPOSITE SCRIM OVER BACKGROUND ───────────────────────────────────
  const scrimOptions: OverlayOptions = {
    input: scrimBuffer,
    top: 0,
    left: textZoneLeft,
    blend: "over", // Standard alpha compositing
  };

  let composed = await sharp(bgBuffer)
    .composite([scrimOptions])
    .png({ compressionLevel: 9, quality: 100 })
    .toBuffer();

  console.log(
    `[composeBanner] Scrim composited: position=${rtl ? "left" : "right"}, opacity=40%`
  );

  // ── 5. FOR RTL: FLOP ENTIRE COMPOSITION BACK (critical for visual balance) ──
  // This is the crucial "flop-back" step:
  //   - Background was flopped (content mirrored)
  //   - Scrim was placed on left (for flipped layout)
  //   - Now flip everything back
  //   - Net effect: content on right, scrim on left = RTL-correct visual balance
  if (rtl) {
    console.log(
      `[composeBanner] Applying flop-back to entire composition (critical RTL step)`
    );
    composed = await sharp(composed)
      .flop()
      .png({ compressionLevel: 9, quality: 100 })
      .toBuffer();
    console.log(
      `[composeBanner] ✓ Flop-composite-flop complete: Visual balance maintained for RTL`
    );
  }

  console.log(`[composeBanner] ✓ Banner composition complete: 1024×500, lossless PNG`);

  return composed;
}

// ── ICON COMPOSITION (512×512 CENTERED) ────────────────────────────────────────

/**
 * Composes an app icon (512×512 → 192×192 for Play Store).
 * Icons are centered, minimalist, with no device frames or text.
 * No RTL special handling needed (universal visual).
 *
 * @param background  PNG/JPEG buffer from Runware (will be scaled to 512×512)
 * @param layoutMap   LayoutMap with icon metadata + schema
 * @returns           Optimized PNG buffer at exactly 512×512
 *
 * @example
 *   const png = await composeIcon(bgBuffer, layoutMap);
 *   // Icon ready for Play Store upload at 192×192
 */
export async function composeIcon(
  background: Buffer,
  layoutMap: LayoutMap,
): Promise<Buffer> {
  const ICON_W = 512;
  const ICON_H = 512;

  // ── 1. Scale background to icon dimensions with centered fit ───────────────
  // Use 'contain' to preserve aspect ratio; fill with schema background color
  const schemaColor = layoutMap.typographyConfig?.primaryColor ?? "#1E293B";
  const rgb = parseInt(schemaColor.slice(1), 16);
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;

  const composed = await sharp(background)
    .resize(ICON_W, ICON_H, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r, g, b, alpha: 1 },
    })
    .png({ compressionLevel: 9, quality: 100 })
    .toBuffer();

  return composed;
}

// ── VALIDATION & HEALTH CHECK ──────────────────────────────────────────────────

/**
 * Diagnostic Report from asset validation
 */
export interface AssetValidationReport {
  /** Overall health: 'healthy' | 'degraded' | 'critical' */
  health: "healthy" | "degraded" | "critical";
  /** Timestamp of validation */
  timestamp: string;
  /** Summary message */
  summary: string;
  /** Schema asset validation results */
  schemas: Record<
    MoodSchemaType,
    {
      frame: boolean;
      badge: boolean;
      path: string;
    }
  >;
  /** Font validation results */
  fonts: Record<"bold" | "elegant" | "clean", { exists: boolean; path: string }>;
  /** List of missing assets (if any) */
  missing: string[];
  /** List of warnings */
  warnings: string[];
}

/**
 * Validates all composition assets (schemas, frames, fonts) with detailed diagnostics.
 * Returns a comprehensive report instead of throwing errors.
 * Logs clear warnings for missing assets.
 *
 * @returns Detailed validation report with health status and missing assets
 *
 * @example
 *   const report = await validateCompositionAssets();
 *   if (report.health === 'degraded') {
 *     console.warn('Asset warnings:', report.warnings);
 *   }
 */
export async function validateCompositionAssets(): Promise<AssetValidationReport> {
  const missing: string[] = [];
  const warnings: string[] = [];
  const schemaResults: Record<
    MoodSchemaType,
    { frame: boolean; badge: boolean; path: string }
  > = {} as Record<
    MoodSchemaType,
    { frame: boolean; badge: boolean; path: string }
  >;
  const fontResults: Record<
    "bold" | "elegant" | "clean",
    { exists: boolean; path: string }
  > = {
    bold: { exists: false, path: "" },
    elegant: { exists: false, path: "" },
    clean: { exists: false, path: "" },
  };

  // ── 1. Validate all schema assets ──────────────────────────────────────────
  console.log("[asset-validation] Starting composition asset validation...");

  for (const schemaId of Object.keys(MOOD_SCHEMAS) as MoodSchemaType[]) {
    const assets = resolveSchemaAssets(schemaId);
    const hasFrame = await validateSchemaAssets(assets);
    const hasBadge = await fs
      .access(assets.badgePngPath)
      .then(() => true)
      .catch(() => false);

    schemaResults[schemaId] = {
      frame: hasFrame,
      badge: hasBadge,
      path: assets.assetFolder,
    };

    if (!hasFrame) {
      const msg = `Missing frame.svg for schema '${schemaId}' at ${assets.frameSvgPath}`;
      missing.push(msg);
      warnings.push(msg);
      console.warn(`[asset-validation] ⚠️  ${msg}`);
    }

    if (!hasBadge) {
      const msg = `Missing badge.png for schema '${schemaId}' at ${assets.badgePngPath}`;
      warnings.push(msg);
      console.warn(`[asset-validation] ⚠️  ${msg}`);
    }

    if (hasFrame && hasBadge) {
      console.log(`[asset-validation] ✓ Schema '${schemaId}' fully equipped`);
    } else if (hasFrame) {
      console.log(
        `[asset-validation] ⚠️  Schema '${schemaId}' has frame but missing badge`
      );
    }
  }

  // ── 2. Validate all font files ────────────────────────────────────────────
  const fontStyles = ["bold", "elegant", "clean"] as const;
  for (const fontStyle of fontStyles) {
    const fontPath = FONT_PATHS[fontStyle];
    const exists = await fs
      .access(fontPath)
      .then(() => true)
      .catch(() => false);

    fontResults[fontStyle] = { exists, path: fontPath };

    if (!exists) {
      const msg = `Missing font file '${fontStyle}' at ${fontPath}`;
      missing.push(msg);
      warnings.push(msg);
      console.warn(`[asset-validation] ⚠️  ${msg}`);
    } else {
      console.log(`[asset-validation] ✓ Font '${fontStyle}' found`);
    }
  }

  // ── 3. Determine health status ────────────────────────────────────────────
  let health: "healthy" | "degraded" | "critical";
  let summary: string;

  if (missing.length === 0) {
    health = "healthy";
    summary = "All composition assets validated successfully ✓";
    console.log(`[asset-validation] ${summary}`);
  } else if (missing.filter((m) => m.includes("frame.svg")).length > 0) {
    // Frame missing = critical (composition can't work)
    health = "critical";
    const frameMissing = missing.filter((m) => m.includes("frame.svg")).length;
    summary = `CRITICAL: ${frameMissing} schema frame files missing (system will fall back to built-in Pixel 9 Pro)`;
    console.error(`[asset-validation] ❌ ${summary}`);
  } else {
    // Only non-critical assets missing (badges, etc.)
    health = "degraded";
    summary = `${missing.length} asset(s) missing but system is functional (using fallbacks)`;
    console.warn(`[asset-validation] ⚠️  ${summary}`);
  }

  const report: AssetValidationReport = {
    health,
    timestamp: new Date().toISOString(),
    summary,
    schemas: schemaResults,
    fonts: fontResults,
    missing,
    warnings,
  };

  console.log(
    `[asset-validation] Health: ${health} | Missing: ${missing.length} | Warnings: ${warnings.length}`
  );

  return report;
}

/**
 * Legacy function that throws on missing assets.
 * Deprecated: Use validateCompositionAssets() instead for safe validation.
 *
 * @deprecated Use validateCompositionAssets() for detailed diagnostics
 * @throws Error if any critical assets are missing
 */
export async function validateCompositionAssetsStrict(): Promise<void> {
  const report = await validateCompositionAssets();
  if (report.health === "critical") {
    throw new Error(
      `Composition assets critical: ${report.missing.map((m) => `\n  - ${m}`).join("")}`
    );
  }
}
