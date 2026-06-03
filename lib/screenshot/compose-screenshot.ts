import "server-only";
/**
 * compose-screenshot.ts — Server-side Composition-First pipeline
 *
 * Architecture:
 *   AI generates ONLY pure background art (gradient + atmosphere, no device).
 *   This module composites the static Android frame on top deterministically.
 *   Result: 100% device consistency across every generation, every locale.
 *
 * Canvas spec: 1080×1920 px (Play Store portrait screenshot)
 * Frame asset:  Pixel 9 Pro SVG → rendered to 1080×2340, then cropped/fitted
 *
 * LTR (English):  device frame positioned in the RIGHT zone
 * RTL (Arabic):   device frame mirrored to the LEFT zone
 *                 sharp does not have a built-in flip-horizontal for composite,
 *                 so for RTL we flip the background image instead, composite
 *                 the frame (always rendered LTR), then flip the entire canvas
 *                 back — net result: device on left, content on right.
 *
 * Text overlays are NOT applied here — they are baked at export time on the
 * client canvas so font rendering stays sharp at the user's actual screen DPI.
 */

import sharp, { OverlayOptions } from "sharp";
import { getAndroidFrameBuffer } from "./android-frame";

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

// ── Core composition function ─────────────────────────────────────────────────

/**
 * Composes a Play Store screenshot by overlaying the Android device frame
 * on top of the AI-generated background image.
 *
 * @param background  PNG/JPEG buffer from Runware (any resolution — will be scaled)
 * @param frame       PNG buffer of the Android frame asset. If omitted, the
 *                    built-in Pixel 9 Pro frame is used automatically.
 * @param locale      BCP-47 locale string ("en", "ar", "ar-SA", etc.)
 * @returns           Lossless PNG buffer at exactly CANVAS_W × CANVAS_H
 *
 * @example
 *   const png = await composeScreenshot(bgBuffer, null, "ar");
 *   await fs.writeFile("slide-1.png", png);
 */
export async function composeScreenshot(
  background: Buffer,
  frame: Buffer | null,
  locale: string,
): Promise<Buffer> {
  const rtl = isRTLLocale(locale);

  // ── 1. Scale background to canvas (fill, no letterbox) ───────────────────
  // Background from Runware is 1024×1792 — upscale to 1080×1920.
  let bg = sharp(background)
    .resize(CANVAS_W, CANVAS_H, { fit: "fill", kernel: sharp.kernel.lanczos3 });

  // ── 2. For RTL: flip background horizontally so content faces the right ──
  // We flip the background (not the frame) because the frame is a symmetric
  // device shape — flipping background + not flipping frame = device-on-left,
  // content-on-right with correct reading direction.
  if (rtl) {
    bg = bg.flop(); // horizontal flip
  }

  const bgBuffer = await bg.png().toBuffer();

  // ── 3. Get frame buffer ──────────────────────────────────────────────────
  const frameBuffer = frame ?? await getAndroidFrameBuffer();

  // ── 4. Compute frame placement ───────────────────────────────────────────
  // For RTL we already flipped the BG, so frame placement uses LTR coords
  // on the flipped canvas — which visually places it on the left when viewed
  // in the correct reading orientation.
  const { frameW, frameH, frameLeft, frameTop } = getFrameGeometry(
    rtl, // RTL still uses left-placement geometry on the flipped canvas
  );

  // Resize frame asset to match computed frame zone
  const resizedFrame = await sharp(frameBuffer)
    .resize(frameW, frameH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  // ── 5. Composite frame over background ──────────────────────────────────
  const overlayOptions: OverlayOptions = {
    input:  resizedFrame,
    top:    frameTop,
    left:   frameLeft,
    blend:  "over",        // standard alpha compositing
  };

  let composed = await sharp(bgBuffer)
    .composite([overlayOptions])
    .png({ compressionLevel: 9, quality: 100 }) // lossless — no text artefacts
    .toBuffer();

  // ── 6. For RTL: flip the entire composed image back ──────────────────────
  // BG was flipped → frame composited (now on left) → flip back.
  // Net effect: device on left, background content on right = RTL layout.
  if (rtl) {
    composed = await sharp(composed)
      .flop()
      .png({ compressionLevel: 9, quality: 100 })
      .toBuffer();
  }

  return composed;
}

// ── Batch helper ──────────────────────────────────────────────────────────────

/**
 * Composes multiple background buffers in parallel with the same frame + locale.
 * Useful for processing all 6 slides at once.
 *
 * @param backgrounds  Array of background PNG/JPEG buffers (one per slide)
 * @param frame        Shared frame buffer, or null to use built-in Pixel 9 Pro
 * @param locale       BCP-47 locale string
 * @returns            Array of composed PNG buffers in the same order
 */
export async function composeScreenshotBatch(
  backgrounds: Buffer[],
  frame: Buffer | null,
  locale: string,
): Promise<Buffer[]> {
  // Pre-fetch and cache the frame buffer once for the whole batch
  const sharedFrame = frame ?? await getAndroidFrameBuffer();
  return Promise.all(
    backgrounds.map((bg) => composeScreenshot(bg, sharedFrame, locale)),
  );
}
