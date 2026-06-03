import "server-only";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import {
  assertGeminiApiKey,
  mergeGeminiGenerationConfig,
  resolveGeminiModel,
} from "@/lib/gemini/gemini-defaults";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";

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
  const apiKey = assertGeminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: resolveGeminiModel(),
    generationConfig: mergeGeminiGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as Parameters<typeof mergeGeminiGenerationConfig>[0] extends never ? never : never,
      maxOutputTokens: 3000,
    }),
  });

  const prompt = buildPrompt(input);
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

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
