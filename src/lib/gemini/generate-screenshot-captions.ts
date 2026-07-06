import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import type { ScreenshotCaption } from "@/lib/listing/listing-version.types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CaptionTone = "feature" | "benefit" | "emotional";

export type ScreenshotSlide = {
  /** Slide position: 1 = hero, 2 = feature highlight, 3 = social proof / CTA */
  position: 1 | 2 | 3;
  /** Short bold headline — max 40 chars, shown large on the screenshot */
  headline: string;
  /** Supporting sub-copy — max 70 chars, shown smaller below the headline */
  subline: string;
  /** What UI element / feature the screenshot background should highlight */
  uiFocus: string;
};

export type CaptionVariation = {
  tone: CaptionTone;
  /** Human-readable label shown in the UI */
  toneLabel: string;
  toneLabelAr: string;
  slides: [ScreenshotSlide, ScreenshotSlide, ScreenshotSlide];
  /** Arabic mirror of the same slides — RTL-ready copy */
  slidesAr: [ScreenshotSlide, ScreenshotSlide, ScreenshotSlide];
};

export type GenerateScreenshotCaptionsInput = {
  appName: string;
  category: string;
  shortDescription?: string;
  /** Optimized listing title from Listing Optimizer, if available */
  listingTitle?: string;
  /** Feature bullets from Listing Optimizer, if available */
  features?: string;
  style: string;        // e.g. "Modern", "Minimalist"
  brandColor?: string;  // hex, e.g. "#1A73E8"
  locale?: "en" | "ar";
};

export type GenerateScreenshotCaptionsResult = {
  variations: [CaptionVariation, CaptionVariation, CaptionVariation];
};

// ─────────────────────────────────────────────────────────────────────────────
// Structured-output schema
// ─────────────────────────────────────────────────────────────────────────────

const SLIDE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    position: { type: SchemaType.INTEGER },
    headline: { type: SchemaType.STRING },
    subline: { type: SchemaType.STRING },
    uiFocus: { type: SchemaType.STRING },
  },
  required: ["position", "headline", "subline", "uiFocus"],
};

