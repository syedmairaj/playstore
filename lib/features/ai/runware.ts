import "server-only";

import { randomInt, randomUUID } from "node:crypto";

/** Runware REST base (POST JSON array of tasks). Override with `RUNWARE_API_URL` if needed. */
const DEFAULT_RUNWARE_API_URL = "https://api.runware.ai/v1";

/** FLUX.1 [dev] — full quality model (4× more denoising steps than schnell, sharper icon output). */
const DEFAULT_RUNWARE_MODEL = "runware:101@1";

export class RunwareNotConfiguredError extends Error {
  readonly code = "logo_generation_unconfigured" as const;
  constructor(message = "RUNWARE_API_KEY is not configured") {
    super(message);
    this.name = "RunwareNotConfiguredError";
  }
}

export class RunwareApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunwareApiError";
  }
}

type RunwareInferenceRow = {
  taskType?: string;
  taskUUID?: string;
  imageURL?: string;
  imageDataURI?: string;
  imageBase64Data?: string;
  error?: string;
  message?: string;
};

type RunwareResponseBody = {
  data?: RunwareInferenceRow[];
  errors?: unknown;
};

function runwareBaseUrl(): string {
  const raw = process.env.RUNWARE_API_URL?.trim();
  const base = raw && raw.length > 0 ? raw.replace(/\/$/, "") : DEFAULT_RUNWARE_API_URL;
  return base;
}

function runwareModel(): string {
  const raw = process.env.RUNWARE_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_RUNWARE_MODEL;
}

function inferSteps(model: string, hasBrandColor: boolean): number {
  // Schnell (`runware:100@1`) — fast distilled; 4–6 steps max before quality plateaus.
  if (model.includes("100@")) return hasBrandColor ? 6 : 4;
  // Dev (`runware:101@1`) — full quality model; 20 steps default, 25 with brand color
  // for stronger colour convergence. Pro/Growth users get this by default.
  if (model.includes("101@")) return hasBrandColor ? 25 : 20;
  // Other models (e.g. SDXL, custom LoRA): sensible default.
  return 20;
}

// ── Hex → natural language colour descriptor ──────────────────────────────────
// FLUX was trained on image captions written in English, not CSS.
// It cannot interpret "#E37400" as a colour — it sees a meaningless string.
// We must describe the colour in words it was trained on.
// Strategy: convert hex to HSL, map to the nearest named hue bucket,
// then generate a rich natural-language descriptor with multiple synonyms.

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hexToColorDescription(hex: string): string {
  const { h, s, l } = hexToHsl(hex);

  // Lightness descriptors
  const lightnessWord =
    l > 0.85 ? "very light pale" :
    l > 0.65 ? "light" :
    l > 0.45 ? "vivid" :
    l > 0.25 ? "deep rich" :
    "very dark";

  // Saturation guard — near-grey colours
  if (s < 0.12) {
    if (l > 0.85) return "white, off-white, near-white";
    if (l > 0.6) return "light grey, silver";
    if (l > 0.35) return "medium grey, steel grey";
    return "dark grey, charcoal, near-black";
  }

  // Map hue angle to colour family + synonym cluster
  // NOTE: bucket boundaries are tuned for FLUX's colour vocabulary.
  // Pure blue peaks ~240°; purple/magenta peak ~290-300°.
  // #7B1FA2 (h≈282°) is a saturated magenta-purple — keep it in the purple bucket.
  let hueFamily: string;
  if (h < 15 || h >= 345) hueFamily = "red, crimson, scarlet";
  else if (h < 30)         hueFamily = "orange-red, vermillion, burnt orange";
  else if (h < 50)         hueFamily = "orange, amber, tangerine";
  else if (h < 70)         hueFamily = "yellow-orange, golden yellow, saffron";
  else if (h < 90)         hueFamily = "yellow, bright yellow, lemon";
  else if (h < 140)        hueFamily = "green, emerald, lime green";
  else if (h < 170)        hueFamily = "teal green, sea green, mint";
  else if (h < 200)        hueFamily = "cyan, teal, turquoise";
  else if (h < 230)        hueFamily = "sky blue, azure, cerulean";
  else if (h < 255)        hueFamily = "blue, cobalt blue, royal blue";
  else if (h < 275)        hueFamily = "blue-violet, indigo, violet blue";
  else if (h < 330)        hueFamily = "purple, violet, magenta purple";
  else if (h < 345)        hueFamily = "pink, rose, hot pink";
  else                     hueFamily = "red, crimson, scarlet";

  return `${lightnessWord} ${hueFamily}`;
}

