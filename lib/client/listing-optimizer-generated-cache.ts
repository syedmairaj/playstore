import type { ListingScoreBreakdown } from "@/lib/validation/listing-output";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { parsePersistedListingOutput } from "@/lib/validation/listing-output";

export function listingOptimizerGeneratedCacheKey(appId: string): string {
  return `playstore_last_generated_${appId.trim()}`;
}

export type CachedListingGeneration = {
  output: ListingGenerationOutput;
  savedAt: string;
  generationId?: string;
};

export function readCachedListingGeneration(
  appId: string,
): CachedListingGeneration | null {
  if (typeof window === "undefined") return null;
  const id = appId.trim();
  if (!id) return null;
  try {
    const raw = localStorage.getItem(listingOptimizerGeneratedCacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      output?: unknown;
      savedAt?: unknown;
      generationId?: unknown;
    };
    const output = parsePersistedListingOutput(parsed.output);
    const savedAt =
      typeof parsed.savedAt === "string" && parsed.savedAt.trim()
        ? parsed.savedAt.trim()
        : "";
    if (!output || !savedAt) return null;
    return {
      output,
      savedAt,
      generationId:
        typeof parsed.generationId === "string" && parsed.generationId.trim()
          ? parsed.generationId.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

export function writeCachedListingGeneration(
  appId: string,
  payload: CachedListingGeneration,
): void {
  if (typeof window === "undefined") return;
  const id = appId.trim();
  if (!id) return;
  try {
    localStorage.setItem(
      listingOptimizerGeneratedCacheKey(id),
      JSON.stringify(payload),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearCachedListingGeneration(appId: string): void {
  if (typeof window === "undefined") return;
  const id = appId.trim();
  if (!id) return;
  try {
    localStorage.removeItem(listingOptimizerGeneratedCacheKey(id));
  } catch {
    /* */
  }
}

// ── Final listing cache (F5 restore) ─────────────────────────────────────────
// Primary key: playstore_final_listing_{appId}
// Legacy read-once: playstore_last_generated_{appId}, playstore_saved_listing_{appId}

export type FinalListingCache = {
  title: string;
  shortDescription: string;
  longDescription: string;
  asoScore: number | null;
  scoreBreakdown?: ListingScoreBreakdown;
  improvementTips?: string[];
  keywordSuggestions: string[];
  ctaSuggestions: string[];
  generatedAt: string;
  generationId?: string;
};

export function finalListingCacheKey(appId: string): string {
  return `playstore_final_listing_${appId.trim()}`;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function parseScoreBreakdown(value: unknown): ListingScoreBreakdown | undefined {
  if (!value || typeof value !== "object") return undefined;
  const b = value as Record<string, unknown>;
  const title = typeof b.title === "number" ? b.title : NaN;
  const shortDescription =
    typeof b.shortDescription === "number" ? b.shortDescription : NaN;
  const longDescription =
    typeof b.longDescription === "number" ? b.longDescription : NaN;
  const persuasiveness =
    typeof b.persuasiveness === "number" ? b.persuasiveness : NaN;
  if (
    !Number.isFinite(title) ||
    !Number.isFinite(shortDescription) ||
    !Number.isFinite(longDescription) ||
    !Number.isFinite(persuasiveness)
  ) {
    return undefined;
  }
  return { title, shortDescription, longDescription, persuasiveness };
}

function parseFinalListingCacheRaw(
  parsed: Record<string, unknown>,
): FinalListingCache | null {
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const shortDescription =
    typeof parsed.shortDescription === "string"
      ? parsed.shortDescription
      : "";
  const longDescription =
    typeof parsed.longDescription === "string"
      ? parsed.longDescription
      : typeof parsed.fullDescription === "string"
        ? parsed.fullDescription
        : "";
  const generatedAt =
    typeof parsed.generatedAt === "string" && parsed.generatedAt.trim()
      ? parsed.generatedAt.trim()
      : typeof parsed.cachedAt === "string" && parsed.cachedAt.trim()
        ? parsed.cachedAt.trim()
        : typeof parsed.savedAt === "string" && parsed.savedAt.trim()
          ? parsed.savedAt.trim()
          : "";
  if (!title || !generatedAt) return null;

  const asoScore =
    typeof parsed.asoScore === "number" && Number.isFinite(parsed.asoScore)
      ? Math.round(parsed.asoScore)
      : null;

  return {
    title,
    shortDescription,
    longDescription,
    asoScore,
    scoreBreakdown: parseScoreBreakdown(parsed.scoreBreakdown),
    improvementTips: parseStringArray(parsed.improvementTips),
    keywordSuggestions: parseStringArray(parsed.keywordSuggestions),
    ctaSuggestions: parseStringArray(parsed.ctaSuggestions),
    generatedAt,
    generationId:
      typeof parsed.generationId === "string" && parsed.generationId.trim()
        ? parsed.generationId.trim()
        : undefined,
  };
}

export function finalListingCacheToOutput(
  cache: FinalListingCache,
): ListingGenerationOutput {
  return {
    title: cache.title,
    shortDescription: cache.shortDescription,
    fullDescription: cache.longDescription,
    keywordSuggestions: cache.keywordSuggestions,
    ctaSuggestions: cache.ctaSuggestions,
    ...(typeof cache.asoScore === "number" ? { asoScore: cache.asoScore } : {}),
    ...(cache.scoreBreakdown ? { scoreBreakdown: cache.scoreBreakdown } : {}),
    ...(cache.improvementTips?.length
      ? { improvementTips: cache.improvementTips }
      : {}),
  };
}

export function listingOutputToFinalListingCache(
  output: ListingGenerationOutput,
  generatedAt: string,
  generationId?: string,
): FinalListingCache {
  return {
    title: output.title || "",
    shortDescription: output.shortDescription || "",
    longDescription: output.fullDescription || "",
    asoScore: typeof output.asoScore === "number" ? output.asoScore : null,
    ...(output.scoreBreakdown
      ? { scoreBreakdown: output.scoreBreakdown }
      : {}),
    ...(output.improvementTips?.length
      ? { improvementTips: output.improvementTips }
      : {}),
    keywordSuggestions: output.keywordSuggestions ?? [],
    ctaSuggestions: output.ctaSuggestions ?? [],
    generatedAt,
    ...(generationId ? { generationId } : {}),
  };
}

export function writeFinalListingCache(
  appId: string,
  payload: FinalListingCache,
): void {
  if (typeof window === "undefined") return;
  const id = appId.trim();
  if (!id) return;
  try {
    localStorage.setItem(finalListingCacheKey(id), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readFinalListingCache(appId: string): FinalListingCache | null {
  if (typeof window === "undefined") return null;
  const id = appId.trim();
  if (!id) return null;

  try {
    const finalRaw = localStorage.getItem(finalListingCacheKey(id));
    if (finalRaw) {
      const parsed = parseFinalListingCacheRaw(
        JSON.parse(finalRaw) as Record<string, unknown>,
      );
      if (parsed) return parsed;
    }
  } catch {
    /* */
  }

  const legacyGen = readCachedListingGeneration(id);
  if (legacyGen?.output) {
    const migrated = listingOutputToFinalListingCache(
      legacyGen.output,
      legacyGen.savedAt,
      legacyGen.generationId,
    );
    writeFinalListingCache(id, migrated);
    return migrated;
  }

  try {
    const savedRaw = localStorage.getItem(savedListingCacheKey(id));
    if (!savedRaw) return null;
    const parsed = parseFinalListingCacheRaw(
      JSON.parse(savedRaw) as Record<string, unknown>,
    );
    if (!parsed) return null;
    writeFinalListingCache(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function clearFinalListingCache(appId: string): void {
  if (typeof window === "undefined") return;
  const id = appId.trim();
  if (!id) return;
  try {
    localStorage.removeItem(finalListingCacheKey(id));
    localStorage.removeItem(listingOptimizerGeneratedCacheKey(id));
    localStorage.removeItem(savedListingCacheKey(id));
  } catch {
    /* */
  }
}

// ── Legacy saved listing cache (deprecated; read via readFinalListingCache) ─

export function savedListingCacheKey(appId: string): string {
  return `playstore_saved_listing_${appId.trim()}`;
}

export type SavedListingCache = {
  title: string;
  shortDescription: string;
  longDescription: string;
  asoScore: number | null;
  cachedAt: string;
};

export function writeSavedListingCache(
  appId: string,
  payload: SavedListingCache,
): void {
  writeFinalListingCache(appId, {
    title: payload.title,
    shortDescription: payload.shortDescription,
    longDescription: payload.longDescription,
    asoScore: payload.asoScore,
    keywordSuggestions: [],
    ctaSuggestions: [],
    generatedAt: payload.cachedAt,
  });
}

export function readSavedListingCache(
  appId: string,
): SavedListingCache | null {
  const final = readFinalListingCache(appId);
  if (!final) return null;
  return {
    title: final.title,
    shortDescription: final.shortDescription,
    longDescription: final.longDescription,
    asoScore: final.asoScore,
    cachedAt: final.generatedAt,
  };
}

export function clearSavedListingCache(appId: string): void {
  clearFinalListingCache(appId);
}
