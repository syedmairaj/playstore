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

/**
 * LayoutMap — Gemini's "semantic layout engine" output.
 *
 * Drives two downstream systems:
 *  1. Runware FLUX prompt — backgroundPrompt + backgroundMood describe the
 *     pure atmospheric background (NO text, NO phone frame).
 *  2. Canvas compositor — textPosition, accentColor, textColor tell the
 *     bake-at-download canvas where and how to render the headline overlay.
 */
export type LayoutMap = {
  /** Natural-language Runware prompt for the BACKGROUND ONLY — no text, no UI chrome */
  backgroundPrompt: string;
  /** Negative prompt additions specific to this layout */
  negativeAdditions: string;
  /** Where the text block sits on the phone screen */
  textPosition: "top" | "center" | "bottom";
  /** Hex colour for headline text (chosen for contrast against backgroundMood) */
  textColor: "#ffffff" | "#111111";
  /** CSS hex for the brand accent overlay strip or glow (from Brand Kit or derived) */
  accentColor: string;
  /** Short label describing the visual atmosphere — used for cache key + debug */
  backgroundMood: string;
  /** Which phone UI element to simulate in the frame (shown as placeholder in frame) */
  uiMockDescription: string;
};

export type GenerateScreenshotLayoutInput = {
  appName: string;
  category: string;
  shortDescription?: string;
  headline: string;
  subline: string;
  uiFocus: string;
  style: string;
  brandColor?: string;
  locale: "en" | "ar";
  slideIndex: number; // 0=value_hook, 1-3=core_feature, 4=social_proof, 5=cta
};