// ── Style-specific visual vocabulary ("Looka tuning") ────────────────────────
// FLUX responds to visual vocabulary, not category names.
// These modifiers are placed early in the prompt (high attention weight) so the
// model internalises the geometry before it resolves the subject.
const STYLE_MODIFIERS: Record<string, string> = {
  Minimalist:    "simple flat geometry, 2-color palette, minimal lines, generous whitespace, clean vector shapes",
  Modern:        "soft depth, vibrant color, smooth rounded corners, professional polish, contemporary graphic design",
  Bold:          "thick outlines, maximum contrast, oversized focal element, eye-catching, graphic impact",
  Playful:       "friendly rounded shapes, bright saturated palette, dynamic energy, approachable cartoon geometry",
  Professional:  "precise geometry, muted tones, structured layout, corporate trustworthy design, refined detail",
  "Flat Design": "pure flat illustration, zero shadows, solid fills, hard edges, icon-system coherence",
};

// ── Dual-concept detector ─────────────────────────────────────────────────────
// Detects patterns like "salt and sugar", "sun & moon", "fire / ice".
// When two distinct visual subjects are present, FLUX needs explicit canvas
// splitting instructions — otherwise it either picks one or blends them badly.
function detectDualConcept(text: string): boolean {
  return /\b(and|&|\+|vs\.?|versus|with|plus|\/)\b/i.test(text.trim());
}

// ── Compositional rules block ─────────────────────────────────────────────────
// Appended to every prompt. Placed before style and subject so FLUX builds the
// geometry scaffold first, then fills it with content.
const COMPOSITIONAL_RULES = [
  "Composition: perfect symmetry or rule-of-thirds balance, subject occupies 80% of canvas with even padding.",
  "Negative space: use smart negative space so the icon reads clearly at 64×64 pixels.",
  "Style constraint: NO photorealism. Prioritise clean vector-style geometry, solid shapes, intentional graphic design.",
  "No text, letters, numbers, logotype, watermarks, UI chrome, device mockups, or screenshots anywhere.",
  "Culturally neutral iconography suitable for global English and Arabic-speaking markets.",
].join(" ");

