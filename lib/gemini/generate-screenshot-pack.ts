import "server-only";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import {
  assertGeminiApiKey,
  mergeGeminiGenerationConfig,
  resolveGeminiModel,
} from "@/lib/gemini/gemini-defaults";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";

// ─────────────────────────────────────────────────────────────────────────────
// Category → mood inference table
// When the user provides no theme, we infer the appropriate visual atmosphere
// from the app category. This eliminates choice paralysis and ensures the
// visual language matches user expectations.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MOOD_MAP: Record<string, string> = {
  // Finance
  finance: "clean professional trust-building, navy blue and gold accents, authoritative",
  banking: "clean professional trust-building, navy blue and gold accents, authoritative",
  fintech: "modern sleek dark, emerald green accents, data-driven precision",
  investment: "premium dark background, subtle gold, sophisticated minimalist",
  // Health & Fitness
  health: "energetic bold, vibrant gradient, motivational uplifting",
  fitness: "dynamic bold contrast, electric blue or neon green, high-energy athletic",
  "health & fitness": "dynamic bold contrast, electric blue or neon green, high-energy athletic",
  medical: "clean clinical white, trustworthy blue, calm professional",
  wellness: "soft natural tones, sage green and warm white, serene calming",
  // Productivity
  productivity: "minimal clean white space, structured grid, sharp modern",
  tools: "minimal dark or light, utility-first clean design, no decoration",
  utilities: "minimal dark or light, utility-first clean design, no decoration",
  // Food & Drink
  food: "warm appetising tones, rich oranges and deep reds, mouth-watering inviting",
  "food & drink": "warm appetising tones, rich oranges and deep reds, mouth-watering inviting",
  restaurant: "premium dark background, warm amber lighting, luxurious dining feel",
  // Education
  education: "friendly approachable, bright blues and yellows, encouraging positive",
  learning: "friendly approachable, bright blues and yellows, encouraging positive",
  // Entertainment
  entertainment: "rich dark atmospheric, vibrant purple and magenta, immersive cinematic",
  games: "bold vibrant dynamic, electric colours, exciting gamified",
  gaming: "bold vibrant dynamic, electric colours, exciting gamified",
  // Social
  social: "friendly warm gradient, coral and purple, community-driven welcoming",
  communication: "clean modern blue gradient, crisp and connected, reliable",
  messaging: "clean modern blue gradient, crisp and connected, reliable",
  // Travel
  travel: "wide open sky blue, horizon gradients, adventurous wanderlust",
  navigation: "dark map-inspired, electric blue highlights, confident directional",
  // Shopping
  shopping: "clean white minimal, confident typography, premium retail aesthetic",
  ecommerce: "clean white minimal, confident typography, premium retail aesthetic",
  // Music
  music: "dark atmospheric with vibrant waveform colours, immersive audio-inspired",
  audio: "dark atmospheric with vibrant waveform colours, immersive audio-inspired",
};

function inferMood(category: string): string {
  const key = category.toLowerCase().trim();
  // Exact match
  if (CATEGORY_MOOD_MAP[key]) return CATEGORY_MOOD_MAP[key];
  // Partial match
  for (const [cat, mood] of Object.entries(CATEGORY_MOOD_MAP)) {
    if (key.includes(cat) || cat.includes(key)) return mood;
  }
  return "clean modern professional, strong typography hierarchy, generous whitespace";
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PackSlide = {
  /** Slide position 1–6 */
  position: number;
  /** Narrative role */
  role: "value_hook" | "core_feature" | "social_proof" | "cta";
  /** Bold headline ≤40 chars — rendered large on screen */
  headline: string;
  /** Supporting sub-copy ≤70 chars — rendered smaller below headline */
  subline: string;
  /** Headline in Arabic ≤40 chars */
  headlineAr: string;
  /** Subline in Arabic ≤70 chars */
  sublineAr: string;
  /** What UI state / screen to show in the phone frame */
  uiFocus: string;
};

export type ScreenshotPackResult = {
  slides: PackSlide[];
  inferredMood: string;
};

export type GenerateScreenshotPackInput = {
  appName: string;
  category: string;
  shortDescription?: string;
  /** Optimized listing title from Tier 1 — grounding context */
  listingTitle?: string;
  /** Feature bullets from Tier 1 listing */
  features?: string;
  style: string;
  brandColor?: string;
  /** User-supplied theme/mood override */
  theme?: string;
  /** User-supplied headline override — applied to slide 1 (value hook) */
  headlineOverride?: string;
  /** User-supplied subline override — applied to slide 1 */
  sublineOverride?: string;
  locale: "en" | "ar";
  optimizedForConversion: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Structured-output schema
// ─────────────────────────────────────────────────────────────────────────────

const SLIDE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    position: { type: SchemaType.INTEGER },
    role: { type: SchemaType.STRING },
    headline: { type: SchemaType.STRING },
    subline: { type: SchemaType.STRING },
    headlineAr: { type: SchemaType.STRING },
    sublineAr: { type: SchemaType.STRING },
    uiFocus: { type: SchemaType.STRING },
  },
  required: ["position", "role", "headline", "subline", "headlineAr", "sublineAr", "uiFocus"],
};

