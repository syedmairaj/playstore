import "server-only";
import { shouldLogGeminiDebug } from "@/lib/gemini/log-gemini-env";

export const LISTING_GEN_TITLE_MAX = 30;
export const LISTING_GEN_SHORT_MAX = 80;
export const LISTING_GEN_LONG_MAX = 4000;

const ELLIPSIS = "\u2026";

/**
 * Trims, then enforces max length. For title/short: prefers breaking at the last
 * space in the first `max` characters when that space is not too early; otherwise
 * trims to `max - 1` + ellipsis (single Unicode character) so total length ≤ max.
 */
function clampTitleOrShort(raw: string, max: number): {
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
  const lastSpace = window.lastIndexOf(" ");
  const minBreak = Math.floor(max * 0.45);
  let out =
    lastSpace >= minBreak
      ? trimmed.slice(0, lastSpace).trimEnd()
      : `${trimmed.slice(0, max - 1)}${ELLIPSIS}`;

  if (out.length === 0) {
    out = `${trimmed.slice(0, max - 1)}${ELLIPSIS}`;
  }
  if (out.length > max) {
    out = `${trimmed.slice(0, max - 1)}${ELLIPSIS}`;
  }
  if (out.length > max) {
    out = trimmed.slice(0, max);
  }

  return { text: out, clamped: true, originalLen };
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

/**
 * Mutates a shallow copy of the parsed model object: clamps `title`,
 * `shortDescription`, and `fullDescription` before Zod validation.
 * Logs when any field was clamped (dev / `DEBUG_GEMINI_ENV=1` only).
 */
export function clampListingGenerationParsed(parsed: unknown): unknown {
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return parsed;
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
    const r = clampTitleOrShort(o.shortDescription, LISTING_GEN_SHORT_MAX);
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

  return o;
}
