export const LISTING_TITLE_MAX = 30;
export const LISTING_SHORT_MAX = 80;
export const LISTING_LONG_MAX = 4000;
export const LISTING_TITLE_WARN_FROM = 26;
export const LISTING_SHORT_WARN_FROM = 72;
export const LISTING_LONG_WARN_FROM = Math.floor(
  (LISTING_LONG_MAX * LISTING_SHORT_WARN_FROM) / LISTING_SHORT_MAX,
);

export function clampListingTexts(title: string, short: string, long: string) {
  return {
    title: title.slice(0, LISTING_TITLE_MAX),
    shortDescription: short.slice(0, LISTING_SHORT_MAX),
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