const PACK_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    slides: { type: SchemaType.ARRAY, items: SLIDE_SCHEMA },
    inferredMood: { type: SchemaType.STRING },
  },
  required: ["slides", "inferredMood"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(input: GenerateScreenshotPackInput, inferredMood: string): string {
  const {
    appName, category, shortDescription, listingTitle, features,
    style, brandColor, theme, headlineOverride, sublineOverride,
    locale, optimizedForConversion,
  } = input;

  const mood = theme?.trim() || inferredMood;

  const contextParts: string[] = [
    `App name: "${appName}"`,
    `Category: ${category}`,
  ];
  if (listingTitle) contextParts.push(`Optimized Play Store title: "${listingTitle}"`);
  if (shortDescription) contextParts.push(`Short description: "${shortDescription}"`);
  if (features) contextParts.push(`Key features:\n${features}`);
  if (brandColor) contextParts.push(`Brand color: ${brandColor}`);
  contextParts.push(`Visual style: ${style}`);
  contextParts.push(`Visual mood: ${mood}`);
  if (optimizedForConversion) contextParts.push(`Source: ASO-optimized listing copy (Tier 1 — prioritize this for accuracy).`);

  const overrideNote = (headlineOverride || sublineOverride)
    ? `\nUSER OVERRIDES (apply to Slide 1 only):${headlineOverride ? `\n  - Headline: "${headlineOverride}"` : ""}${sublineOverride ? `\n  - Subline: "${sublineOverride}"` : ""}`
    : "";

  return `You are a world-class App Store Optimisation (ASO) conversion copywriter and creative director.

Research shows users spend only ~7 seconds scanning Play Store screenshots. The first 3 slides drive 80%+ of install decisions. Your job is to write a structured 6-slide carousel that maximises install conversion.

APP CONTEXT
-----------
${contextParts.join("\n")}
${overrideNote}

TASK
----
Generate exactly 6 slides following this CONVERSION NARRATIVE ARC:

Slide 1 — VALUE HOOK (role: "value_hook")
  • The single most powerful reason to install. Lead with the biggest benefit, not a feature.
  • This is the most important slide — it must stop the scroll.

Slides 2, 3, 4 — CORE FEATURES (role: "core_feature")
  • One specific, tangible capability per slide. Show the app doing something remarkable.
  • Be concrete: "track 10+ habits" > "track habits".

Slide 5 — SOCIAL PROOF / TRUST (role: "social_proof")
  • A trust signal: user count, rating, award, or a specific outcome users achieve.
  • Make it credible and specific.

Slide 6 — CALL TO ACTION (role: "cta")
  • A compelling reason to act right now. Create urgency or articulate the transformation.
  • Should feel like a natural close to the story told in slides 1–5.

COPY RULES (CRITICAL — enforce these strictly)
----------------------------------------------
• headline: ≤40 characters. Bold, punchy, front-loaded value. Zero filler words.
  GOOD: "Track 10 habits daily" BAD: "Start tracking your habits today"
• subline: ≤70 characters. One tight supporting sentence. Complete the headline's thought.
• Both headline and subline must work as standalone reading — no ellipsis, no fragments.
• Write as if you are a top-tier SaaS copywriter competing with Duolingo, Calm, Notion.

QUALITY STANDARDS (CRITICAL)
------------------------------
• Professional: No generic phrases ("Download now", "Try for free", "Easy to use").
• Benefit-first: Lead with the outcome the user achieves, not the feature that delivers it.
• Specific: Concrete numbers and outcomes beat vague claims every time.
• Punchy: If you can say it in 6 words, don't use 10.

ARABIC COPY (headlineAr / sublineAr)
-------------------------------------
• Write natural Modern Standard Arabic — NOT a literal translation.
• Mirror the emotional punch and specificity of the English copy.
• Maintain the same ≤40 / ≤70 character limits.
• Arabic direction is right-to-left — keep sentences tight and impactful.

UI FOCUS
---------
• uiFocus: describe the specific app screen/state shown in the phone frame mockup.
  (e.g. "dark mode dashboard with weekly habit streak chart visible")

INFERRED MOOD
--------------
• inferredMood: confirm or refine the visual mood for the background generation.
  Return the mood as a concise descriptor (5–10 words).

Return JSON matching the schema exactly. role must be one of: "value_hook", "core_feature", "social_proof", "cta".`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = ["value_hook", "core_feature", "social_proof", "cta"] as const;
type SlideRole = typeof ROLES[number];

function parseRole(raw: unknown, fallback: SlideRole): SlideRole {
  return ROLES.includes(raw as SlideRole) ? (raw as SlideRole) : fallback;
}

function clamp(s: unknown, max: number, fallback = ""): string {
  if (typeof s !== "string" || !s.trim()) return fallback;
  return s.trim().slice(0, max);
}

function parseSlide(raw: unknown, i: number): PackSlide {
  const r = (raw ?? {}) as Record<string, unknown>;
  const roleDefaults: SlideRole[] = ["value_hook", "core_feature", "core_feature", "core_feature", "social_proof", "cta"];
  return {
    position: i + 1,
    role: parseRole(r.role, roleDefaults[i] ?? "core_feature"),
    headline: clamp(r.headline, 40, `Slide ${i + 1}`),
    subline: clamp(r.subline, 70, ""),
    headlineAr: clamp(r.headlineAr, 40) || clamp(r.headline, 40, ""),
    sublineAr: clamp(r.sublineAr, 70) || clamp(r.subline, 70, ""),
    uiFocus: clamp(r.uiFocus, 200, "app main screen"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function generateScreenshotPack(
  input: GenerateScreenshotPackInput,
): Promise<ScreenshotPackResult> {
  const inferredMood = input.theme?.trim() || inferMood(input.category);

  const apiKey = assertGeminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: resolveGeminiModel(),
    generationConfig: mergeGeminiGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: PACK_SCHEMA as never,
      maxOutputTokens: 3500,
      temperature: 0.65,
    }),
  });

  const prompt = buildPrompt(input, inferredMood);
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: unknown;
  try {
    const clean = text.startsWith("```") ? text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim() : text;
    parsed = JSON.parse(clean);
  } catch {
    throw new InvalidModelOutputError(`Screenshot pack: JSON parse failed. Raw: ${text.slice(0, 300)}`);
  }

  const root = (parsed ?? {}) as Record<string, unknown>;
  const rawSlides = Array.isArray(root.slides) ? root.slides : [];

  // Ensure exactly 6 slides — pad or trim
  const slides: PackSlide[] = Array.from({ length: 6 }, (_, i) =>
    parseSlide(rawSlides[i], i),
  );

  // Apply user overrides to slide 1
  if (input.headlineOverride?.trim()) slides[0].headline = input.headlineOverride.trim().slice(0, 40);
  if (input.sublineOverride?.trim()) slides[0].subline = input.sublineOverride.trim().slice(0, 70);

  return {
    slides,
    inferredMood: clamp(root.inferredMood, 120, inferredMood),
  };
}
