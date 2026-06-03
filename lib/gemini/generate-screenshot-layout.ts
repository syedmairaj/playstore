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
 * LayoutMap — Brand Mirror semantic layout engine output.
 *
 * Drives the two-layer pipeline:
 *  1. Runware FLUX — backgroundPrompt generates a brand-identity-synced background.
 *     No text, no phone frame — pure atmospheric scene derived from the app's palette.
 *  2. Canvas compositor — all other fields drive the bake-at-export layer:
 *     brand gradient, phone frame, razor-sharp typography, RTL geometry.
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
  },
  required: [
    "backgroundPrompt", "negativeAdditions", "textPosition", "textColor",
    "accentColor", "accentColorSecondary", "backgroundMood",
    "uiMockDescription", "backgroundLuminance",
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

const STYLE_LANGUAGE: Record<string, string> = {
  Minimalist:     "ultra-clean white space, 1–2 brand colours, no decoration, maximum breathing room",
  Modern:         "bold geometric shapes, strong colour blocking, flat depth, contemporary energy",
  Bold:           "high-contrast vivid palette, dynamic diagonal bands, kinetic energy, confident",
  Playful:        "soft rounded shapes, friendly gradients, illustrated accents, warm approachable",
  Professional:   "structured grid, muted premium palette, subtle texture, authoritative restraint",
  "Flat Design":  "pure flat fills, crisp vector geometry, no gradients, iconic clarity",
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
  const styleLanguage = STYLE_LANGUAGE[style] ?? STYLE_LANGUAGE.Modern;
  const isRTL = locale === "ar";
  const mood = inferredMood ?? "modern premium";

  // Brand palette description
  const paletteDesc = brandColor
    ? primaryColor
      ? `Primary brand colour: ${brandColor}. Secondary accent: ${primaryColor}. Use both to create a rich brand gradient.`
      : `Brand colour: ${brandColor}. Derive a complementary secondary tone for gradient depth.`
    : "Derive the brand palette from the app category and mood.";

  // Layout geometry instruction
  const framePosition = isRTL
    ? "Android phone frame sits in the LEFT third of the canvas. Text block occupies the RIGHT two-thirds."
    : "Android phone frame sits in the RIGHT third of the canvas. Text block occupies the LEFT two-thirds.";

  const uiMock = getUIMock(category, uiFocus);

  return `You are the creative director of a world-class mobile app marketing studio. You are crafting a 'Brand Mirror' screenshot — an asset so visually aligned with the app's identity that it feels like an extension of the app's own UI.

BRAND CONTEXT
-------------
App: "${appName}" (${category})${shortDescription ? `\nValue prop: "${shortDescription}"` : ""}
Mood: ${mood}
Visual language: ${styleLanguage}
${paletteDesc}
Slide role: ${slideRole}
Headline: "${headline}"
Sub-caption: "${subline}"

LAYOUT GEOMETRY
---------------
Canvas: 9:16 portrait Android screenshot (1024×1792 px Runware source, exported at 1080×1920)
${framePosition}
${isRTL ? "RTL: all text elements right-aligned, Arabic typography." : "LTR: standard left-to-right typographic hierarchy."}

TASK
----
Produce a LayoutMap JSON that drives two systems:

1. RUNWARE BACKGROUND PROMPT (backgroundPrompt)

   ══ WHAT YOU ARE GENERATING ══
   A pure background image for a mobile app store screenshot.
   The Android phone frame will be overlaid on top by a separate compositor.
   You are generating ONLY the backdrop — like a professional studio backdrop behind a product shot.

   ══ THE 6 STRICT CONSTRAINTS (ALL MANDATORY) ══

   CONSTRAINT 1 — ZERO HARDWARE
   ─ The output must contain ZERO device frames, smartphones, silhouettes, notches, bezels,
     screens, or any hardware mockup of any kind.
   ─ ${isRTL ? "لا يجوز تضمين أي جهاز، هاتف، أو إطار في الصورة. الخلفية فقط." : "No device of any kind. Background art only."}
   ─ If you describe a phone or screen, the final composited image will have two overlapping frames = unusable.

   CONSTRAINT 2 — 30% NEGATIVE SPACE (CRITICAL FOR COMPOSITION)
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

   CONSTRAINT 4 — PROFESSIONAL AESTHETIC
   ─ Use soft-light gradients, abstract geometric shapes, or subtle organic textures.
   ─ Style reference: Notion, Calm, Duolingo, Robinhood, Linear, Headspace — intentional, spacious, premium.
   ─ Avoid: neon explosions, rainbow gradients, busy patterns, stock-photo clichés.
   ─ The slide role is: ${slideRole} — let the energy of the composition reflect this role.
     (Hero = boldest, most impactful. Features = focused, single-idea. Trust = warm, credible. CTA = confident.)

   CONSTRAINT 5 — EXPLICIT EXCLUSIONS (hardcoded in Runware negative prompt — reinforce in your description)
   ─ Your prompt must NOT contain any of these words or concepts:
     phone, smartphone, iPhone, Android, device, hardware, frame, notch, bezel, screen,
     text, lettering, words, UI, interface, mockup, silhouette, gadget.

   ══ WHAT TO INCLUDE ══
   ─ Describe: gradient direction and stops, dominant and accent colours, abstract geometric forms,
     lighting direction (soft directional light, ambient glow), texture grain if appropriate,
     compositional energy (calm/dynamic/bold), depth layers (foreground accent / midground / background).
   ─ Locale: ${isRTL ? "Arabic (RTL) — composition must be mirrored. Active zone on the RIGHT. Frame zone on the LEFT." : "English (LTR) — standard. Active zone on the LEFT. Frame zone on the RIGHT."}
   ─ Runware-ready: concrete, evocative, adjective-rich. No markdown, no quotes.

2. CANVAS COMPOSITOR METADATA
   ─ textPosition: "top" (slides 1,6), "center" (slides 3,4), "bottom" (slides 2,5) — vary it.
   ─ textColor: "#ffffff" if background is dark/mid-tone; "#0f0f0f" only if background is very light.
   ─ accentColor: exact 6-digit hex for gradient stop 1 (primary brand colour or derived).
   ─ accentColorSecondary: exact 6-digit hex for gradient stop 2 (must harmonise with accentColor).
   ─ backgroundMood: 3–6 word label (e.g. "deep teal minimal fintech", "warm amber artisan food").
   ─ uiMockDescription: "${uiMock}" (refine if needed for this specific slide).
   ─ backgroundLuminance: "dark" if the background is predominantly dark; "light" if predominantly light.
   ─ negativeAdditions: ALWAYS include "phone, smartphone, iPhone, Android phone, device, mockup, screen, bezel, notch" plus any slide-specific additions (e.g. for light backgrounds add "dark background, low key lighting").

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

function parseLayoutMap(raw: unknown, brandColor?: string, primaryColor?: string): LayoutMap {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fallbackAccent = brandColor ?? "#22C55E";
  const fallbackSecondary = primaryColor ?? "#16a34a";
  return {
    backgroundPrompt:     clamp(r.backgroundPrompt, 900, `Premium brand-identity background for ${brandColor ?? "green"} accent app, clean professional gradient, generous whitespace`),
    negativeAdditions:    clamp(r.negativeAdditions, 300, ""),
    textPosition:         parseTextPosition(r.textPosition),
    textColor:            parseTextColor(r.textColor),
    accentColor:          parseHex(r.accentColor, fallbackAccent),
    accentColorSecondary: parseHex(r.accentColorSecondary, fallbackSecondary),
    backgroundMood:       clamp(r.backgroundMood, 60, "modern brand gradient"),
    uiMockDescription:    clamp(r.uiMockDescription, 250, "clean app dashboard with data visualisation"),
    backgroundLuminance:  parseLuminance(r.backgroundLuminance),
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
      maxOutputTokens: 1400,
      temperature: 0.7,
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

  return parseLayoutMap(parsed, input.brandColor, input.primaryColor);
}
