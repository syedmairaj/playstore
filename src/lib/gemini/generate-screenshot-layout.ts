import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import {
  MOOD_SCHEMAS,
  selectMoodSchemaForCategory,
  getValidSchemaIds,
  formatSchemaForGemini,
  type MoodSchemaType,
  type MoodSchema,
} from "@/lib/gemini/mood-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LayoutMap — Brand Mirror semantic layout engine output.
 *
 * Drives the two-layer pipeline:
 *  1. Runware FLUX — backgroundPrompt generates a brand-identity-synced background.
 *     No text, no phone frame — pure atmospheric scene derived from the app's palette.
 *  2. Canvas compositor — all other fields drive the bake-at-export layer:
 *     brand gradient, phone frame, razor-sharp typography, RTL geometry.
 *  3. Schema-Driven Assets — selectedSchema + typographyConfig guide asset selection
 *     for sharp compositing (font loading, shadow rendering, etc).
 */
export type LayoutMap = {
  /** Runware-ready background prompt — identity-synced, no text/frame */
  backgroundPrompt: string;
  /** Additional negative-prompt terms for this specific slide */
  negativeAdditions: string;
  /** Text block anchor: top third, center, or bottom third */
  textPosition: "top" | "center" | "bottom";
  /** Text colour chosen for maximum contrast: white on dark, near-black on light */
  textColor: "#ffffff" | "#0f0f0f";
  /** Primary brand accent hex — used for gradient overlay and text backdrop */
  accentColor: string;
  /** Secondary accent hex — used for gradient stop 2 (creates brand gradient) */
  accentColorSecondary: string;
  /** 3–6 word mood label shown in UI debug badge */
  backgroundMood: string;
  /** Specific UI screen/state to render inside the Android phone frame */
  uiMockDescription: string;
  /** Overall background luminance: "dark" | "light" — drives compositor decisions */
  backgroundLuminance: "dark" | "light";
  /** ───────── MOOD SCHEMA ADDITIONS ─────────────────────────────────────────── */
  /** Selected Mood Schema ID (one of 5 pre-validated schemas) */
  selectedSchema: "minimalist-professional" | "energetic-tech" | "organic-health" | "high-contrast-bold" | "luxury-premium";
  /** Typography configuration for sharp compositing */
  typographyConfig: {
    primaryColor: string;  // Hex color for text/badges
    fontStyle: "bold" | "elegant" | "clean";  // Font personality
    shadowProfile: "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep";  // Shadow rendering
  };
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
  primaryColor?: string; // second brand color for gradient
  locale: "en" | "ar";
  slideIndex: number; // 0=value_hook, 1-3=core_feature, 4=social_proof, 5=cta
  inferredMood?: string; // from generateScreenshotPack
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Derive secondary color from primary hex via HSL
// ─────────────────────────────────────────────────────────────────────────────
function deriveSecondaryColor(primaryHex: string): string {
  // Convert hex to RGB
  const hex = primaryHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Grayscale: shift lightness
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

  // Create secondary by darkening lightness by 15%
  const newL = Math.min(1, Math.max(0, l - 0.15));

  // HSL to RGB
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
// Structured-output schema
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    backgroundPrompt:      { type: SchemaType.STRING },
    negativeAdditions:     { type: SchemaType.STRING },
    textPosition:          { type: SchemaType.STRING },
    textColor:             { type: SchemaType.STRING },
    accentColor:           { type: SchemaType.STRING },
    accentColorSecondary:  { type: SchemaType.STRING },
    backgroundMood:        { type: SchemaType.STRING },
    uiMockDescription:     { type: SchemaType.STRING },
    backgroundLuminance:   { type: SchemaType.STRING },
    selectedSchema:        { type: SchemaType.STRING },
    typographyConfig:      {
      type: SchemaType.OBJECT,
      properties: {
        primaryColor:      { type: SchemaType.STRING },
        fontStyle:         { type: SchemaType.STRING },
        shadowProfile:     { type: SchemaType.STRING },
      },
      required: ["primaryColor", "fontStyle", "shadowProfile"],
    },
  },
  required: [
    "backgroundPrompt", "negativeAdditions", "textPosition", "textColor",
    "accentColor", "accentColorSecondary", "backgroundMood",
    "uiMockDescription", "backgroundLuminance",
    "selectedSchema", "typographyConfig",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Category-specific UI mock table
// When no screenshot is uploaded we generate a category-authentic dashboard.
// This is what makes the output feel bespoke rather than template-filled.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_UI_MOCKS: Record<string, string> = {
  finance:        "clean fintech dashboard showing balance card, recent transactions, and a spending chart",
  banking:        "mobile banking home screen with account balance, quick transfer buttons, and transaction history",
  fintech:        "investment portfolio screen with live chart, asset allocation pie chart, and gain/loss indicators",
  investment:     "portfolio overview with percentage growth chart, holdings list, and market movers",
  health:         "health dashboard with daily steps ring, heart rate monitor, sleep score, and hydration tracker",
  fitness:        "workout session screen showing exercise timer, rep counter, muscle group diagram, and progress streak",
  "health & fitness": "fitness app home with weekly workout calendar, calorie ring, and personal records",
  medical:        "health records screen with appointment cards, medication reminders, and vital signs chart",
  wellness:       "meditation session timer with breathing animation, streak counter, and mood log",
  productivity:   "task management board with categorised cards, priority tags, and completion progress bar",
  tools:          "utility main screen with clean function grid, recent activity, and quick-access toolbar",
  utilities:      "settings-style interface with toggle list, usage meter, and status indicators",
  food:           "food discovery feed with appetising dish cards, cuisine filters, and delivery time badges",
  "food & drink": "restaurant browse screen with hero dish photo, ratings, reviews, and order button",
  restaurant:     "menu screen with category tabs, dish photos, prices, and add-to-cart interaction",
  education:      "learning path screen with lesson cards, progress rings, streak badge, and level indicator",
  learning:       "course dashboard with video thumbnail, progress bar, quiz scores, and study calendar",
  entertainment:  "content discovery feed with hero banner, genre chips, continue-watching row, and trending section",
  games:          "game home screen with character selection, level map, achievement badges, and leaderboard",
  gaming:         "battle screen with player stats, inventory grid, minimap, and action buttons",
  social:         "social feed with profile cards, reaction counts, story bubbles, and trending topics",
  communication:  "messaging home with conversation list, online indicators, unread badges, and compose button",
  messaging:      "active chat screen with message bubbles, emoji reactions, voice message waveform",
  travel:         "destination discovery with hero map card, trip itinerary, flight cards, and local weather",
  navigation:     "turn-by-turn navigation screen with route highlighted on map, ETA card, and lane guidance",
  shopping:       "product listing with editorial hero image, price badge, reviews stars, and add-to-bag button",
  ecommerce:      "category browse with product grid, filter chips, wishlist hearts, and flash sale timer",
  music:          "now-playing screen with album art, equaliser visualiser, lyrics overlay, and queue",
  audio:          "podcast player with waveform scrubber, chapter list, speed control, and sleep timer",
};

function getUIMock(category: string, fallback: string): string {
  const key = category.toLowerCase().trim();
  if (CATEGORY_UI_MOCKS[key]) return CATEGORY_UI_MOCKS[key];
  for (const [cat, mock] of Object.entries(CATEGORY_UI_MOCKS)) {
    if (key.includes(cat) || cat.includes(key)) return mock;
  }
  return fallback || "modern app dashboard with clean data visualisation and intuitive navigation";
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MOOD SCHEMA SELECTOR — Maps user-facing style names to Mood Schema IDs.
 * Preserves backward compatibility with existing style enum while routing to schema system.
 */
const STYLE_TO_MOOD_SCHEMA: Record<string, MoodSchemaType> = {
  Minimalist:     "minimalist-professional",
  Modern:         "energetic-tech",
  Bold:           "high-contrast-bold",
  Playful:        "organic-health",
  Professional:   "minimalist-professional",
  "Flat Design":  "energetic-tech",
};

function buildLayoutPrompt(input: GenerateScreenshotLayoutInput): string {
  const {
    appName, category, shortDescription, headline, subline,
    uiFocus, style, brandColor, primaryColor, locale, slideIndex, inferredMood,
  } = input;

  const SLIDE_ROLES = [
    "SLIDE 1 — HERO VALUE HOOK (biggest stop-scroll benefit, most important slide)",
    "SLIDE 2 — CORE FEATURE BENEFIT (specific capability shown in action)",
    "SLIDE 3 — CORE FEATURE BENEFIT (second key differentiator)",
    "SLIDE 4 — CORE FEATURE BENEFIT (third capability or unique advantage)",
    "SLIDE 5 — SOCIAL PROOF & TRUST (credential, user outcome, rating, or milestone)",
    "SLIDE 6 — DOWNLOAD CALL TO ACTION (urgency, transformation, final close)",
  ];
  const slideRole = SLIDE_ROLES[slideIndex] ?? `SLIDE ${slideIndex + 1}`;
  const isRTL = locale === "ar";

  // ─────────────────────────────────────────────────────────────────────────
  // MOOD SCHEMA SELECTION
  // Use user-provided style, category inference, or explicit brand color to select schema.
  // ─────────────────────────────────────────────────────────────────────────
  let selectedMoodSchema = selectMoodSchemaForCategory(category);

  // If user provided a style, try to map it to a schema
  if (style && STYLE_TO_MOOD_SCHEMA[style]) {
    selectedMoodSchema = MOOD_SCHEMAS[STYLE_TO_MOOD_SCHEMA[style]];
  }

  // If brand color provided, try to find the best-matching schema by luminance
  if (brandColor) {
    const hex = brandColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const isLight = luminance > 0.5;

    // For light brand colors, prefer light-luminance schemas
    // For dark brand colors, prefer dark-luminance schemas
    // (This is a soft preference; the explicit brandColor overrides schema colors)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL: Derive brand palette BEFORE passing to Gemini.
  // This ensures accentColor and accentColorSecondary are explicit constraints,
  // preventing the "green fallback" bug where Gemini omits these fields.
  // ─────────────────────────────────────────────────────────────────────────

  // Use brand color if provided; otherwise use schema's primary color
  const derivedPrimary = brandColor ?? selectedMoodSchema.primaryColor;
  const derivedSecondary = primaryColor || deriveSecondaryColor(derivedPrimary);

  // Brand palette description — now with EXPLICIT hex requirement
  const paletteDesc =
    `Primary brand colour MUST be EXACTLY: ${derivedPrimary}. ` +
    `Secondary accent MUST be EXACTLY: ${derivedSecondary}. ` +
    `In your JSON response, accentColor MUST be "${derivedPrimary}" and accentColorSecondary MUST be "${derivedSecondary}".`;

  // Layout geometry instruction
  const framePosition = isRTL
    ? "Android phone frame sits in the LEFT third of the canvas. Text block occupies the RIGHT two-thirds."
    : "Android phone frame sits in the RIGHT third of the canvas. Text block occupies the LEFT two-thirds.";

  const uiMock = getUIMock(category, uiFocus);

  const mood = inferredMood ?? selectedMoodSchema.label;

  // ─────────────────────────────────────────────────────────────────────────
  // Format all 5 Mood Schemas for Gemini constraint enforcement
  // ─────────────────────────────────────────────────────────────────────────
  const allSchemasFormatted = Object.values(MOOD_SCHEMAS)
    .map(s => formatSchemaForGemini(s))
    .join(",\n  ");

  return `You are the creative director of a world-class mobile app marketing studio. You are crafting a 'Brand Mirror' screenshot — an asset so visually aligned with the app's identity that it feels like an extension of the app's own UI.

═══════════════════════════════════════════════════════════════════════════════════
🎨 MOOD SCHEMA FRAMEWORK — YOU ARE A SELECTOR, NOT AN INVENTOR
═══════════════════════════════════════════════════════════════════════════════════

Your PRIMARY task is to SELECT ONE of these 5 pre-validated Mood Schemas.
Do NOT create custom colors, fonts, or shadow profiles. Use ONLY what is defined below.

AVAILABLE MOOD SCHEMAS (Selectable Only):
${allSchemasFormatted}

SELECTION RULE:
The recommended schema for this app is: "${selectedMoodSchema.id}" (${selectedMoodSchema.label})
Rationale: Optimal for ${category} category apps.

Your selectedSchema field MUST be one of these exact values:
  • "minimalist-professional"
  • "energetic-tech"
  • "organic-health"
  • "high-contrast-bold"
  • "luxury-premium"

DO NOT invent other schemas. DO NOT mix colors across schemas.

═══════════════════════════════════════════════════════════════════════════════════
🏢 BRAND CONTEXT
═══════════════════════════════════════════════════════════════════════════════════
App: "${appName}" (${category})${shortDescription ? `\nValue prop: "${shortDescription}"` : ""}
Recommended Mood: ${selectedMoodSchema.label}
${paletteDesc}
Slide role: ${slideRole}
Headline: "${headline}"
Sub-caption: "${subline}"

LAYOUT GEOMETRY
───────────────
Canvas: 9:16 portrait Android screenshot (1024×1792 px Runware source, exported at 1080×1920)
${framePosition}
${isRTL ? "RTL: all text elements right-aligned, Arabic typography." : "LTR: standard left-to-right typographic hierarchy."}

TASK
────
Produce a LayoutMap JSON that drives three systems:

1. RUNWARE BACKGROUND PROMPT (backgroundPrompt) — HIGHEST PRIORITY

   🚫 ⚠️ CRITICAL CONSTRAINT ⚠️ 🚫
   ═════════════════════════════════════════════════════════════════════════════
   BACKGROUND ONLY — NO DEVICE FRAME. NO PHONE. NO MOCKUP.

   This is a studio backdrop. The Android phone frame is composited SEPARATELY by sharp.
   Your prompt must describe a PURE background — ZERO device hardware of any kind.

   If you include any phone/frame description, the output is UNUSABLE (2 overlapping frames).
   ═════════════════════════════════════════════════════════════════════════════

   ══ WHAT YOU ARE GENERATING ══
   A pure atmospheric background for a mobile app store screenshot.
   The Android Pixel 9 Pro frame will be overlaid on top by a separate compositor.
   You are generating ONLY the backdrop — like a professional studio backdrop behind a product shot.

   ══ THE 5 MANDATORY CONSTRAINTS ══

   CONSTRAINT 1 — ZERO HARDWARE (ABSOLUTE NON-NEGOTIABLE)
   ─ The output must contain ZERO device frames, smartphones, silhouettes, notches, bezels,
     screens, or any hardware mockup of any kind.
   ─ ${isRTL ? "لا يجوز تضمين أي جهاز، هاتف، أو إطار في الصورة. الخلفية فقط." : "No device of any kind. Background art only."}
   ─ If you describe a phone or screen, the final composited image will have two overlapping frames = UNUSABLE.
   ─ DO NOT MENTION: phone, smartphone, iPhone, Android, device, frame, mockup, silhouette, screen.

   CONSTRAINT 2 — 30% NEGATIVE SPACE (COMPOSITION SAFETY)
   ─ The ${isRTL ? "LEFT" : "RIGHT"} third of the canvas must be kept CLEAN and relatively uncluttered.
     This zone receives the phone frame overlay. Keep background elements light, subtle, or absent here.
   ─ The ${isRTL ? "RIGHT" : "LEFT"} two-thirds is the active zone — this is where rich brand elements live.
   ─ Think of it as: active zone (text + brand) | breathing zone (frame overlay).
   ─ Do NOT place high-contrast shapes, gradients, or busy patterns in the frame zone.

   CONSTRAINT 3 — COHESIVE PALETTE ACROSS ALL 6 SLIDES
   ─ All 6 backgrounds share the same brand palette: ${paletteDesc}
   ─ Each slide may vary in composition, energy, and element placement — but the colour language
     must be immediately recognisable as part of the same visual family.
   ─ Vary: gradient direction, shape density, light source, element scale.
   ─ Keep constant: hue family, saturation level, overall tone (dark/light).

   CONSTRAINT 4 — MOOD SCHEMA AESTHETIC (USE SCHEMA KEYWORDS)
   ─ Your visual description MUST incorporate aesthetic keywords from "${selectedMoodSchema.id}":
     ${selectedMoodSchema.aestheticKeywords.join(", ")}
   ─ Use ONLY these keywords. Do NOT invent new aesthetic descriptors.
   ─ The style reference brands for this schema: See schema definition above.

   CONSTRAINT 5 — EXPLICIT EXCLUSIONS (REINFORCED IN RUNWARE NEGATIVE)
   ─ Your prompt must NOT contain any of these words or concepts:
     phone, smartphone, iPhone, Android, device, hardware, frame, notch, bezel, screen,
     text, lettering, words, UI, interface, mockup, silhouette, gadget, app screenshot.

   ══ WHAT TO INCLUDE ══
   ─ Describe: gradient direction and stops, dominant and accent colours, abstract geometric forms,
     lighting direction (soft directional light, ambient glow), texture grain if appropriate,
     compositional energy (calm/dynamic/bold), depth layers (foreground accent / midground / background).
   ─ Locale: ${isRTL ? "Arabic (RTL) — composition must be mirrored. Active zone on the RIGHT. Frame zone on the LEFT." : "English (LTR) — standard. Active zone on the LEFT. Frame zone on the RIGHT."}
   ─ Runware-ready: concrete, evocative, adjective-rich. No markdown, no quotes.

2. CANVAS COMPOSITOR METADATA (sharp Compositing)
   ─ textPosition: "top" (slides 1,6), "center" (slides 3,4), "bottom" (slides 2,5) — vary it.
   ─ textColor: "#ffffff" if background is dark/mid-tone; "#0f0f0f" only if background is very light.
   ─ accentColor: exact 6-digit hex for gradient stop 1 (primary brand colour or derived).
   ─ accentColorSecondary: exact 6-digit hex for gradient stop 2 (must harmonise with accentColor).
   ─ backgroundMood: 3–6 word label (e.g. "deep teal minimal fintech", "warm amber artisan food").
   ─ uiMockDescription: "${uiMock}" (refine if needed for this specific slide).
   ─ backgroundLuminance: "dark" if the background is predominantly dark; "light" if predominantly light.
   ─ negativeAdditions: ALWAYS include "phone, smartphone, iPhone, Android phone, device, mockup, screen, bezel, notch" plus any slide-specific additions (e.g. for light backgrounds add "dark background, low key lighting").

3. MOOD SCHEMA CONFIGURATION (Asset Selection for sharp Pipeline)
   ─ selectedSchema: MUST be one of: "minimalist-professional" | "energetic-tech" | "organic-health" | "high-contrast-bold" | "luxury-premium"
   ─ RECOMMENDED for this app: "${selectedMoodSchema.id}"
   ─ typographyConfig:
     • primaryColor: exact 6-digit hex (typically accent color for text/badges)
     • fontStyle: MUST be ONE of: "bold" | "elegant" | "clean" (from "${selectedMoodSchema.id}", fontStyle is "${selectedMoodSchema.fontStyle}")
     • shadowProfile: MUST be ONE of: "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep"
       (from "${selectedMoodSchema.id}", shadowProfile is "${selectedMoodSchema.shadowProfile}")

BRAND MIRROR QUALITY MANDATE
------------------------------
• The output must compete with assets from top-100 Play Store apps. No exceptions.
• Each of the 6 slides must feel DISTINCT yet cohesive — same brand, different energy.
• Slide 1 (Hero) = maximum impact, boldest composition.
• Slides 2–4 (Features) = focused, single-idea clarity.
• Slide 5 (Trust) = warm, credible, human.
• Slide 6 (CTA) = confident, directional, urgent.
• ZERO template aesthetics. ZERO generic gradients. ZERO clip-art elements.`;
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

function parseTextColor(raw: unknown): "#ffffff" | "#0f0f0f" {
  if (raw === "#0f0f0f" || raw === "#111111" || raw === "#000000") return "#0f0f0f";
  return "#ffffff";
}

function parseHex(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.trim())) return raw.trim();
  return fallback;
}

function parseLuminance(raw: unknown): "dark" | "light" {
  if (raw === "light") return "light";
  return "dark";
}

// ─────────────────────────────────────────────────────────────────────────
// Mood Schema field validators
// ─────────────────────────────────────────────────────────────────────────

function parseSelectedSchema(raw: unknown): MoodSchemaType {
  const validIds = getValidSchemaIds();
  if (typeof raw === "string" && validIds.includes(raw as MoodSchemaType)) {
    return raw as MoodSchemaType;
  }
  // Fallback to energetic-tech if invalid
  return "energetic-tech";
}

function parseFontStyle(raw: unknown): "bold" | "elegant" | "clean" {
  if (raw === "bold" || raw === "elegant" || raw === "clean") return raw;
  return "clean";
}

function parseShadowProfile(raw: unknown): "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep" {
  if (["sharp", "soft-spread", "subtle", "hard-edge", "deep"].includes(raw as string)) {
    return raw as "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep";
  }
  return "subtle";
}

function parseLayoutMap(
  raw: unknown,
  brandColor?: string,
  primaryColor?: string,
  selectedMoodSchema?: MoodSchema,
): LayoutMap {
  const r = (raw ?? {}) as Record<string, unknown>;

  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL: Use derived colors, NOT green fallback
  // If Gemini returns invalid hex values, fall back to brandColor or schema color.
  // ─────────────────────────────────────────────────────────────────────────
  const fallbackAccent = brandColor ?? selectedMoodSchema?.primaryColor ?? "#6366F1";
  const fallbackSecondary = primaryColor ?? deriveSecondaryColor(fallbackAccent);

  // Parse Mood Schema selection
  const parsedSchema = parseSelectedSchema(r.selectedSchema);
  const schema = MOOD_SCHEMAS[parsedSchema];

  // Parse typography config
  const typographyRaw = (r.typographyConfig ?? {}) as Record<string, unknown>;
  const typographyConfig = {
    primaryColor: parseHex(typographyRaw.primaryColor, fallbackAccent),
    fontStyle: parseFontStyle(typographyRaw.fontStyle),
    shadowProfile: parseShadowProfile(typographyRaw.shadowProfile),
  };

  return {
    backgroundPrompt:     clamp(r.backgroundPrompt, 900, `BACKGROUND ONLY. Premium brand-identity background for ${brandColor ?? "neutral"} app, clean professional gradient, generous whitespace. NO PHONE FRAME.`),
    negativeAdditions:    clamp(r.negativeAdditions, 300, "phone, smartphone, iPhone, Android phone, device, mockup, screen, bezel, notch, hardware, frame"),
    textPosition:         parseTextPosition(r.textPosition),
    textColor:            parseTextColor(r.textColor),
    accentColor:          parseHex(r.accentColor, fallbackAccent),
    accentColorSecondary: parseHex(r.accentColorSecondary, fallbackSecondary),
    backgroundMood:       clamp(r.backgroundMood, 60, `${schema.label} style`),
    uiMockDescription:    clamp(r.uiMockDescription, 250, "clean app dashboard with data visualisation"),
    backgroundLuminance:  parseLuminance(r.backgroundLuminance),
    selectedSchema:       parsedSchema,
    typographyConfig,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function generateScreenshotLayout(
  input: GenerateScreenshotLayoutInput,
): Promise<LayoutMap> {
  // Pre-compute selected Mood Schema for fallback reference
  const selectedMoodSchema = selectMoodSchemaForCategory(input.category);

  // ✅ REFACTORED: Use centralized Vertex AI gateway (no API key needed)
  const model = getGenerativeModel({
    maxOutputTokens: 1400,
    temperature: 0.7,
  });

  const prompt = buildLayoutPrompt(input);
  const result = await model.generateContent(prompt);
  const text = (result.text ?? "").trim();

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

  return parseLayoutMap(parsed, input.brandColor, input.primaryColor, selectedMoodSchema);
}
