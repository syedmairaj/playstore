import { INSTANT_DRAFT_PROMPT_VERSION } from "@/lib/listing/listing-export-unlock";
import type { FinalListingCache } from "@/lib/client/listing-optimizer-generated-cache";

/** True when saved listing_generations / session app_name matches the workspace app row. */
export function discoveryContextMatchesWorkspaceApp(
  savedAppName: string | undefined | null,
  workspaceAppDisplayName: string | undefined | null,
): boolean {
  const hydName = savedAppName?.trim().toLowerCase() ?? "";
  const rowName = workspaceAppDisplayName?.trim().toLowerCase() ?? "";
  if (!hydName || !rowName) return true;
  return hydName === rowName;
}

export type DiscoveryRestoreInput = {
  savedAppName?: string | null;
  savedCategory?: string | null;
  keywordsText?: string | null;
  appFeatures?: string | null;
  promptVersion?: string | null;
  publicationUnlocked?: boolean;
  workspaceAppDisplayName: string;
  workspaceAppCategory: string;
};

/** AI-generated keyword tags saved by instant-draft / full generation — not user discovery input. */
export function looksLikeGeneratedKeywordBlob(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /\[(competitive|intent|gap)\]/i.test(t);
}

/**
 * Whether Market Discovery inputs (keywords, features) should hydrate from DB/session.
 * Blocks auto instant-draft pollution and cross-app contaminated rows that share app_name.
 */
export function shouldRestoreDiscoveryInputs(input: DiscoveryRestoreInput): boolean {
  if (
    !discoveryContextMatchesWorkspaceApp(
      input.savedAppName,
      input.workspaceAppDisplayName,
    )
  ) {
    return false;
  }

  const prompt = input.promptVersion?.trim() ?? "";
  if (prompt === INSTANT_DRAFT_PROMPT_VERSION) {
    return false;
  }

  if (looksLikeGeneratedKeywordBlob(input.keywordsText)) {
    return false;
  }

  const savedCat = input.savedCategory?.trim().toLowerCase() ?? "";
  const appCat = input.workspaceAppCategory.trim().toLowerCase();
  if (savedCat && appCat && savedCat !== appCat) {
    return false;
  }

  return true;
}

/** User-configured Market Discovery — required before preview listing copy may restore (ASO). */
export function hasConfiguredDiscoveryInputs(
  keywordsText?: string | null,
  appFeatures?: string | null,
): boolean {
  return Boolean(keywordsText?.trim() || appFeatures?.trim());
}

/** Detect free instant-draft heuristic templates (not user-paid ASO output). */
export function looksLikeInstantDraftHeuristicListing(
  output: {
    title?: string | null;
    shortDescription?: string | null;
    fullDescription?: string | null;
  },
  appName: string,
  category: string,
): boolean {
  const short = output.shortDescription?.trim() ?? "";
  const long = output.fullDescription?.trim() ?? "";
  const title = output.title?.trim() ?? "";
  if (/essentials in one app\s*[—-]\s*practical everyday use/i.test(short)) {
    return true;
  }
  if (/helps you get more from/i.test(long)) {
    return true;
  }
  const app = appName.trim().toLowerCase();
  const cat = category.trim().toLowerCase();
  if (app && new RegExp(`^${escapeRegExp(app)}:\\s+`, "i").test(title)) {
    if (cat === "social" && /\b(blood pressure|glucose|sodium|sugar|salt|diabetes|calorie|nutrition|fitness|health)\b/i.test(title)) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Listing output preview should not restore from auto instant-draft rows on refresh. */
export function shouldRestoreListingOutputFromHydration(
  input: DiscoveryRestoreInput,
): boolean {
  if (
    !discoveryContextMatchesWorkspaceApp(
      input.savedAppName,
      input.workspaceAppDisplayName,
    )
  ) {
    return false;
  }

  const prompt = input.promptVersion?.trim() ?? "";
  if (prompt === INSTANT_DRAFT_PROMPT_VERSION && !input.publicationUnlocked) {
    return false;
  }

  if (input.publicationUnlocked) {
    return true;
  }

  if (!shouldRestoreDiscoveryInputs(input)) {
    return false;
  }

  if (!hasConfiguredDiscoveryInputs(input.keywordsText, input.appFeatures)) {
    return false;
  }

  return true;
}

/**
 * Whether a browser final-listing cache row may hydrate the preview pane.
 * Paid unlock always restores; preview-only requires valid per-app discovery.
 */
export function shouldRestoreFinalListingCache(input: {
  cache: FinalListingCache;
  keywordsText?: string | null;
  appFeatures?: string | null;
  workspaceAppDisplayName: string;
  workspaceAppCategory: string;
}): boolean {
  if (isFinalListingCachePublicationUnlocked(input.cache)) {
    return true;
  }

  if (
    !hasConfiguredDiscoveryInputs(input.keywordsText, input.appFeatures)
  ) {
    return false;
  }

  const output = input.cache.output ?? {
    title: input.cache.title,
    shortDescription: input.cache.shortDescription,
    fullDescription: input.cache.longDescription,
  };

  if (
    looksLikeInstantDraftHeuristicListing(
      output,
      input.workspaceAppDisplayName,
      input.workspaceAppCategory,
    )
  ) {
    // Explicit fresh instant-draft restore (remount/HMR after Build listing draft).
    if (
      input.cache.allowInstantDraftRestore === true &&
      hasConfiguredDiscoveryInputs(input.keywordsText, input.appFeatures)
    ) {
      const ageMs = Date.now() - Date.parse(input.cache.generatedAt);
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 15 * 60 * 1000) {
        return true;
      }
    }
    return false;
  }

  return true;
}

function isFinalListingCachePublicationUnlocked(cache: FinalListingCache): boolean {
  return cache.publicationUnlocked === true;
}

/** Purge preview listing artifacts that have no valid Market Discovery backing. */
export function shouldPurgeOrphanedListingPreview(input: {
  keywordsText?: string | null;
  appFeatures?: string | null;
  publicationUnlocked?: boolean;
  title?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
}): boolean {
  if (input.publicationUnlocked) return false;
  if (hasConfiguredDiscoveryInputs(input.keywordsText, input.appFeatures)) {
    return false;
  }
  return Boolean(
    input.title?.trim() ||
      input.shortDescription?.trim() ||
      input.fullDescription?.trim(),
  );
}
