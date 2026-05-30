import "server-only";
import { shouldLogGeminiDebug } from "@/lib/gemini/log-gemini-env";

export const LISTING_GEN_TITLE_MAX = 30;
export const LISTING_GEN_SHORT_MAX = 80;
export const LISTING_GEN_LONG_MAX = 4000;
// ctaSuggestions[0] is the "WHY THIS RANKS:" rationale (v6 prompt) — allow
// up to 500 chars to match the Zod schema cap.
export const LISTING_GEN_CTA_ITEM_MAX = 500;
// v8 field caps — match Zod schema limits exactly.
export const LISTING_GEN_WHATS_NEW_MAX = 500;
export const LISTING_GEN_SCREENSHOT_CAPTION_MAX = 80;
export const LISTING_GEN_AB_TITLE_MAX = 30;
export const LISTING_GEN_AB_HYPOTHESIS_MAX = 300;

// Safety buffer: shortDescription prompt instructs Gemini to aim for 70 chars,
// but model can miscalculate (token != char). This hard floor ensures that when
// no sentence/comma break is found we still output a clean result at ≤75 chars.
export const LISTING_GEN_SHORT_SAFE_FLOOR = 75;

const ELLIPSIS = "\u2026";

// ── Break-point search ────────────────────────────────────────────────────────
// Priority: sentence end → comma → word boundary → hard floor
// Returns the index (exclusive) of the best break point within `window`,
// or -1 if no acceptable break was found above `minBreak`.
function findBestBreak(window: string, minBreak: number): number {
  // 1. Last sentence terminator followed by whitespace or end-of-string
  for (let i = window.length - 1; i >= 0; i--) {
    const ch = window[i];
    const next = window[i + 1];
    if (
      (ch === "." || ch === "!" || ch === "?") &&
      (next === " " || next === "\n" || next === undefined)
    ) {
      if (i + 1 >= minBreak) return i + 1;
      break; // gone past minBreak walking backwards — stop
    }
  }

  // 2. Last comma (e.g. AI omitted terminal punctuation but stopped mid-clause)
  const lastComma = window.lastIndexOf(",");
  if (lastComma >= minBreak) return lastComma + 1; // include the comma

  // 3. Last word boundary (space)
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace >= minBreak) return lastSpace; // exclude the space itself

  return -1; // no acceptable break found
}

/**
 * Sentence-boundary clamp for medium-length prose fields (e.g. whatsNew ≤500 chars).
 * Priority: sentence end → comma → word boundary → ellipsis hard-trim.
 * Prevents mid-sentence truncation like "...improved, timely".
 */
function clampProse(raw: string, max: number): string {
  const trimmed = raw.trim();
  if (trimmed.length <= max) return trimmed;

  const window = trimmed.slice(0, max);
  const minBreak = Math.floor(max * 0.5);
  const breakAt = findBestBreak(window, minBreak);

  if (breakAt > 0) {
    return trimmed.slice(0, breakAt).trimEnd();
  }

  return `${trimmed.slice(0, max - 1)}${ELLIPSIS}`;
}

/**
 * Trims, then enforces max length for title/shortDescription fields.
 * Priority order for break point (via findBestBreak):
 *   1. Last sentence boundary (`. `, `! `, `? `)
 *   2. Last comma (handles AI output with no terminal punctuation)
 *   3. Last word boundary (space)
 *   4. Hard safe floor (LISTING_GEN_SHORT_SAFE_FLOOR for shortDescription) + ellipsis
 *
 * Returns clamped flag so callers can surface a UI hint when trimming occurred.
 */
function clampTitleOrShort(
  raw: string,
  max: number,
  safeFloor?: number,
): {
  text: string;
  clamped: boolean;
  originalLen: number;
} {
  const trimmed = raw.trim();
  const originalLen = trimmed.length;
  if (originalLen <= max) {
    return { text: trimmed, clamped: false, originalLen };
  }

  const window = trimmed.slice(0, max);
  const minBreak = Math.floor(max * 0.45);
  const breakAt = findBestBreak(window, minBreak);

  if (breakAt > 0) {
    const out = trimmed.slice(0, breakAt).trimEnd();
    if (out.length <= max) {
      return { text: out, clamped: true, originalLen };
    }
  }

  // Hard floor: use safeFloor if provided (shortDescription uses 75),
  // otherwise fall back to max - 1 + ellipsis.
  const floor = safeFloor ?? max - 1;
  const hardOut = `${trimmed.slice(0, floor)}${ELLIPSIS}`;
  return {
    text: hardOut.length <= max ? hardOut : trimmed.slice(0, max),
    clamped: true,
    originalLen,
  };
}

function clampLong(raw: string): {
  text: string;
  clamped: boolean;
  originalLen: number;
} {
  const trimmed = raw.trim();
  const originalLen = trimmed.length;
  if (originalLen <= LISTING_GEN_LONG_MAX) {
    return { text: trimmed, clamped: false, originalLen };
  }
  return {
    text: trimmed.slice(0, LISTING_GEN_LONG_MAX),
    clamped: true,
    originalLen,
  };
}

