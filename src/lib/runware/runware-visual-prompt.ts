/**
 * Runware Visual Prompt Generator
 *
 * Bridges the ASO listing pipeline (BrandKit + ScreenshotCaptions) to
 * Runware's image-generation API by producing a single, optimized positive
 * prompt string for each screenshot caption.
 *
 * Responsibilities:
 *  1. mapBrandKitToStyleKeywords  — converts brandKit.style + palette into
 *     Runware-friendly Visual Style Keywords.
 *  2. buildSceneDescriptionForCaption — derives a "Visual Scene Description"
 *     from the caption's theme ("feature" | "benefit" | "hook" | "cta") and
 *     the actual caption text.
 *  3. generateRunwareVisualPrompt  — combines Scene + Style + Brand Color +
 *     Mobile-Screenshot technical specs into one optimized prompt string.
 *  4. generateRunwarePromptBatch   — processes a full ScreenshotCaption[]
 *     in one call, one RunwarePayload per caption.
 *
 * EN/AR: locale-aware — Arabic captions get RTL / right-to-left UI cues so
 * Runware produces layouts suited for MENA Play Store listings.
 */

import type { BrandKitSignal } from "@/lib/listing/generation-signal-context.types";
import type { ScreenshotCaption } from "@/lib/listing/listing-version.types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** App-level metadata required to contextualise the scene description. */
export type RunwareVisualPromptInput = {
  appName: string;
  appCategory: string;
  brandKit: BrandKitSignal;
  caption: ScreenshotCaption;
  locale: "en" | "ar";
};

/**
 * All information needed to submit one image-generation job to Runware.
 * `positivePrompt` is the fully assembled string ready for the API call.
 */
export type RunwarePayload = {
  /** The fully assembled, comma-separated prompt string for Runware. */
  positivePrompt: string;
  /** Keywords to steer away from (stock photos, watermarks, blurry text, etc.). */
  negativePrompt: string;
  /** Portrait screenshot width — Play Store standard: 1080 px. */
  width: 1080;
  /** Portrait screenshot height — Play Store standard: 1920 px. */
  height: 1920;
};

/**
 * Full result returned by generateRunwareVisualPrompt.
 * Includes intermediate components for logging / debugging.
 */
export type RunwareVisualPromptResult = {
  /** Caption that was used to build this prompt. */
  caption: ScreenshotCaption;
  /** The per-caption visual scene description (Part 1 of the final prompt). */
  sceneDescription: string;
  /** Derived style keyword string from the brand kit (Part 2). */
  styleKeywords: string;
  /** Brand color + palette directives (Part 3). */
  colorDirectives: string;
  /** Technical specification suffix (Part 4). */
  technicalSpec: string;
  /** Ready-to-submit Runware payload with the assembled positivePrompt. */
  payload: RunwarePayload;
};

