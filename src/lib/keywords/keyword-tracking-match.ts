import { parseKeyword } from "@/components/listing/optimizer/keyword-strategy-panel";

/** All lowercase keys that should count as the same tracked keyword. */
export function keywordTrackingMatchKeys(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const keys = new Set<string>();
  keys.add(trimmed.toLowerCase());
  const { keyword, raw } = parseKeyword(trimmed);
  keys.add(keyword.toLowerCase());
  if (raw !== trimmed) keys.add(raw.trim().toLowerCase());
  return [...keys];
}

export function buildTrackedKeywordKeySet(terms: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const term of terms) {
    for (const key of keywordTrackingMatchKeys(term)) {
      set.add(key);
    }
  }
  return set;
}

export function isKeywordTrackedOnApp(term: string, trackedKeys: Set<string>): boolean {
  return keywordTrackingMatchKeys(term).some((key) => trackedKeys.has(key));
}