export type ClampListingResult = {
  value: unknown;
  /** True when shortDescription was trimmed by the clamp layer. Used to surface a UI hint. */
  shortDescriptionClamped: boolean;
};

/**
 * Mutates a shallow copy of the parsed model object: clamps `title`,
 * `shortDescription`, and `fullDescription` before Zod validation.
 * Logs when any field was clamped (dev / `DEBUG_GEMINI_ENV=1` only).
 * Returns ClampListingResult so callers can propagate the shortDescriptionClamped flag.
 */
export function clampListingGenerationParsed(parsed: unknown): ClampListingResult {
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return { value: parsed, shortDescriptionClamped: false };
  }

  const o = { ...(parsed as Record<string, unknown>) };
  let titleClamped = false;
  let shortClamped = false;
  let longClamped = false;
  let titleOrigLen: number | undefined;
  let shortOrigLen: number | undefined;
  let longOrigLen: number | undefined;

  if (typeof o.title === "string") {
    const r = clampTitleOrShort(o.title, LISTING_GEN_TITLE_MAX);
    o.title = r.text;
    titleClamped = r.clamped;
    titleOrigLen = r.originalLen;
  }
  if (typeof o.shortDescription === "string") {
    // Pass safeFloor so hard-trim always lands at ≤75 chars (never ≥76 with ellipsis)
    const r = clampTitleOrShort(
      o.shortDescription,
      LISTING_GEN_SHORT_MAX,
      LISTING_GEN_SHORT_SAFE_FLOOR,
    );
    o.shortDescription = r.text;
    shortClamped = r.clamped;
    shortOrigLen = r.originalLen;
  }
  if (typeof o.fullDescription === "string") {
    const r = clampLong(o.fullDescription);
    o.fullDescription = r.text;
    longClamped = r.clamped;
    longOrigLen = r.originalLen;
  }
  // Clamp individual ctaSuggestions items — ctaSuggestions[0] is the
  // "WHY THIS RANKS:" rationale which can exceed the old 200-char limit.
  if (Array.isArray(o.ctaSuggestions)) {
    o.ctaSuggestions = (o.ctaSuggestions as unknown[]).map((item) =>
      typeof item === "string" && item.length > LISTING_GEN_CTA_ITEM_MAX
        ? item.slice(0, LISTING_GEN_CTA_ITEM_MAX)
        : item,
    );
  }

  // ── v8 field clamps ─────────────────────────────────────────────────────
  if (typeof o.whatsNew === "string" && o.whatsNew.length > LISTING_GEN_WHATS_NEW_MAX) {
    // Sentence-boundary clamp — prevents mid-sentence truncation (e.g. "...improved, timely")
    o.whatsNew = clampProse(o.whatsNew, LISTING_GEN_WHATS_NEW_MAX);
  }
  if (Array.isArray(o.screenshotCaptions)) {
    // Use word-boundary clamp — prevents mid-word truncation on caption headlines
    o.screenshotCaptions = (o.screenshotCaptions as unknown[]).map((item) =>
      typeof item === "string" && item.length > LISTING_GEN_SCREENSHOT_CAPTION_MAX
        ? clampTitleOrShort(item, LISTING_GEN_SCREENSHOT_CAPTION_MAX).text
        : item,
    );
  }
  if (
    o.abTestVariant !== null &&
    typeof o.abTestVariant === "object" &&
    !Array.isArray(o.abTestVariant)
  ) {
    const ab = o.abTestVariant as Record<string, unknown>;
    if (typeof ab.titleB === "string" && ab.titleB.length > LISTING_GEN_AB_TITLE_MAX) {
      // Use word-boundary clamp — same as title — to prevent mid-word truncation
      // e.g. "Salt Sugar: Track Diet & Resul" → "Salt Sugar: Track Diet & Results"
      ab.titleB = clampTitleOrShort(ab.titleB, LISTING_GEN_AB_TITLE_MAX).text;
    }
    if (typeof ab.hypothesis === "string" && ab.hypothesis.length > LISTING_GEN_AB_HYPOTHESIS_MAX) {
      // Use sentence-boundary clamp for prose field
      ab.hypothesis = clampProse(ab.hypothesis, LISTING_GEN_AB_HYPOTHESIS_MAX);
    }
  }

  if (
    shouldLogGeminiDebug() &&
    (titleClamped || shortClamped || longClamped)
  ) {
    console.log("[listing-generate] clamped model string fields:", {
      titleClamped,
      shortClamped,
      longClamped,
      titleOriginalLen: titleOrigLen,
      shortOriginalLen: shortOrigLen,
      longOriginalLen: longOrigLen,
      titleLen: typeof o.title === "string" ? o.title.length : undefined,
      shortLen:
        typeof o.shortDescription === "string"
          ? o.shortDescription.length
          : undefined,
      longLen:
        typeof o.fullDescription === "string"
          ? o.fullDescription.length
          : undefined,
    });
  }

  return { value: o, shortDescriptionClamped: shortClamped };
}