/** Batch result: one entry per input caption, in carousel order. */
export type RunwarePromptBatchResult = {
  results: RunwareVisualPromptResult[];
  /** Number of captions that produced a usable prompt. */
  successCount: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Style keyword mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known style → Visual Style Keyword sets.
 * Keys are lowercase-normalised; unknown styles fall back to "modern".
 */
const STYLE_KEYWORD_MAP: Record<string, string[]> = {
  modern: [
    "modern UI design",
    "clean lines",
    "contemporary mobile layout",
    "flat design elements",
    "smooth color transitions",
  ],
  minimalist: [
    "minimalist design",
    "generous negative space",
    "typography-forward layout",
    "monochromatic accents",
    "restrained color palette",
    "high whitespace",
  ],
  minimal: [
    "minimalist design",
    "generous negative space",
    "clean composition",
    "subtle UI elements",
  ],
  bold: [
    "high contrast design",
    "bold typography",
    "vivid saturated colors",
    "energetic visual composition",
    "strong visual hierarchy",
    "impactful hero layout",
  ],
  professional: [
    "corporate UI design",
    "structured grid layout",
    "trustworthy aesthetic",
    "formal typography",
    "muted professional palette",
    "data-driven interface",
  ],
  playful: [
    "vibrant playful colors",
    "rounded UI components",
    "friendly illustration style",
    "soft drop shadows",
    "fun expressive typography",
  ],
  elegant: [
    "luxury aesthetic",
    "refined serif typography",
    "sophisticated color palette",
    "premium feel",
    "subtle gradient overlays",
    "editorial composition",
  ],
  dark: [
    "dark mode UI",
    "deep dark background",
    "neon accent highlights",
    "high contrast text",
    "ambient screen glow",
    "sleek night-mode aesthetic",
  ],
  light: [
    "bright white background",
    "light airy interface",
    "pastel accents",
    "optimistic color mood",
    "clean open layout",
  ],
  colorful: [
    "multi-color vibrant palette",
    "energetic color blocking",
    "bold color contrasts",
    "lively expressive design",
  ],
};

/**
 * Maps a `BrandKitSignal` into a single Visual Style Keywords string.
 *
 * Always appends the brand primary color and any secondary palette so
 * Runware grounds background elements in the brand identity.
 *
 * @param brandKit  Workspace brand kit signal (from DB or signal context).
 * @returns         Comma-joined keyword string ready for prompt injection.
 */
export function mapBrandKitToStyleKeywords(brandKit: BrandKitSignal): string {
  const styleKey = (brandKit.style ?? "modern").toLowerCase().trim();

  // Look for an exact or partial style key match.
  const matchedKey =
    Object.keys(STYLE_KEYWORD_MAP).find((k) => styleKey.includes(k)) ?? "modern";
  const baseKeywords = [...(STYLE_KEYWORD_MAP[matchedKey] ?? STYLE_KEYWORD_MAP.modern)];

  // Universal quality markers — required by spec and present on every prompt.
  baseKeywords.push(
    "high contrast",
    "clean background",
    "cinematic lighting",
    "pixel-perfect mobile UI",
    "app store quality screenshot",
    "high fidelity digital mockup",
    "sharp edges",
    "no device frame",
  );

  return baseKeywords.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Color directives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the brand-color directive string that Runware uses to tint
 * background elements, buttons, and accent shapes.
 *
 * Format is spec-compliant:
 *   "brand color #{brandColor}, secondary color #{palette[0]}, ..."
 *
 * The primary `brandColor` is ALWAYS present — required hard constraint.
 */
export function buildColorDirectives(brandKit: BrandKitSignal): string {
  const parts: string[] = [];

  // Primary brand color — REQUIRED, exact spec format.
  const primaryHex = brandKit.primaryColor?.trim() ?? "#3B82F6";
  parts.push(`brand color ${primaryHex}`);

  // Secondary palette — first color in spec-required position.
  if (brandKit.colorPalette?.trim()) {
    const palette = brandKit.colorPalette
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    if (palette.length > 0) {
      parts.push(`secondary color ${palette[0]}`);
    }
    // Additional palette colors for richer brand grounding.
    if (palette.length > 1) {
      parts.push(`accent colors ${palette.slice(1, 3).join(" ")}`);
    }
  }

  // Background and accent directives.
  parts.push(
    `background elements use ${primaryHex} color family`,
    "brand-consistent color scheme throughout",
  );

  return parts.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene description (per caption theme)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Theme-to-scene pattern registry.
 * Each entry describes the visual context for one caption theme.
 */
type SceneTemplate = {
  /** What UI surface / state the screenshot focuses on. */
  uiContext: string;
  /** What the user's eye should land on first. */
  focalElement: string;
  /** Composition / camera-angle instruction for Runware. */
  composition: string;
};

const THEME_SCENE_TEMPLATES: Record<ScreenshotCaption["theme"], SceneTemplate> = {
  hook: {
    uiContext: "main dashboard or home screen showing the app's core value proposition",
    focalElement: "prominent headline text and primary action button",
    composition: "full-bleed hero composition, content fills the screen, centered focal point",
  },
  feature: {
    uiContext: "focused UI panel highlighting the specific feature functionality",
    focalElement: "the feature UI element in active/in-use state with visible data or controls",
    composition: "tight crop on the feature, surrounding UI blurred or dimmed, spotlight effect",
  },
  benefit: {
    uiContext: "success or results screen showing the positive outcome the user achieved",
    focalElement: "completion indicator, progress metric, or achievement state",
    composition: "triumphant upward composition, result number or milestone visually prominent",
  },
  cta: {
    uiContext: "call-to-action or onboarding screen with a clear conversion moment",
    focalElement: "primary CTA button in brand color, minimal surrounding distractions",
    composition: "open airy layout, button large and centered, plenty of negative space",
  },
};

/** RTL layout descriptors appended for Arabic locale. */
const AR_LAYOUT_MODIFIERS = [
  "RTL right-to-left layout",
  "mirrored navigation elements",
  "Arabic UI typography",
  "right-aligned text blocks",
  "MENA region Play Store aesthetic",
].join(", ");

/**
 * Builds the "Visual Scene Description" for a single screenshot caption.
 *
 * - Derives the UI context from the caption's `theme`.
 * - Weaves the caption text into the scene to keep copy and visual aligned.
 * - Adds RTL layout cues for Arabic (`locale === "ar"`).
 */
export function buildSceneDescriptionForCaption(
  caption: ScreenshotCaption,
  appName: string,
  appCategory: string,
  brandKit: BrandKitSignal,
  locale: "en" | "ar",
): string {
  const template = THEME_SCENE_TEMPLATES[caption.theme];
  const primaryHex = brandKit.primaryColor?.trim() ?? "#3B82F6";
  const styleAdjective = brandKit.style ?? "clean";

  // Core scene sentence — use Gemini's uiFocus when available for higher fidelity.
  const uiContextDetail = caption.uiFocus?.trim()
    ? caption.uiFocus.trim()
    : template.uiContext;

  const scene = [
    `Google Play Store screenshot of ${appName} (${appCategory} app)`,
    `showing ${uiContextDetail}`,
    `— caption theme: "${caption.theme}"`,
    `— caption text: "${caption.caption}"`,
    `${styleAdjective} mobile interface with ${primaryHex} accents`,
    template.focalElement,
    template.composition,
  ].join(", ");

  // Arabic locale: append RTL layout modifiers.
  if (locale === "ar") {
    return `${scene}, ${AR_LAYOUT_MODIFIERS}`;
  }

  return scene;
}

// ─────────────────────────────────────────────────────────────────────────────
// Technical specification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed mobile-screenshot technical spec appended to every Runware prompt.
 * Aspect ratio 9:16 (portrait) — Google Play Store standard.
 */
const MOBILE_SCREENSHOT_TECH_SPEC =
  "portrait mobile screenshot, 9:16 aspect ratio, 1080x1920 pixels, ultra-high fidelity, " +
  "app store quality, no device frame, no external shadows, white or brand-color background, " +
  "professional UI mockup photography";

// ─────────────────────────────────────────────────────────────────────────────
// Negative prompt (shared across all captions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runware negative prompt — steers the model away from common screenshot
 * quality issues and stock-photo aesthetics.
 */
export const RUNWARE_SCREENSHOT_NEGATIVE_PROMPT =
  "blurry, low resolution, watermark, text overlay errors, deformed UI, " +
  "stock photo, real people, hands, faces, photorealistic photography, " +
  "physical device bezel, device frame, drop shadow from device, " +
  "generic icons, placeholder text, lorem ipsum, distorted layout, " +
  "inconsistent color scheme, off-brand colors, neon glitch artefacts";

// ─────────────────────────────────────────────────────────────────────────────
// Main export: generateRunwareVisualPrompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a fully optimized Runware image-generation payload for one
 * screenshot caption.
 *
 * Prompt structure (four parts joined by " | "):
 *  [1] Visual Scene Description   — what the screenshot depicts
 *  [2] Visual Style Keywords      — derived from brandKit.style + palette
 *  [3] Brand Color Directives     — explicit hex colors for brand alignment
 *  [4] Mobile Screenshot Specs    — aspect ratio, resolution, quality markers
 *
 * The primary `brandColor` is always explicitly present in parts 2 and 3,
 * satisfying the hard constraint that background elements reflect brand identity.
 *
 * @param input  App metadata + brand kit + caption + locale.
 * @returns      Full result with assembled payload and intermediate components.
 */
export function generateRunwareVisualPrompt(
  input: RunwareVisualPromptInput,
): RunwareVisualPromptResult {
  const { appName, appCategory, brandKit, caption, locale } = input;

  // Part 1 — Visual Scene Description.
  const sceneDescription = buildSceneDescriptionForCaption(
    caption,
    appName,
    appCategory,
    brandKit,
    locale,
  );

  // Part 2 — Visual Style Keywords.
  const styleKeywords = mapBrandKitToStyleKeywords(brandKit);

  // Part 3 — Brand Color Directives (primary color ALWAYS explicit).
  const colorDirectives = buildColorDirectives(brandKit);

  // Part 4 — Mobile Screenshot Technical Spec.
  const technicalSpec = MOBILE_SCREENSHOT_TECH_SPEC;

  // Assemble the single optimized prompt string.
  const positivePrompt = [sceneDescription, styleKeywords, colorDirectives, technicalSpec]
    .filter(Boolean)
    .join(" | ");

  const payload: RunwarePayload = {
    positivePrompt,
    negativePrompt: RUNWARE_SCREENSHOT_NEGATIVE_PROMPT,
    width: 1080,
    height: 1920,
  };

  return {
    caption,
    sceneDescription,
    styleKeywords,
    colorDirectives,
    technicalSpec,
    payload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch export: generateRunwarePromptBatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes a full `ScreenshotCaption[]` array (e.g. the output of the
 * `captions` pipeline step) into one `RunwarePayload` per caption.
 *
 * Captions are sorted by `order` so the Play Store carousel position is
 * preserved.  Captions with an empty or whitespace-only text are skipped.
 *
 * @param captions     Screenshot captions from `listing_versions.screenshot_captions`.
 * @param appName      App name for scene context.
 * @param appCategory  App category for scene context.
 * @param brandKit     Workspace brand kit signal.
 * @param locale       Target locale — drives RTL layout for Arabic.
 * @returns            Batch result sorted by caption `order`.
 */
export function generateRunwarePromptBatch(
  captions: ScreenshotCaption[],
  appName: string,
  appCategory: string,
  brandKit: BrandKitSignal,
  locale: "en" | "ar" = "en",
): RunwarePromptBatchResult {
  const sorted = [...captions].sort((a, b) => a.order - b.order);

  const results: RunwareVisualPromptResult[] = sorted
    .filter((c) => c.caption.trim().length > 0)
    .map((caption) =>
      generateRunwareVisualPrompt({ appName, appCategory, brandKit, caption, locale }),
    );

  return {
    results,
    successCount: results.length,
  };
}
