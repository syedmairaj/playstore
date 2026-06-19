import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import { assembleModularFullDescription } from "@/lib/listing/assemble-modular-listing";
import { shortVariationText } from "@/lib/listing/modular-short-variations";

const GENERIC_PHRASES = [
  "discover more",
  "learn more",
  "download now",
  "get started today",
  "best app",
];

export type ModularAsoStrengthBreakdown = {
  title: number;
  short: number;
  long: number;
};

export type ModularAsoStrengthResult = {
  score: number;
  breakdown: ModularAsoStrengthBreakdown;
};

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => {
    const k = kw.trim().toLowerCase();
    return k.length > 2 && lower.includes(k);
  });
}

function isGenericCopy(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return GENERIC_PHRASES.some((p) => lower.includes(p)) && lower.length < 40;
}

function scoreTitle(title: string, keywords: string[]): number {
  const t = title.trim();
  if (!t) return 0;
  let score = 8;
  if (t.length >= 10 && t.length <= 30) score += 10;
  else if (t.length > 0) score += 4;
  if (containsKeyword(t, keywords)) score += 12;
  if (!isGenericCopy(t)) score += 0;
  return Math.min(30, score);
}

function scoreShort(short: string, keywords: string[]): number {
  const s = short.trim();
  if (!s) return 0;
  let score = 6;
  if (s.length >= 40 && s.length <= 80) score += 8;
  else if (s.length > 0) score += 3;
  if (containsKeyword(s, keywords)) score += 4;
  if (!isGenericCopy(s)) score += 2;
  return Math.min(20, score);
}

function scoreLong(long: string, keywords: string[]): number {
  const l = long.trim();
  if (!l) return 0;
  let score = 10;
  if (l.length >= 400) score += 15;
  else if (l.length >= 150) score += 8;
  else if (l.length > 0) score += 3;
  if (l.includes("\n") || l.includes("•") || l.includes("📅") || l.includes("- ")) {
    score += 10;
  }
  if (containsKeyword(l, keywords)) score += 10;
  if (!isGenericCopy(l.slice(0, 120))) score += 5;
  return Math.min(50, score);
}

export function computeModularAsoStrengthScore(
  state: ModularListingState,
  keywords: string[] = [],
): ModularAsoStrengthResult {
  const title = state.title.value;
  const shortItem = state.shortDescription.variations[state.shortDescription.selectedIndex];
  const short = shortItem ? shortVariationText(shortItem) : "";
  const long = assembleModularFullDescription(state.longDescription);

  const breakdown = {
    title: scoreTitle(title, keywords),
    short: scoreShort(short, keywords),
    long: scoreLong(long, keywords),
  };

  const score = Math.min(
    100,
    Math.max(0, breakdown.title + breakdown.short + breakdown.long),
  );

  return { score, breakdown };
}