function buildPositivePrompt(input: {
  appName: string;
  category: string;
  shortDescription?: string;
  style: string;
  variantIndex: number;
  brandColor?: string;
  customPrompt?: string;
}): string {
  const short = input.shortDescription?.trim();
  const variant = input.variantIndex + 1;

  // ── Style vocabulary ──────────────────────────────────────────────────────
  // Use the rich visual descriptor if available; fall back to the raw style name.
  const styleVocab = STYLE_MODIFIERS[input.style] ?? input.style;

  // ── Custom concept + dual-concept handling ────────────────────────────────
  const rawConcept = input.customPrompt?.trim() ?? "";
  const isDual = rawConcept.length > 0 && detectDualConcept(rawConcept);

  // Dual-concept structural injection — placed BEFORE the concept line so FLUX
  // knows the canvas structure before it tries to resolve the two subjects.
  const dualStructure = isDual
    ? "Composition: split the canvas into two distinct visual areas, one per concept. Unity: single unified background color and consistent palette to bind both concepts into one coherent icon."
    : null;

  const conceptLine = rawConcept
    ? `Visual subject (prioritise this): ${rawConcept}.`
    : null;

  // ── App context block ─────────────────────────────────────────────────────
  const contextLines = [
    `App: "${input.appName}". Category: ${input.category}.`,
    short ? `Positioning: ${short}.` : null,
  ].filter(Boolean).join(" ");

  // ── Variant seed directive ────────────────────────────────────────────────
  const variantLine = `Variant ${variant} of 4: use a clearly distinct focal motif, layout, or perspective from the other three while remaining one coherent product icon.`;

  // ── With brand colour ─────────────────────────────────────────────────────
  if (input.brandColor?.trim()) {
    const colorDesc = hexToColorDescription(input.brandColor.trim());

    return [
      // 1. Style-first opening — highest attention weight on geometry and color
      `A ${colorDesc} mobile app icon. Style: ${styleVocab}.`,
      `The entire icon uses ${colorDesc} as the dominant background and primary accent. The icon must look unmistakably ${colorDesc} at thumbnail size.`,
      "",
      // 2. Compositional rules — scaffold before subject
      COMPOSITIONAL_RULES,
      "",
      // 3. Dual-concept structure (only when needed)
      ...(dualStructure ? [dualStructure, ""] : []),
      // 4. Subject / concept
      ...(conceptLine ? [conceptLine, ""] : []),
      // 5. App context
      contextLines,
      "",
      // 6. Color lock — repeated at end for FLUX attention reinforcement
      variantLine,
      `Color lock: background MUST be ${colorDesc}. Dominant hue is ${colorDesc}. Complementary accent tones only.`,
    ].filter((l) => l !== null).join("\n");
  }

  // ── Without brand colour ──────────────────────────────────────────────────
  return [
    // 1. Style-first opening
    `A mobile app icon in ${styleVocab} style, 1024×1024 square canvas.`,
    "",
    // 2. Compositional rules — scaffold before subject
    COMPOSITIONAL_RULES,
    "",
    // 3. Dual-concept structure (only when needed)
    ...(dualStructure ? [dualStructure, ""] : []),
    // 4. Subject / concept
    ...(conceptLine ? [conceptLine, ""] : []),
    // 5. App context
    contextLines,
    "",
    // 6. Variant direction
    variantLine,
  ].filter((l) => l !== null).join("\n");
}

/**
 * Negative prompt — applied to every request, not just when brand color is set.
 * Without a negative prompt FLUX freely generates photorealism, text artifacts,
 * and muddy palettes. This baseline eliminates the most common failure modes.
 * When a brand color is supplied we also block clashing hues.
 */
function buildNegativePrompt(brandColor?: string): string {
  const base = [
    "photorealistic, photograph, 3D render, CGI, lens flare, depth of field, bokeh,",
    "text, letters, numbers, words, logotype, watermark, signature, UI chrome, device mockup, screenshot,",
    "blurry, noisy, low quality, pixelated, distorted, ugly, deformed, extra limbs,",
    "cluttered composition, busy background, complex texture, gradient noise,",
    "two separate icons, split frame, dual panels, collage layout,",
    "oversaturated, washed out, muddy colors, inconsistent palette",
  ].join(" ");

  if (brandColor?.trim()) {
    const colorDesc = hexToColorDescription(brandColor.trim());
    return `wrong colors, colors that clash with ${colorDesc}, random unrelated colors, ${base}`;
  }

  return base;
}

