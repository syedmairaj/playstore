import { normalizeShortVariationText } from "@/lib/listing/modular-output-validation";
import { clampPlayStoreTitle } from "@/lib/listing/clamp-play-store-title";

export { clampPlayStoreTitle } from "@/lib/listing/clamp-play-store-title";

export const LISTING_TITLE_MAX = 30;
export const LISTING_SHORT_MAX = 80;
export const LISTING_LONG_MAX = 4000;
export const LISTING_TITLE_WARN_FROM = 26;
export const LISTING_SHORT_WARN_FROM = 72;
export const LISTING_LONG_WARN_FROM = Math.floor(
  (LISTING_LONG_MAX * LISTING_SHORT_WARN_FROM) / LISTING_SHORT_MAX,
);

export function coerceListingText(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

/** True when unlock/full output has non-empty Play Console copy fields. */
export function hasListingUnlockCoreCopy(output: {
  title?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
}): boolean {
  return Boolean(
    coerceListingText(output.title).trim() &&
      coerceListingText(output.shortDescription).trim() &&
      coerceListingText(output.fullDescription).trim(),
  );
}

export function clampListingTexts(title: string, short: string, long: string) {
  return {
    title: clampPlayStoreTitle(title),
    shortDescription: normalizeShortVariationText(short),
    fullDescription: long.slice(0, LISTING_LONG_MAX),
  };
}

export function listingCountTone(
  len: number,
  max: number,
  warnFrom: number,
): "ok" | "warn" | "over" {
  if (len > max) return "over";
  if (len >= warnFrom) return "warn";
  return "ok";
}

export function charCountToneClass(tone: "ok" | "warn" | "over"): string {
  if (tone === "over") return "text-red-300/95";
  if (tone === "warn") return "text-amber-200/95";
  return "text-[#86efac]/90";
}
