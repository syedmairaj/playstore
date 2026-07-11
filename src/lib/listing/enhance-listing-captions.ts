import type { ScreenshotCaption } from "@/lib/listing/listing-version.types";
import { ASO_PLAY_STORE_LIMITS } from "@/lib/gemini/prompt-builder";

const CAPTION_MAX = ASO_PLAY_STORE_LIMITS.caption;
const UIFOCUS_MAX = 300;

/** Maps caption keywords to concrete UI scenes for screenshot alignment. */
const CAPTION_UI_ALIGNMENT: Array<{ pattern: RegExp; uiScene: string }> = [
  { pattern: /\bscan\b|\bscanner\b|\bbarcode\b/i, uiScene: "Scan screen with camera viewfinder and label capture UI" },
  { pattern: /\bblood pressure\b|\bbp\b/i, uiScene: "Blood pressure log chart with systolic/diastolic readings" },
  { pattern: /\bglucose|sugar|diabetes|a1c\b/i, uiScene: "Glucose tracker chart with trend line and daily readings" },
  { pattern: /\blog\b|\brecord\b|\btrack\b|\bjournal\b/i, uiScene: "Daily health log entry screen with input fields" },
  { pattern: /\bremind|\balert|\bnotif/i, uiScene: "Reminder settings panel with toggle switches" },
  { pattern: /\breport|\bexport|\bshare\b/i, uiScene: "Health report summary screen with share action" },
  { pattern: /\bdashboard|\boverview\b|\binsight/i, uiScene: "Health dashboard overview with key metric cards" },
  { pattern: /\binstall|\bstart|\btry\b|\bget\b/i, uiScene: "Hero onboarding screen with primary CTA button" },
];

export function captionMentionsBrand(caption: string, appName: string): boolean {
  const brand = appName.trim().toLowerCase();
  if (!brand) return true;
  const text = caption.toLowerCase();
  if (text.includes(brand)) return true;
  // Match first significant word for multi-word brands (e.g. "salt" from "salt sugar").
  const firstToken = brand.split(/\s+/)[0];
  return firstToken.length >= 3 && text.includes(firstToken);
}

/**
 * Ensure at least one caption names or implies the app brand (Gemini Brandifier).
 */
export function applyBrandifier(
  captions: ScreenshotCaption[],
  appName: string,
): ScreenshotCaption[] {
  const brand = appName.trim();
  if (!brand || captions.length === 0) return captions;
  if (captions.some((c) => captionMentionsBrand(c.caption, brand))) {
    return captions;
  }

  const targetIdx =
    captions.findIndex((c) => c.theme === "cta") >= 0
      ? captions.findIndex((c) => c.theme === "cta")
      : captions.length - 1;

  return captions.map((caption, idx) => {
    if (idx !== targetIdx) return caption;
    return {
      ...caption,
      caption: weaveBrandIntoCaption(caption.caption, brand),
    };
  });
}

export function weaveBrandIntoCaption(caption: string, appName: string, maxLen = CAPTION_MAX): string {
  const brand = appName.trim();
  if (!brand || captionMentionsBrand(caption, brand)) {
    return caption.trim().slice(0, maxLen);
  }

  const candidates = [
    `${caption.replace(/[!.?]+$/, "")} with ${brand}.`,
    `${caption.replace(/[!.?]+$/, "")} — ${brand}.`,
    `${brand}: ${caption}`,
    `Try ${brand} — ${caption}`,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed.length <= maxLen) return trimmed;
  }

  const fallback = `${caption.replace(/[!.?]+$/, "")} with ${brand}.`;
  return fallback.slice(0, maxLen).trim();
}

/**
 * Align uiFocus with the capability named in each caption (screenshot-visual parity).
 */
export function alignCaptionUiFocus(caption: ScreenshotCaption): ScreenshotCaption {
  const uiFocus = caption.uiFocus?.trim() ?? "";
  if (!caption.caption.trim() || !uiFocus) return caption;

  for (const { pattern, uiScene } of CAPTION_UI_ALIGNMENT) {
    if (!pattern.test(caption.caption)) continue;

    const sceneToken = uiScene.split(/\s+/)[0]?.toLowerCase() ?? "";
    const focusLower = uiFocus.toLowerCase();
    const alreadyAligned =
      focusLower.includes(sceneToken) ||
      (pattern.source.includes("scan") && /\bscan|camera|viewfinder\b/i.test(uiFocus));

    if (!alreadyAligned) {
      const merged = uiFocus ? `${uiScene}; ${uiFocus}` : uiScene;
      return { ...caption, uiFocus: merged.slice(0, UIFOCUS_MAX) };
    }
    break;
  }

  return caption;
}

export type EnhanceListingCaptionsInput = {
  appName: string;
  listingTitle?: string;
};

/**
 * Post-process model captions: brand recall + uiFocus/screenshot alignment.
 * Safe to run on every pipeline response — idempotent when already aligned.
 */
export function enhanceListingCaptions(
  captions: ScreenshotCaption[],
  input: EnhanceListingCaptionsInput,
): ScreenshotCaption[] {
  if (captions.length === 0) return captions;

  const brandSource = input.listingTitle?.trim() || input.appName.trim();
  const withBrand = applyBrandifier(captions, brandSource);
  return withBrand.map(alignCaptionUiFocus);
}
