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
