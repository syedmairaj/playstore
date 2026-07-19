import type { ListingScoreBreakdown } from "@/lib/validation/listing-output";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { parsePersistedListingOutput } from "@/lib/validation/listing-output";
import { listingOutputForPublicationState } from "@/lib/listing/listing-export-unlock";

export type CachedGenerationQueueSnapshotItem = {
  id: string;
  reviewId: string;
  reviewText: string;
  userName: string;
  score: number;
  sentimentTag: string;
  appId: string | null;
  packageName: string | null;
  isUtilized: boolean;
  createdAt: string;
};

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
  /** When false, cache is preview-only and must not restore paid ASO / export unlock. */
  publicationUnlocked?: boolean;
  /**
   * When true, allow restoring a free instant-draft preview after remount/HMR
   * (normally heuristic drafts are skipped so F5 does not re-pollute the canvas).
   */
  allowInstantDraftRestore?: boolean;
  /** Full generation payload (keywords, CTAs, screenshots, A/B, strategy, variants). */
  output?: ListingGenerationOutput;
  /** Queue snapshot for strategy summary pills after refresh. */
  generationQueueSnapshot?: CachedGenerationQueueSnapshotItem[];
};

/** Dispatched after instant-draft succeeds so a remounted Optimizer can re-apply. */
export const OPTIMIZER_INSTANT_DRAFT_READY_EVENT =
  "playstore:optimizer-instant-draft-ready";

export type OptimizerInstantDraftReadyDetail = {
  appId: string;
  output: ListingGenerationOutput;
  generatedAt: string;
  modularDraftLong?: { hook: string; features: string; closing: string };
  modularDraftShort?: {
    variations: Array<{ type: "growth" | "conversion" | "utility"; text: string }>;
  };
};

export function publishOptimizerInstantDraftReady(
  detail: OptimizerInstantDraftReadyDetail,
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(OPTIMIZER_INSTANT_DRAFT_READY_EVENT, { detail }),
    );
  } catch {
    /* ignore */
  }
}

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

function parseGenerationQueueSnapshot(
  value: unknown,
): CachedGenerationQueueSnapshotItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: CachedGenerationQueueSnapshotItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.sentimentTag !== "string") continue;
    items.push({
      id: r.id,
      reviewId: typeof r.reviewId === "string" ? r.reviewId : "",
      reviewText: typeof r.reviewText === "string" ? r.reviewText : "",
      userName: typeof r.userName === "string" ? r.userName : "",
      score: typeof r.score === "number" ? r.score : 0,
      sentimentTag: r.sentimentTag,
      appId: typeof r.appId === "string" ? r.appId : null,
      packageName: typeof r.packageName === "string" ? r.packageName : null,
      isUtilized: r.isUtilized === true,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    });
  }
  return items.length > 0 ? items : undefined;
}

function parseFinalListingCacheRaw(
  parsed: Record<string, unknown>,
): FinalListingCache | null {
  const fullOutput = parsePersistedListingOutput(parsed.output);
  const title =
    typeof parsed.title === "string"
      ? parsed.title.trim()
      : fullOutput?.title?.trim() ?? "";
  const shortDescription =
    typeof parsed.shortDescription === "string"
      ? parsed.shortDescription
      : fullOutput?.shortDescription ?? "";
  const longDescription =
    typeof parsed.longDescription === "string"
      ? parsed.longDescription
      : typeof parsed.fullDescription === "string"
        ? parsed.fullDescription
        : fullOutput?.fullDescription ?? "";
  const generatedAt =
    typeof parsed.generatedAt === "string" && parsed.generatedAt.trim()
      ? parsed.generatedAt.trim()
      : typeof parsed.cachedAt === "string" && parsed.cachedAt.trim()
        ? parsed.cachedAt.trim()
        : typeof parsed.savedAt === "string" && parsed.savedAt.trim()
          ? parsed.savedAt.trim()
          : "";
  if ((!title && !fullOutput?.title?.trim()) || !generatedAt) return null;

  const asoScore =
    typeof parsed.asoScore === "number" && Number.isFinite(parsed.asoScore)
      ? Math.round(parsed.asoScore)
      : null;

  return {
    title: title || fullOutput?.title || "",
    shortDescription,
    longDescription,
    asoScore,
    scoreBreakdown: parseScoreBreakdown(parsed.scoreBreakdown),
    improvementTips: parseStringArray(parsed.improvementTips),
    keywordSuggestions:
      parseStringArray(parsed.keywordSuggestions).length > 0
        ? parseStringArray(parsed.keywordSuggestions)
        : (fullOutput?.keywordSuggestions ?? []),
    ctaSuggestions:
      parseStringArray(parsed.ctaSuggestions).length > 0
        ? parseStringArray(parsed.ctaSuggestions)
        : (fullOutput?.ctaSuggestions ?? []),
    generatedAt,
    generationId:
      typeof parsed.generationId === "string" && parsed.generationId.trim()
        ? parsed.generationId.trim()
        : undefined,
    publicationUnlocked:
      typeof parsed.publicationUnlocked === "boolean"
        ? parsed.publicationUnlocked
        : undefined,
    ...(parsed.allowInstantDraftRestore === true
      ? { allowInstantDraftRestore: true }
      : {}),
    ...(fullOutput ? { output: fullOutput } : {}),
    generationQueueSnapshot: parseGenerationQueueSnapshot(
      parsed.generationQueueSnapshot,
    ),
  };
}