function extractImageRef(row: RunwareInferenceRow): string | null {
  const url = row.imageURL?.trim();
  if (url) return url;
  const dataUri = row.imageDataURI?.trim();
  if (dataUri) return dataUri;
  const b64 = row.imageBase64Data?.trim();
  if (b64) {
    const looksPng = b64.startsWith("iVBOR");
    const mime = looksPng ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${b64}`;
  }
  return null;
}

/**
 * Calls Runware `imageInference` four times in one request batch.
 * Returns four HTTPS URLs or data URIs (1024×1024 — resize to 512×512 in Play Console if needed).
 */
export async function generateAppLogos(input: {
  appName: string;
  category: string;
  shortDescription?: string;
  style: string;
  brandColor?: string;
  /** Optional custom concept from paid users — appended to the generation prompt. */
  customPrompt?: string;
}): Promise<string[]> {
  const apiKey = process.env.RUNWARE_API_KEY?.trim();
  if (!apiKey) {
    throw new RunwareNotConfiguredError();
  }

  const base = runwareBaseUrl();
  const model = runwareModel();
  const steps = inferSteps(model, !!input.brandColor?.trim());

  // Always apply a negative prompt — baseline blocks photorealism/text artifacts
  // for every generation. Brand color variant additionally blocks clashing hues.
  const negPrompt = buildNegativePrompt(input.brandColor?.trim() ? input.brandColor : undefined);

  const tasks = [0, 1, 2, 3].map((i) => ({
    taskType: "imageInference" as const,
    taskUUID: randomUUID(),
    model,
    positivePrompt: buildPositivePrompt({
      appName: input.appName.trim(),
      category: input.category.trim(),
      shortDescription: input.shortDescription,
      style: input.style.trim(),
      variantIndex: i,
      brandColor: input.brandColor,
      customPrompt: input.customPrompt,
    }),
    negativePrompt: negPrompt,
    width: 1024,
    height: 1024,
    steps,
    outputFormat: "PNG" as const,
    outputType: "URL" as const,
    seed: randomInt(1, 2 ** 31 - 1),
  }));

  // Runware can occasionally drop connections (ECONNRESET / ETIMEDOUT).
  // Retry up to 3 times with exponential back-off before propagating.
  const RUNWARE_TIMEOUT_MS = 55_000; // 55 s — well within Next.js 60 s route limit
  const MAX_ATTEMPTS = 3;

  let res: Response | undefined;
  let lastFetchError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUNWARE_TIMEOUT_MS);
    try {
      res = await fetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(tasks),
        signal: controller.signal,
      });
      clearTimeout(timer);
      break; // success — exit retry loop
    } catch (err) {
      clearTimeout(timer);
      lastFetchError = err;
      const isRetryable =
        err instanceof Error &&
        (err.message.includes("ECONNRESET") ||
          err.message.includes("ETIMEDOUT") ||
          err.message.includes("fetch failed") ||
          err.name === "AbortError");
      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw new RunwareApiError(
          `Runware request failed after ${attempt} attempt(s): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Back-off: 600 ms, 1200 ms before 3rd attempt
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }

  // res is guaranteed to be set here — the loop throws before breaking without assignment
  const response = res as Response;
  const rawText = await response.text();
  let json: RunwareResponseBody;
  try {
    json = (rawText ? JSON.parse(rawText) : {}) as RunwareResponseBody;
  } catch {
    throw new RunwareApiError(
      `Runware returned non-JSON (HTTP ${response.status}): ${rawText.slice(0, 280)}`,
    );
  }

  if (!response.ok) {
    throw new RunwareApiError(
      `Runware HTTP ${response.status}: ${rawText.slice(0, 600)}`,
    );
  }

  const rows = Array.isArray(json.data) ? json.data : [];
  const byUuid = new Map<string, RunwareInferenceRow>();
  for (const row of rows) {
    if (row?.taskUUID) {
      byUuid.set(row.taskUUID, row);
    }
  }

  const images: string[] = [];
  for (const t of tasks) {
    const row = byUuid.get(t.taskUUID);
    if (!row) {
      throw new RunwareApiError("Runware response missing one or more image tasks.");
    }
    if (row.error || row.message) {
      throw new RunwareApiError(
        `Runware task error: ${row.error ?? row.message ?? "unknown"}`,
      );
    }
    const ref = extractImageRef(row);
    if (!ref) {
      throw new RunwareApiError("Runware returned a task without image URL or base64 data.");
    }
    images.push(ref);
  }

  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new RunwareApiError(
      `Runware reported errors: ${JSON.stringify(json.errors).slice(0, 400)}`,
    );
  }
  if (typeof json.errors === "string" && json.errors.trim()) {
    throw new RunwareApiError(json.errors.trim().slice(0, 400));
  }

  return images;
}
