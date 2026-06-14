import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import {
  selectMoodSchemaForCategory,
  type MoodSchemaType,
} from "@/lib/gemini/mood-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Enums
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ASO Asset Generator Type
 * Determines which asset (screenshot, icon, or banner) to generate.
 */
export type GeneratorType = "screenshot" | "icon" | "banner";

/**
 * ASOAsset — Unified output type for all asset generations
 *
 * Drives three pipelines:
 *  1. Screenshot: Runware FLUX + device frame + typography
 *  2. Icon: Runware FLUX (centered, no frame/text)
 *  3. Banner: Runware FLUX (wide cinematic, no objects)
 */
export type ASOAsset = {
  /** Runware-ready background prompt (no text/frame) */
  backgroundPrompt: string;
  /** Additional negative-prompt terms for Runware */
  negativeAdditions: string;
  /** Asset type that was generated */
  generatorType: GeneratorType;
  /** Selected Mood Schema ID */
  selectedSchema: MoodSchemaType;
  /** Typography configuration (null for icons) */
  typographyConfig: {
    primaryColor: string;
    fontStyle: "bold" | "elegant" | "clean";
    shadowProfile: "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep";
  } | null;
  /** Layout metadata (only for screenshots/banners) */
  layout?: {
    /** Text block anchor: top, center, bottom */
    textPosition: "top" | "center" | "bottom";
    /** Text colour for contrast */
    textColor: "#ffffff" | "#0f0f0f";
    /** Primary brand accent hex */
    accentColor: string;
    /** Secondary accent hex */
    accentColorSecondary: string;
    /** Background luminance */
    backgroundLuminance: "dark" | "light";
    /** Background mood description */
    backgroundMood: string;
  };
  /** Icon-specific metadata (only for icons) */
  iconMetadata?: {
    /** Whether the icon centers on the canvas */
    centered: boolean;
    /** Recommended background color (matches schema) */
    backgroundColor: string;
    /** Icon focal point scale (0.5-1.0) */
    focalPointScale: number;
  };
  /** Banner-specific metadata (only for banners) */
  bannerMetadata?: {
    /** Banner aspect ratio (1024 × 500 on Play Store) */
    aspectRatio: "2:1";
    /** Composition style (cinematic/minimalist/abstract) */
    compositionStyle: string;
    /** Safe text zone location (if text added later) */
    textZonePosition: "left" | "right" | "center";
  };
  /** Whether this asset type supports text overlays */
  isTextEnabled: boolean;
  /** Runware dimensions for this asset type */
  targetDimensions: {
    width: number;
    height: number;
    /** Description (e.g., "1080×1920 portrait" or "1024×500 landscape") */
    description: string;
  };
};