export function finalListingCacheToOutput(
  cache: FinalListingCache,
): ListingGenerationOutput {
  const unlocked = isFinalListingCachePublicationUnlocked(cache);
  if (cache.output) {
    const parsed = parsePersistedListingOutput(cache.output);
    if (parsed) {
      return listingOutputForPublicationState(parsed, unlocked);
    }
  }
  const base: ListingGenerationOutput = {
    title: cache.title,
    shortDescription: cache.shortDescription,
    fullDescription: cache.longDescription,
    keywordSuggestions: cache.keywordSuggestions,
    ctaSuggestions: cache.ctaSuggestions,
  };
  if (!unlocked) return base;
  return {
    ...base,
    ...(typeof cache.asoScore === "number" ? { asoScore: cache.asoScore } : {}),
    ...(cache.scoreBreakdown ? { scoreBreakdown: cache.scoreBreakdown } : {}),
    ...(cache.improvementTips?.length
      ? { improvementTips: cache.improvementTips }
      : {}),
  };
}

/** Preview-only cache must not overwrite a newer paid unlock row in localStorage. */
export function shouldWritePreviewFinalListingCache(
  appId: string,
  publicationUnlocked: boolean,
): boolean {
  if (publicationUnlocked) return true;
  const existing = readFinalListingCache(appId);
  if (!existing) return true;
  return !isFinalListingCachePublicationUnlocked(existing);
}

export function isFinalListingCachePublicationUnlocked(
  cache: FinalListingCache,
): boolean {
  return cache.publicationUnlocked === true;
}

export function readFinalListingCacheSavedAtMs(appId: string): number {
  const cache = readFinalListingCache(appId);
  if (!cache) return 0;
  const ts = Date.parse(cache.generatedAt);
  return Number.isFinite(ts) ? ts : 0;
}

/** True when server hydration output is older than local paid unlock cache. */
export function shouldPreferFinalListingCacheOverHydration(
  appId: string,
  hydrationCreatedAt: string,
): boolean {
  const hydTs = Date.parse(hydrationCreatedAt);
  if (!Number.isFinite(hydTs)) return false;
  const cache = readFinalListingCache(appId);
  if (!cache || !isFinalListingCachePublicationUnlocked(cache)) return false;
  const cacheTs = Date.parse(cache.generatedAt);
  return Number.isFinite(cacheTs) && cacheTs > hydTs;
}

export function listingOutputToFinalListingCache(
  output: ListingGenerationOutput,
  generatedAt: string,
  generationId?: string,
  options?: {
    publicationUnlocked?: boolean;
    allowInstantDraftRestore?: boolean;
    generationQueueSnapshot?: CachedGenerationQueueSnapshotItem[];
  },
): FinalListingCache {
  const publicationUnlocked = options?.publicationUnlocked ?? true;
  return {
    title: output.title || "",
    shortDescription: output.shortDescription || "",
    longDescription: output.fullDescription || "",
    asoScore:
      publicationUnlocked && typeof output.asoScore === "number"
        ? output.asoScore
        : null,
    ...(publicationUnlocked && output.scoreBreakdown
      ? { scoreBreakdown: output.scoreBreakdown }
      : {}),
    ...(publicationUnlocked && output.improvementTips?.length
      ? { improvementTips: output.improvementTips }
      : {}),
    keywordSuggestions: output.keywordSuggestions ?? [],
    ctaSuggestions: output.ctaSuggestions ?? [],
    generatedAt,
    ...(generationId ? { generationId } : {}),
    publicationUnlocked,
    ...(options?.allowInstantDraftRestore ? { allowInstantDraftRestore: true } : {}),
    output,
    ...(options?.generationQueueSnapshot?.length
      ? { generationQueueSnapshot: options.generationQueueSnapshot }
      : {}),
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
