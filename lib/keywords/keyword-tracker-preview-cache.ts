import type { SerperPreviewCountry } from "@/lib/keywords/serper-preview-types";
import type { SupportedCountryCode } from "@/lib/countries";
import { isSupportedCountry } from "@/lib/countries";
import {
  keywordTrackerPreviewDraftSchema,
  type KeywordTrackerPreviewDraft,
} from "@/lib/validation/keyword-tracker-preview-draft";

/** sessionStorage namespace; value is keyed per workspace: `${BASE}:${workspaceId}`. */
export const KEYWORD_TRACKER_PREVIEW_SESSION_PREFIX = "keywordTracker.preview.v1";

export function keywordTrackerPreviewSessionKey(workspaceId: string): string {
  return `${KEYWORD_TRACKER_PREVIEW_SESSION_PREFIX}:${workspaceId}`;
}

export function sanitizeDraftCountries(
  codes: string[],
): SupportedCountryCode[] {
  const out: SupportedCountryCode[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    const cc = String(c ?? "").trim().toLowerCase();
    if (!isSupportedCountry(cc) || seen.has(cc)) continue;
    seen.add(cc);
    out.push(cc);
  }
  return out;
}

export function parseKeywordTrackerPreviewDraft(raw: unknown): KeywordTrackerPreviewDraft | null {
  const r = keywordTrackerPreviewDraftSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function buildKeywordTrackerPreviewDraft(params: {
  term: string;
  selectedCountries: SupportedCountryCode[];
  results: SerperPreviewCountry[];
}): KeywordTrackerPreviewDraft {
  return {
    v: 1,
    term: params.term.trim(),
    selectedCountries: sanitizeDraftCountries(params.selectedCountries),
    results: params.results,
    updatedAt: new Date().toISOString(),
  };
}

export function readKeywordTrackerPreviewFromSession(
  workspaceId: string,
): KeywordTrackerPreviewDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(keywordTrackerPreviewSessionKey(workspaceId));
    if (!raw) return null;
    return parseKeywordTrackerPreviewDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeKeywordTrackerPreviewToSession(
  workspaceId: string,
  draft: KeywordTrackerPreviewDraft,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      keywordTrackerPreviewSessionKey(workspaceId),
      JSON.stringify(draft),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearKeywordTrackerPreviewSession(workspaceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(keywordTrackerPreviewSessionKey(workspaceId));
  } catch {
    /* ignore */
  }
}