export type GenerateASOAssetInput = {
  appName: string;
  category: string;
  shortDescription?: string;
  style: string;
  brandColor?: string;
  primaryColor?: string;
  locale: "en" | "ar";
  /** Which asset type to generate */
  generatorType: GeneratorType;
  /** For screenshots: slide index (0-5) */
  slideIndex?: number;
  /** For screenshots: slide headline + subline */
  headline?: string;
  subline?: string;
  uiFocus?: string;
  /** For screenshots: inferred mood from pack */
  inferredMood?: string;
  /** For banners: headline to guide composition */
  bannerHeadline?: string;
  /** For banners: mood/theme for marketing focus */
  bannerTheme?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Negative Prompt Base
// ─────────────────────────────────────────────────────────────────────────────

const BASE_NEGATIVE =
  // ── Hardware (constraint 1) ─────────────────────────────────────────────
  "phone, smartphone, mobile phone, iPhone, Apple iPhone, iOS device, " +
  "Android phone, Android device, device mockup, phone frame, phone outline, " +
  "phone silhouette, phone shape, hardware, hardware frame, hardware mockup, " +
  "screen bezel, notch, dynamic island, home button, phone screen, " +
  "tablet, iPad, laptop, computer, monitor, device, gadget, electronics, " +
  "product shot with device, tech device, mobile device, hand holding phone, " +
  // ── Text / lettering (constraint 2) ────────────────────────────────────
  "text, lettering, letters, words, fonts, typography, headline, caption, " +
  "watermark, label, logotype, word mark, numbers, digits, " +
  // ── UI / interface elements ─────────────────────────────────────────────
  "UI chrome, app interface, app screenshot, interface mockup, " +
  "icons, app icons, navigation bar, status bar, buttons, " +
  // ── Composition violations ──────────────────────────────────────────────
  "centered busy composition, symmetrical busy center, " +
  "crowded layout, cluttered background, dense pattern covering full frame, " +
  "objects in center of image, busy middle section, " +
  // ── Aesthetic quality ───────────────────────────────────────────────────
  "amateurish, clip art, stock photo look, AI-generated artefacts, " +
  "cheap gradient, rainbow gradient, neon explosion, garish colors, " +
  "blurry, noisy, grainy, oversaturated, distorted, low quality, " +
  "watercolor wash, painterly, illustration, cartoon, " +
  // ── People ─────────────────────────────────────────────────────────────
  "portrait of person, realistic face, photorealistic human, hand, body part";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Dangerous Keyword Stripper with Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List of dangerous keywords that trigger device hallucination
 */
const DANGEROUS_KEYWORDS = [
  "app",
  "application",
  "screenshot",
  "mobile",
  "phone",
  "smartphone",
  "device",
  "tablet",
  "hardware",
];

/**
 * Strips dangerous keywords that cause hallucination (app, screenshot, mobile, phone).
 * These words trigger device frame generation even with negative prompts.
 *
 * @param text User-provided text (appName, headline, category, etc.)
 * @returns Sanitized text with dangerous keywords removed
 */
function stripDangerousKeywords(text: string): string {
  return text
    .replace(
      /\b(app|application|screenshot|mobile|phone|smartphone|device|tablet|hardware)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verifies that dangerous keywords are stripped from a prompt string.
 * Logs detailed verification report.
 *
 * @param text Text to verify
 * @param textType Description of text type (e.g., "appName", "backgroundPrompt")
 * @returns Object with verification results
 */
function verifyPromptCleanliness(
  text: string,
  textType: string
): { clean: boolean; found: string[]; report: string } {
  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (const keyword of DANGEROUS_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    if (regex.test(lowerText)) {
      found.push(keyword);
    }
  }

  const clean = found.length === 0;
  const report = clean
    ? `✓ ${textType}: CLEAN (no dangerous keywords found)`
    : `❌ ${textType}: CONTAMINATED with keywords: ${found.join(", ")}`;

  return { clean, found, report };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builders by Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds prompt for SCREENSHOT generation
 * HARD-CLAMP: Mandatory positive prompt prevents device hallucination.
 * Strips dangerous keywords from user input (app, screenshot, mobile, phone).
 */
function buildScreenshotPrompt(input: GenerateASOAssetInput, schema: ReturnType<typeof selectMoodSchemaForCategory>): string {
  const {
    appName, category, shortDescription, style, brandColor, primaryColor,
    locale, slideIndex = 0, headline = "", subline = "", uiFocus = "", inferredMood,
  } = input;

  // ── HARD-CLAMP FIX: Strip dangerous keywords from user input ──
  const safeName = stripDangerousKeywords(appName);
  const safeCategory = stripDangerousKeywords(category);
  const safeHeadline = stripDangerousKeywords(headline);
  const safeSubline = stripDangerousKeywords(subline);

  const isRTL = locale === "ar";
  const mood = inferredMood ?? schema.label;

  const SLIDE_ROLES = [
    "SLIDE 1 — HERO VALUE HOOK",
    "SLIDE 2 — CORE FEATURE BENEFIT",
    "SLIDE 3 — CORE FEATURE BENEFIT",
    "SLIDE 4 — CORE FEATURE BENEFIT",
    "SLIDE 5 — SOCIAL PROOF & TRUST",
    "SLIDE 6 — DOWNLOAD CALL TO ACTION",
  ];
  const slideRole = SLIDE_ROLES[slideIndex] ?? `SLIDE ${slideIndex + 1}`;

  const derivedPrimary = brandColor ?? schema.primaryColor;
  const derivedSecondary = primaryColor || deriveSecondaryColor(derivedPrimary);

  const paletteDesc =
    `Primary brand colour MUST be EXACTLY: ${derivedPrimary}. ` +
    `Secondary accent MUST be EXACTLY: ${derivedSecondary}. ` +
    `accentColor MUST be "${derivedPrimary}" and accentColorSecondary MUST be "${derivedSecondary}".`;

  // ── HARD-CLAMP: Mandatory positive prompt (highest priority) ──
  const hardClampPositive =
    `${derivedPrimary} gradient, minimalist abstract design, no objects, no hardware, ` +
    "no devices, no text. Professional aesthetic only.";

  return `Generate a SCREENSHOT BACKGROUND (1024×1792).

MANDATORY POSITIVE: ${hardClampPositive}

METADATA:
App: ${safeName} (${safeCategory})
Mood: ${mood}
Colors: ${derivedPrimary}
Slide: ${slideRole}

CRITICAL:
- NO DEVICE FRAMES, HARDWARE, PHONES, SCREENS
- ${isRTL ? "LEFT" : "RIGHT"} third empty for frame overlay
- PROFESSIONAL ABSTRACT ONLY
- Output JSON with backgroundPrompt, negativeAdditions, layout

Return ONLY valid JSON.`;
}

/**
 * Builds prompt for ICON generation
 * Centered, minimalist, bold, no text
 */
function buildIconPrompt(input: GenerateASOAssetInput, schema: ReturnType<typeof selectMoodSchemaForCategory>): string {
  const { appName, category, shortDescription, brandColor, style } = input;

  const derivedPrimary = brandColor ?? schema.primaryColor;

  return `Generate ICON (512×512).

MANDATORY: ${derivedPrimary} solid background, centered minimalist flat vector, bold focal shape. NO text, NO hardware, NO photorealism.

METADATA:
App: ${appName} (${category})
Style: ${style}
Brand: ${derivedPrimary}

CRITICAL:
- CENTERED, BOLD, MINIMALIST
- Single focal point, high contrast
- PLAY STORE QUALITY
- Output JSON with iconMetadata

Return ONLY valid JSON.`;
}

/**
 * Builds prompt for BANNER generation
 * HARD-CLAMP: Mandatory positive prompt prevents device hallucination.
 * Cinematic, wide, marketing-focused, 1024×500
 */
function buildBannerPrompt(input: GenerateASOAssetInput, schema: ReturnType<typeof selectMoodSchemaForCategory>): string {
  const { appName, category, shortDescription, brandColor, bannerHeadline, bannerTheme, style } = input;

  // ── HARD-CLAMP FIX: Strip dangerous keywords from user input ──
  const safeName = stripDangerousKeywords(appName);
  const safeCategory = stripDangerousKeywords(category);
  const safeHeadline = stripDangerousKeywords(bannerHeadline || "");

  const derivedPrimary = brandColor ?? schema.primaryColor;
  const colorDesc = hexToColorDescription(derivedPrimary);

  // ── HARD-CLAMP: Mandatory positive prompt (highest priority) ──
  const hardClampPositive =
    `${derivedPrimary} cinematic gradient, geometric forms, abstract minimal, no objects, ` +
    "no hardware, no devices, no text. Premium marketing aesthetic.";

  return `Generate BANNER BACKGROUND (1024×500, 2:1 landscape).

MANDATORY POSITIVE: ${hardClampPositive}

METADATA:
App: ${safeName}
Style: ${style}
Colors: ${derivedPrimary}
Theme: ${bannerTheme || schema.label}

CRITICAL:
- NO HARDWARE, DEVICES, PHONES, SCREENS, ICONS, TEXT, PEOPLE
- LEFT 2/3 ACTIVE, RIGHT 1/3 for text overlay
- CINEMATIC MINIMALIST AESTHETIC
- ZERO OBJECTS, PURE ABSTRACT
- Output JSON with backgroundPrompt, negativeAdditions, bannerMetadata

Return ONLY valid JSON.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function hexToColorDescription(hex: string): string {
  const hexClean = hex.replace("#", "");
  const r = parseInt(hexClean.slice(0, 2), 16) / 255;
  const g = parseInt(hexClean.slice(2, 4), 16) / 255;
  const b = parseInt(hexClean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    if (l > 0.85) return "white, off-white";
    if (l > 0.6) return "light grey, silver";
    if (l > 0.35) return "medium grey, steel grey";
    return "dark grey, charcoal";
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  const lightnessWord =
    l > 0.85 ? "very light pale" :
    l > 0.65 ? "light" :
    l > 0.45 ? "vivid" :
    l > 0.25 ? "deep rich" :
    "very dark";

  if (h < 15 || h >= 345) return `${lightnessWord} red, crimson`;
  if (h < 50) return `${lightnessWord} orange, amber`;
  if (h < 90) return `${lightnessWord} yellow, golden`;
  if (h < 140) return `${lightnessWord} green, emerald`;
  if (h < 200) return `${lightnessWord} teal, cyan`;
  if (h < 255) return `${lightnessWord} blue, cobalt`;
  return `${lightnessWord} purple, violet`;
}

function deriveSecondaryColor(primaryHex: string): string {
  const hex = primaryHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    const newL = Math.min(1, Math.max(0, l - 0.15));
    const gray = Math.round(newL * 255).toString(16).padStart(2, "0");
    return `#${gray}${gray}${gray}`.toUpperCase();
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  const newL = Math.min(1, Math.max(0, l - 0.15));
  const c = (1 - Math.abs(2 * newL - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = newL - c / 2;

  let r2 = 0, g2 = 0, b2 = 0;
  if (h < 1 / 6) { r2 = c; g2 = x; }
  else if (h < 2 / 6) { r2 = x; g2 = c; }
  else if (h < 3 / 6) { g2 = c; b2 = x; }
  else if (h < 4 / 6) { g2 = x; b2 = c; }
  else if (h < 5 / 6) { r2 = x; b2 = c; }
  else { r2 = c; b2 = x; }

  const rh = Math.round((r2 + m) * 255).toString(16).padStart(2, "0");
  const gh = Math.round((g2 + m) * 255).toString(16).padStart(2, "0");
  const bh = Math.round((b2 + m) * 255).toString(16).padStart(2, "0");
  return `#${rh}${gh}${bh}`.toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured Schema Definition
// ─────────────────────────────────────────────────────────────────────────────

const ASO_ASSET_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    backgroundPrompt: { type: SchemaType.STRING },
    negativeAdditions: { type: SchemaType.STRING },
    generatorType: { type: SchemaType.STRING },
    selectedSchema: { type: SchemaType.STRING },
    typographyConfig: {
      type: SchemaType.OBJECT,
      properties: {
        primaryColor: { type: SchemaType.STRING },
        fontStyle: { type: SchemaType.STRING },
        shadowProfile: { type: SchemaType.STRING },
      },
    },
    layout: {
      type: SchemaType.OBJECT,
      properties: {
        textPosition: { type: SchemaType.STRING },
        textColor: { type: SchemaType.STRING },
        accentColor: { type: SchemaType.STRING },
        accentColorSecondary: { type: SchemaType.STRING },
        backgroundLuminance: { type: SchemaType.STRING },
        backgroundMood: { type: SchemaType.STRING },
      },
    },
    iconMetadata: {
      type: SchemaType.OBJECT,
      properties: {
        centered: { type: SchemaType.BOOLEAN },
        backgroundColor: { type: SchemaType.STRING },
        focalPointScale: { type: SchemaType.NUMBER },
      },
    },
    bannerMetadata: {
      type: SchemaType.OBJECT,
      properties: {
        aspectRatio: { type: SchemaType.STRING },
        compositionStyle: { type: SchemaType.STRING },
        textZonePosition: { type: SchemaType.STRING },
      },
    },
    isTextEnabled: { type: SchemaType.BOOLEAN },
    targetDimensions: {
      type: SchemaType.OBJECT,
      properties: {
        width: { type: SchemaType.NUMBER },
        height: { type: SchemaType.NUMBER },
        description: { type: SchemaType.STRING },
      },
    },
  },
  required: [
    "backgroundPrompt", "negativeAdditions", "generatorType", "selectedSchema",
    "isTextEnabled", "targetDimensions"
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified ASO Asset Generator
 * Generates screenshots, icons, or banners via Gemini + Runware
 *
 * PRODUCTION-SAFE: Includes Hard-Clamp verification and detailed logging.
 *
 * @param input GenerateASOAssetInput with appName, category, generatorType, etc
 * @returns ASOAsset with Runware-ready prompt + metadata for sharp compositing
 */
export async function generateASOAsset(
  input: GenerateASOAssetInput,
): Promise<ASOAsset> {
  // ✅ REFACTORED: Use centralized Vertex AI gateway (no API key needed)

  console.log(
    `[generateASOAsset] Starting generation: type=${input.generatorType}, category=${input.category}, locale=${input.locale}`
  );

  // Select schema based on category
  const selectedSchema = selectMoodSchemaForCategory(input.category);
  console.log(
    `[generateASOAsset] Selected schema: ${selectedSchema.id} (${selectedSchema.label})`
  );

  // Build type-specific prompt
  let prompt: string;
  let targetDimensions: ASOAsset["targetDimensions"];

  switch (input.generatorType) {
    case "screenshot":
      prompt = buildScreenshotPrompt(input, selectedSchema);
      targetDimensions = {
        width: 1024,
        height: 1792,
        description: "1024×1792 portrait (scales to 1080×1920)",
      };
      break;

    case "icon":
      prompt = buildIconPrompt(input, selectedSchema);
      targetDimensions = {
        width: 512,
        height: 512,
        description: "512×512 square (scales to 192×192 for Play Store)",
      };
      break;

    case "banner":
      prompt = buildBannerPrompt(input, selectedSchema);
      targetDimensions = {
        width: 1024,
        height: 500,
        description: "1024×500 landscape (2:1 Play Store feature graphic)",
      };
      break;
  }

  // ── HARD-CLAMP VERIFICATION: Final prompt sanity check ────────────────────
  console.log(`[generateASOAsset] Verifying prompt cleanliness before Gemini call...`);
  const promptVerification = verifyPromptCleanliness(prompt, "Gemini Prompt");
  console.log(`[generateASOAsset] ${promptVerification.report}`);

  if (!promptVerification.clean) {
    console.warn(
      `[generateASOAsset] ⚠️  WARNING: Prompt contains dangerous keywords: ${promptVerification.found.join(", ")}`
    );
    console.warn(
      `[generateASOAsset] Consider reviewing input sanitization for appName="${input.appName}", category="${input.category}"`
    );
  }

  console.log(
    `[generateASOAsset] Prompt preview (first 200 chars): ${prompt.slice(0, 200)}...`
  );

  // Call Gemini with structured output
  // IMPORTANT: maxOutputTokens MUST be high enough for complete JSON response
  // If set too low, Gemini truncates mid-JSON, causing parse failures
  const model = getGenerativeModel({
    maxOutputTokens: 2048, // ← INCREASED from 1400 to prevent truncation
    temperature: 0.7,
  });

  console.log(`[generateASOAsset] Calling Gemini API (maxOutputTokens: 2048)...`);
  const result = await model.generateContent(prompt);
  const text = (result.text ?? "").trim();

  // ── DEBUG: Log raw response for troubleshooting ──────────────────────────────
  if (text.length < 100 || !text.includes("backgroundPrompt")) {
    console.warn(
      `[generateASOAsset] ⚠️  WARNING: Response appears truncated or incomplete`
    );
    console.warn(
      `[generateASOAsset] Response length: ${text.length}, First 200 chars: ${text.slice(0, 200)}`
    );
  }

  let parsed: unknown;
  try {
    const clean = text.startsWith("```")
      ? text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim()
      : text;

    // ── VALIDATION: Ensure we have a complete JSON response ──────────────────
    if (!clean.includes("backgroundPrompt")) {
      throw new Error(
        "Response missing required field 'backgroundPrompt' — likely truncated"
      );
    }

    parsed = JSON.parse(clean);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[generateASOAsset] ❌ JSON parse failed: ${errorMsg}`);
    console.error(
      `[generateASOAsset] Raw response (first 500 chars): ${text.slice(0, 500)}`
    );
    throw new InvalidModelOutputError(
      `ASOAsset: JSON parse failed (${errorMsg}). Response may be truncated. Raw (first 200 chars): ${text.slice(0, 200)}`,
    );
  }

  // Parse and validate based on type
  const r = (parsed ?? {}) as Record<string, unknown>;
  const derivedPrimary = input.brandColor ?? selectedSchema.primaryColor;
  const derivedSecondary =
    input.primaryColor || deriveSecondaryColor(derivedPrimary);

  // Base asset
  const baseAsset: ASOAsset = {
    backgroundPrompt:
      typeof r.backgroundPrompt === "string"
        ? r.backgroundPrompt.slice(0, 900)
        : `${input.generatorType} background for ${input.category} app`,
    negativeAdditions:
      typeof r.negativeAdditions === "string"
        ? r.negativeAdditions.slice(0, 300)
        : BASE_NEGATIVE.slice(0, 100),
    generatorType: input.generatorType,
    selectedSchema: selectedSchema.id,
    typographyConfig:
      input.generatorType === "icon"
        ? null
        : {
            primaryColor: derivedPrimary,
            fontStyle: (selectedSchema.fontStyle as "bold" | "elegant" | "clean") || "clean",
            shadowProfile: (selectedSchema.shadowProfile as "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep") || "subtle",
          },
    isTextEnabled: input.generatorType !== "icon",
    targetDimensions,
  };

  // Type-specific metadata
  if (input.generatorType === "screenshot" && r.layout) {
    const layout = (r.layout as Record<string, unknown>) || {};
    baseAsset.layout = {
      textPosition: (layout.textPosition as "top" | "center" | "bottom") || "bottom",
      textColor: (layout.textColor === "#0f0f0f") ? "#0f0f0f" : "#ffffff",
      accentColor: typeof layout.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(layout.accentColor) ? layout.accentColor : derivedPrimary,
      accentColorSecondary: typeof layout.accentColorSecondary === "string" && /^#[0-9a-fA-F]{6}$/.test(layout.accentColorSecondary) ? layout.accentColorSecondary : derivedSecondary,
      backgroundLuminance: (layout.backgroundLuminance === "light") ? "light" : "dark",
      backgroundMood: typeof layout.backgroundMood === "string" ? layout.backgroundMood.slice(0, 60) : `${selectedSchema.label} style`,
    };
  }

  if (input.generatorType === "icon" && r.iconMetadata) {
    const iconMeta = (r.iconMetadata as Record<string, unknown>) || {};
    baseAsset.iconMetadata = {
      centered: typeof iconMeta.centered === "boolean" ? iconMeta.centered : true,
      backgroundColor: typeof iconMeta.backgroundColor === "string" ? iconMeta.backgroundColor : derivedPrimary,
      focalPointScale: typeof iconMeta.focalPointScale === "number" ? Math.max(0.5, Math.min(1, iconMeta.focalPointScale)) : 0.8,
    };
  }

  if (input.generatorType === "banner" && r.bannerMetadata) {
    const bannerMeta = (r.bannerMetadata as Record<string, unknown>) || {};
    baseAsset.bannerMetadata = {
      aspectRatio: "2:1",
      compositionStyle: typeof bannerMeta.compositionStyle === "string" ? bannerMeta.compositionStyle : "cinematic minimalist",
      textZonePosition: (bannerMeta.textZonePosition as "left" | "right" | "center") || "right",
    };
  }

  // ── VERIFICATION: Final output sanity check ──────────────────────────────────
  console.log(
    `[generateASOAsset] Asset generated successfully: type=${baseAsset.generatorType}, schema=${baseAsset.selectedSchema}, textEnabled=${baseAsset.isTextEnabled}`
  );

  // Verify backgroundPrompt doesn't contain dangerous keywords
  const bgPromptVerification = verifyPromptCleanliness(
    baseAsset.backgroundPrompt,
    "Background Prompt (Runware-ready)"
  );
  console.log(`[generateASOAsset] ${bgPromptVerification.report}`);

  if (!bgPromptVerification.clean) {
    console.error(
      `[generateASOAsset] ❌ CRITICAL: Background prompt contains dangerous keywords that may cause hallucination`
    );
    console.error(
      `[generateASOAsset] Dangerous keywords found: ${bgPromptVerification.found.join(", ")}`
    );
    console.error(`[generateASOAsset] Background prompt: ${baseAsset.backgroundPrompt}`);
  }

  console.log(
    `[generateASOAsset] ✓ Generation complete. Ready for Runware composition.`
  );

  return baseAsset;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Export (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy export that wraps generateASOAsset for screenshot-only flows
 * @deprecated Use generateASOAsset with generatorType: 'screenshot' instead
 */
export async function generateScreenshotLayout(
  input: Omit<GenerateASOAssetInput, "generatorType">,
): Promise<ASOAsset> {
  return generateASOAsset({
    ...input,
    generatorType: "screenshot",
  });
}