// ─────────────────────────────────────────────────────────────────────────────
// Structured-output schema
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    backgroundPrompt: { type: SchemaType.STRING },
    negativeAdditions: { type: SchemaType.STRING },
    textPosition: { type: SchemaType.STRING },
    textColor: { type: SchemaType.STRING },
    accentColor: { type: SchemaType.STRING },
    backgroundMood: { type: SchemaType.STRING },
    uiMockDescription: { type: SchemaType.STRING },
  },
  required: [
    "backgroundPrompt", "negativeAdditions", "textPosition",
    "textColor", "accentColor", "backgroundMood", "uiMockDescription",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

const STYLE_ATMOSPHERE: Record<string, string> = {
  Minimalist: "ultra-clean, white space, soft gradients, breathing room, light and airy",
  Modern: "bold geometry, strong color blocks, flat vector shapes, contemporary",
  Bold: "high contrast, vivid saturated palette, dynamic diagonal composition, energetic",
  Playful: "rounded bubbly shapes, friendly bright colors, illustrated elements, fun",
  Professional: "corporate clean grid, muted tones, structured layout, trust-building",
  "Flat Design": "pure flat vector, solid fills, no gradients, clean iconographic",
};

function buildLayoutPrompt(input: GenerateScreenshotLayoutInput): string {
  const {
    appName, category, shortDescription, headline, subline,
    uiFocus, style, brandColor, locale, slideIndex,
  } = input;

  const SLIDE_ROLES = [
    "SLIDE 1 — VALUE HOOK (stop-scroll hero, biggest benefit)",
    "SLIDE 2 — CORE FEATURE (specific capability, concrete)",
    "SLIDE 3 — CORE FEATURE (second key capability)",
    "SLIDE 4 — CORE FEATURE (third key capability or differentiator)",
    "SLIDE 5 — SOCIAL PROOF (trust signal, outcome, credential)",
    "SLIDE 6 — CALL TO ACTION (urgency, transformation, final persuasion)",
  ];
  const slideRole = SLIDE_ROLES[slideIndex] ?? `SLIDE ${slideIndex + 1}`;

  const styleAtmosphere = STYLE_ATMOSPHERE[style] ?? STYLE_ATMOSPHERE.Modern;
  const isRTL = locale === "ar";

  const parts = [
    `You are an expert mobile app screenshot art director specialising in Google Play Store ASO.`,
    ``,
    `APP: "${appName}" (${category})`,
    shortDescription ? `SHORT DESC: ${shortDescription}` : null,
    ``,
    `SLIDE ROLE: ${slideRole}`,
    `HEADLINE: "${headline}"`,
    `SUB-CAPTION: "${subline}"`,
    `UI FOCUS: ${uiFocus}`,
    `VISUAL STYLE: ${styleAtmosphere}`,
    brandColor ? `BRAND COLOR: ${brandColor}` : null,
    isRTL ? `LAYOUT DIRECTION: Right-to-left (Arabic). Text flows right-to-left.` : null,
    ``,
    `TASK`,
    `----`,
    `Produce a LayoutMap JSON object that drives two systems:`,
    ``,
    `1. RUNWARE BACKGROUND PROMPT (backgroundPrompt):`,
    `   - Describe ONLY the atmospheric background image for a 9:16 portrait screenshot.`,
    `   - NO text, NO phone frame, NO UI chrome, NO device mockup.`,
    `   - This is pure scene-setting: color palette, shapes, gradients, abstract elements, lighting.`,
    `   - The background must be designed to leave clear space for a phone frame overlay in the ${isRTL ? "left" : "right"} third.`,
    `   - The headline text block will sit in the ${isRTL ? "right" : "left"} two-thirds.`,
    `   - Be specific and Runware-prompt-optimised (evocative, concrete nouns and adjectives).`,
    ``,
    `2. CANVAS COMPOSITOR METADATA:`,
    `   - textPosition: where the headline sits ("top", "center", or "bottom").`,
    `   - textColor: "#ffffff" for dark backgrounds, "#111111" for light backgrounds.`,
    `   - accentColor: 6-digit hex for the brand accent strip${brandColor ? ` — use "${brandColor}" or a harmonious derivative` : " — derive from the app category and style"}.`,
    `   - backgroundMood: 3–5 word atmosphere label (e.g. "deep navy geometric tech").`,
    `   - uiMockDescription: what app screen/state to show inside the phone frame (1 sentence).`,
    `   - negativeAdditions: extra negative-prompt terms specific to this layout.`,
    ``,
    `QUALITY STANDARDS`,
    `-----------------`,
    `- backgroundPrompt must be Runware-ready: rich adjectives, no markdown, no quotes.`,
    `- PROFESSIONAL QUALITY: Background must look like a premium App Store screenshot from a top-10 app.`,
    `  No clip-art aesthetics, no cheap stock-photo gradients, no amateurish neon explosions.`,
    `  Think: Calm, Notion, Duolingo, Headspace — clean, spacious, intentional.`,
    `- GENEROUS WHITESPACE: The background must have significant open space for text legibility.`,
    `  Busy, cluttered backgrounds destroy readability — penalise them hard.`,
    `- TYPOGRAPHY HIERARCHY: The background must support clear text contrast.`,
    `  Dark backgrounds → light text (#ffffff). Light backgrounds → dark text (#111111).`,
    `- accentColor must be a valid 6-digit hex starting with #.`,
    `- Keep backgroundMood under 6 words.`,
    `- The FLUX background must leave clear space for the phone frame overlay — avoid busy centre compositions.`,
  ].filter((p) => p !== null).join("\n");

  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function clamp(s: unknown, max: number, fallback = ""): string {
  if (typeof s !== "string" || !s.trim()) return fallback;
  return s.trim().slice(0, max);
}

function parseTextPosition(raw: unknown): "top" | "center" | "bottom" {
  if (raw === "top" || raw === "center" || raw === "bottom") return raw;
  return "bottom";
}

function parseTextColor(raw: unknown): "#ffffff" | "#111111" {
  if (raw === "#111111") return "#111111";
  return "#ffffff";
}

function parseAccentColor(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.trim())) return raw.trim();
  return fallback;
}

function parseLayoutMap(raw: unknown, brandColor?: string): LayoutMap {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fallbackAccent = brandColor ?? "#22C55E";
  return {
    backgroundPrompt: clamp(r.backgroundPrompt, 800, "Abstract atmospheric gradient background, smooth color transitions, modern design"),
    negativeAdditions: clamp(r.negativeAdditions, 300, ""),
    textPosition: parseTextPosition(r.textPosition),
    textColor: parseTextColor(r.textColor),
    accentColor: parseAccentColor(r.accentColor, fallbackAccent),
    backgroundMood: clamp(r.backgroundMood, 60, "modern gradient"),
    uiMockDescription: clamp(r.uiMockDescription, 200, "app main screen"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function generateScreenshotLayout(
  input: GenerateScreenshotLayoutInput,
): Promise<LayoutMap> {
  const apiKey = assertGeminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: resolveGeminiModel(),
    generationConfig: mergeGeminiGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: LAYOUT_SCHEMA as never,
      maxOutputTokens: 1200,
      temperature: 0.65,
    }),
  });

  const prompt = buildLayoutPrompt(input);
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: unknown;
  try {
    const clean = text.startsWith("```")
      ? text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim()
      : text;
    parsed = JSON.parse(clean);
  } catch {
    throw new InvalidModelOutputError(
      `LayoutMap: JSON parse failed. Raw: ${text.slice(0, 300)}`,
    );
  }

  return parseLayoutMap(parsed, input.brandColor);
}