const VARIATION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    tone: { type: SchemaType.STRING },
    toneLabel: { type: SchemaType.STRING },
    toneLabelAr: { type: SchemaType.STRING },
    slides: { type: SchemaType.ARRAY, items: SLIDE_SCHEMA },
    slidesAr: { type: SchemaType.ARRAY, items: SLIDE_SCHEMA },
  },
  required: ["tone", "toneLabel", "toneLabelAr", "slides", "slidesAr"],
};

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    variations: { type: SchemaType.ARRAY, items: VARIATION_SCHEMA },
  },
  required: ["variations"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(input: GenerateScreenshotCaptionsInput): string {
  const { appName, category, shortDescription, listingTitle, features, style, brandColor } = input;

  const contextParts: string[] = [
    `App name: "${appName}"`,
    `Category: ${category}`,
  ];
  if (listingTitle) contextParts.push(`Optimized Play Store title: "${listingTitle}"`);
  if (shortDescription) contextParts.push(`Short description: "${shortDescription}"`);
  if (features) contextParts.push(`Key features:\n${features}`);
  if (brandColor) contextParts.push(`Brand color: ${brandColor}`);
  contextParts.push(`Visual style: ${style}`);

  return `You are an ASO (App Store Optimisation) conversion expert specialising in Google Play screenshot copy.

Research shows users spend only ~7 seconds scanning screenshots. The first 3 screenshots drive 80%+ of install decisions. Your job is to write conversion-first copy for those 3 slides.

APP CONTEXT
-----------
${contextParts.join("\n")}

TASK
----
Generate exactly 3 caption variation sets for the first 3 Play Store screenshots. Each variation must have a distinct copywriting TONE:

1. "feature" — Feature-led: highlight WHAT the app does (specific functionality, speed, accuracy).
2. "benefit" — Benefit-led: highlight HOW the user's life improves (time saved, stress removed, goal reached).
3. "emotional" — Emotional-led: tap into the feeling or identity shift the user experiences.

For each variation, produce exactly 3 slides:
- Slide 1 (position: 1) — HERO: the single biggest value proposition. This is the most important slide.
- Slide 2 (position: 2) — FEATURE HIGHLIGHT: one specific, tangible capability.
- Slide 3 (position: 3) — SOCIAL PROOF / CTA: trust signal or action prompt.

For every slide in every variation, produce BOTH English ("slides") and Arabic ("slidesAr") copy.

RULES
-----
- headline: max 40 characters. Bold, punchy, no filler words.
- subline: max 70 characters. One clear supporting sentence.
- uiFocus: describe the UI element the screenshot background should show (e.g. "dark mode dashboard with habit streak chart", "settings screen with RTL Arabic layout active").
- Arabic copy must be natural Modern Standard Arabic suitable for a global Arabic audience — not a literal translation. Mirror the emotional punch of the English.
- Do NOT use generic filler like "Download now" or "Try for free" as a headline.
- ASO best practice: front-load the value in the headline. No preamble.

Return JSON matching the schema exactly. tone must be one of: "feature", "benefit", "emotional".`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function clampStr(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

function parseSlide(raw: unknown, pos: 1 | 2 | 3): ScreenshotSlide {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    position: pos,
    headline: clampStr(r.headline, 40),
    subline: clampStr(r.subline, 70),
    uiFocus: clampStr(r.uiFocus, 200),
  };
}

function parseVariation(raw: unknown, index: number): CaptionVariation {
  const r = (raw ?? {}) as Record<string, unknown>;
  const toneRaw = typeof r.tone === "string" ? r.tone : "feature";
  const tone: CaptionTone = (["feature", "benefit", "emotional"] as CaptionTone[]).includes(toneRaw as CaptionTone)
    ? (toneRaw as CaptionTone)
    : "feature";

  const LABELS: Record<CaptionTone, [string, string]> = {
    feature: ["Feature-led", "مُوجَّه بالميزات"],
    benefit: ["Benefit-led", "مُوجَّه بالفوائد"],
    emotional: ["Emotional-led", "مُوجَّه بالمشاعر"],
  };

  const slidesRaw = Array.isArray(r.slides) ? r.slides : [];
  const slidesArRaw = Array.isArray(r.slidesAr) ? r.slidesAr : [];

  const slides: [ScreenshotSlide, ScreenshotSlide, ScreenshotSlide] = [
    parseSlide(slidesRaw[0], 1),
    parseSlide(slidesRaw[1], 2),
    parseSlide(slidesRaw[2], 3),
  ];
  const slidesAr: [ScreenshotSlide, ScreenshotSlide, ScreenshotSlide] = [
    parseSlide(slidesArRaw[0] ?? slidesRaw[0], 1),
    parseSlide(slidesArRaw[1] ?? slidesRaw[1], 2),
    parseSlide(slidesArRaw[2] ?? slidesRaw[2], 3),
  ];

  return {
    tone,
    toneLabel: clampStr(r.toneLabel, 40) || LABELS[tone][0],
    toneLabelAr: clampStr(r.toneLabelAr, 60) || LABELS[tone][1],
    slides,
    slidesAr,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function generateScreenshotCaptions(
  input: GenerateScreenshotCaptionsInput,
): Promise<GenerateScreenshotCaptionsResult> {
  // ✅ REFACTORED: Use centralized Vertex AI gateway (no API key needed)
  const model = getGenerativeModel();

  const prompt = buildPrompt(input);
  const result = await model.generateContent(prompt);
  const text = (result.text ?? "").trim();

  let parsed: unknown;
  try {
    const clean = text.startsWith("```") ? text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim() : text;
    parsed = JSON.parse(clean);
  } catch {
    throw new InvalidModelOutputError(`Screenshot captions: JSON parse failed. Raw: ${text.slice(0, 300)}`);
  }

  const root = (parsed ?? {}) as Record<string, unknown>;
  const rawVariations = Array.isArray(root.variations) ? root.variations : [];

  // Ensure we always have exactly 3 variations
  const toneOrder: CaptionTone[] = ["feature", "benefit", "emotional"];
  const variations = toneOrder.map((expectedTone, i) => {
    // Try to match by tone first, fall back to position
    const match = rawVariations.find((v) => {
      const rv = (v ?? {}) as Record<string, unknown>;
      return rv.tone === expectedTone;
    }) ?? rawVariations[i];
    const variation = parseVariation(match, i);
    return { ...variation, tone: expectedTone };
  }) as [CaptionVariation, CaptionVariation, CaptionVariation];

  return { variations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing-pipeline captions (new: step "captions" in modular pipeline)
// ─────────────────────────────────────────────────────────────────────────────
//
// Unlike the visual screenshot generator above (which produces EN+AR overlay
// copy for 3 slides), this generates 6–8 short Google Play screenshot
// captions derived from the long description tone.  These are stored in
// listing_versions.screenshot_captions and shown in the DeploymentView.
//

export type ListingCaptionsBrandKit = {
  /** Primary hex color, e.g. "#1A73E8" — used in uiFocus descriptions */
  primaryColor?: string | null;
  /** Secondary palette, e.g. "#FF4081, #212121" */
  colorPalette?: string | null;
  /** Visual style descriptor, e.g. "Modern", "Minimal", "Bold" */
  style?: string | null;
  /** Free-text tone / brand voice guidelines */
  toneGuidelines?: string | null;
};

export type ListingCaptionsInput = {
  appName: string;
  category: string;
  /** Assembled long description (full text or just the features block). */
  longDescription: string;
  locale: "en" | "ar";
  /** Optional: locked keywords to surface in captions. */
  lockedKeywords?: string[];
  /**
   * Brand Kit — when provided, the caption uiFocus descriptions will reference
   * the brand color palette and visual style so the output can guide Runware
   * (or any image-generation API) for screenshot backgrounds.
   */
  brandKit?: ListingCaptionsBrandKit;
};

export type ListingCaptionsResult = {
  captions: ScreenshotCaption[];
};

/**
 * Exported so tests can assert the schema shape directly.
 *
 * "uiFocus" is in `required` so Gemini's structured-output enforcement
 * guarantees every caption item carries the screenshot background description.
 */
export const LISTING_CAPTIONS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    captions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          order:    { type: SchemaType.INTEGER },
          caption:  { type: SchemaType.STRING },
          theme:    { type: SchemaType.STRING },
          // uiFocus drives Runware screenshot background generation
          uiFocus:  { type: SchemaType.STRING },
        },
        required: ["order", "caption", "theme", "uiFocus"],
      },
    },
  },
  required: ["captions"],
};

function buildListingCaptionsPrompt(input: ListingCaptionsInput): string {
  const { appName, category, longDescription, locale, lockedKeywords, brandKit } = input;
  const isAr = locale === "ar";

  const keywordLine =
    lockedKeywords && lockedKeywords.length > 0
      ? `Key ASO keywords to surface (use naturally): ${lockedKeywords.slice(0, 5).join(", ")}`
      : "";

  const toneInstruction = isAr
    ? "Write in natural Modern Standard Arabic (MSA). Mirror the emotional tone of the description. Do NOT transliterate — use full Arabic script."
    : "Write in English that matches the tone and voice of the long description below.";

  // Brand Kit context for asset-bound captions (uiFocus drives Runware screenshot backgrounds)
  const brandKitLines: string[] = [];
  if (brandKit) {
    if (brandKit.style) brandKitLines.push(`Visual style: ${brandKit.style}`);
    if (brandKit.primaryColor) brandKitLines.push(`Primary brand color: ${brandKit.primaryColor}`);
    if (brandKit.colorPalette) brandKitLines.push(`Color palette: ${brandKit.colorPalette}`);
    if (brandKit.toneGuidelines) brandKitLines.push(`Brand tone: ${brandKit.toneGuidelines}`);
  }

  const brandKitBlock =
    brandKitLines.length > 0
      ? `\nBRAND KIT (apply to uiFocus descriptions — these guide screenshot background generation)\n-----------\n${brandKitLines.join("\n")}`
      : "";

  return `You are a Google Play Store ASO expert.

Generate exactly 7 screenshot captions for the Play Store listing carousel.
Each caption appears below one screenshot image and drives install conversions.

APP CONTEXT
-----------
App name: "${appName}"
Category: ${category}
${keywordLine}${brandKitBlock}

LONG DESCRIPTION (tone reference):
${longDescription.slice(0, 800)}

CAPTION STRUCTURE (one caption per screenshot):
1. Hook (theme: "hook")      — Opening value proposition. Why should someone care?
2. Feature (theme: "feature") — Core functionality. What does the app actually do?
3. Feature (theme: "feature") — Second key capability.
4. Feature (theme: "feature") — Third key capability.
5. Benefit (theme: "benefit") — How the user's life improves. Outcome-focused.
6. Benefit (theme: "benefit") — Another tangible benefit or result.
7. CTA (theme: "cta")        — Closing call-to-action. Motivational.

RULES
-----
- Each caption: max 70 characters. Short, punchy, no filler.
- Match the tone and voice of the long description above.
- ${toneInstruction}
- No emojis.
- No generic filler like "Download now" or "Available today".
- theme must be one of: "hook", "feature", "benefit", "cta".${brandKitLines.length > 0 ? "\n- uiFocus: describe the screenshot background using the Brand Kit palette and style above (e.g. \"minimal dark dashboard with #1A73E8 accent\")." : ""}

Return JSON with exactly 7 items:
{ "captions": [{ "order": 1, "caption": "...", "theme": "hook", "uiFocus": "..." }, ...] }

Every item MUST include "uiFocus": a short description (max 200 chars) of the screenshot background, grounded in the Brand Kit palette and style (e.g. "minimal dark dashboard with #1A73E8 accent stripe and habit-streak chart visible").`;
}

function parseListingCaption(
  raw: unknown,
  fallbackOrder: number,
): ScreenshotCaption {
  const r = (raw ?? {}) as Record<string, unknown>;
  const themeRaw = typeof r.theme === "string" ? r.theme : "feature";
  const theme = (["hook", "feature", "benefit", "cta"] as const).includes(
    themeRaw as "hook" | "feature" | "benefit" | "cta",
  )
    ? (themeRaw as "hook" | "feature" | "benefit" | "cta")
    : "feature";

  const uiFocusRaw = typeof r.uiFocus === "string" ? r.uiFocus.trim().slice(0, 300) : null;

  return {
    order: typeof r.order === "number" ? r.order : fallbackOrder,
    caption:
      typeof r.caption === "string"
        ? r.caption.trim().slice(0, 70)
        : "",
    theme,
    ...(uiFocusRaw ? { uiFocus: uiFocusRaw } : {}),
  };
}

/**
 * Generate 7 screenshot captions for a Play Store listing.
 * Derives tone from the long description — tightly linked to the modular
 * pipeline's `long` step output.
 *
 * Used by the `captions` generation step in the modular orchestrator.
 */
export async function generateListingPipelineCaptions(
  input: ListingCaptionsInput,
): Promise<ListingCaptionsResult> {
  // Pass the schema so Gemini uses structured output — this is what enforces
  // `uiFocus` being present on every caption item.
  // maxOutputTokens: 1200 — 7 captions × ~150 tokens (caption + uiFocus) + JSON overhead.
  // Default gateway value of 300 would truncate the response.
  const model = getGenerativeModel({
    responseMimeType: "application/json",
    responseSchema: LISTING_CAPTIONS_SCHEMA as Record<string, unknown>,
    maxOutputTokens: 1200,
  });
  const prompt = buildListingCaptionsPrompt(input);

  const result = await model.generateContent(prompt);
  const text = (result.text ?? "").trim();

  let parsed: unknown;
  try {
    const clean = text.startsWith("```")
      ? text
          .replace(/^```[a-zA-Z]*\n?/, "")
          .replace(/\n?```\s*$/, "")
          .trim()
      : text;
    parsed = JSON.parse(clean);
  } catch {
    throw new InvalidModelOutputError(
      `Listing captions: JSON parse failed. Raw: ${text.slice(0, 300)}`,
    );
  }

  const root = (parsed ?? {}) as Record<string, unknown>;
  const rawCaptions = Array.isArray(root.captions) ? root.captions : [];

  const captions: ScreenshotCaption[] = rawCaptions
    .slice(0, 8)
    .map((item: unknown, idx: number) => parseListingCaption(item, idx + 1));

  return { captions };
}
