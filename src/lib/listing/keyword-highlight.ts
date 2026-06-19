/** Escape special regex characters in a literal keyword phrase. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Locked / seed keywords for highlight matching — longest phrases first. */
export function normalizeHighlightKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out.sort((a, b) => b.length - a.length);
}

export type KeywordHighlightSegment = {
  text: string;
  highlighted: boolean;
};

/**
 * Split text into segments for keyword overlay rendering.
 * Case-insensitive; prefers longer keyword phrases.
 */
export function segmentTextByKeywords(
  text: string,
  keywords: string[],
): KeywordHighlightSegment[] {
  if (!text || keywords.length === 0) {
    return [{ text, highlighted: false }];
  }

  const terms = normalizeHighlightKeywords(keywords);
  const pattern = terms.map((term) => escapeRegex(term)).join("|");
  if (!pattern) return [{ text, highlighted: false }];

  const regex = new RegExp(`(${pattern})`, "gi");
  const segments: KeywordHighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        highlighted: false,
      });
    }
    segments.push({ text: match[0], highlighted: true });
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return segments.length > 0 ? segments : [{ text, highlighted: false }];
}

export function primaryKeywordMissingFromOpening(
  longText: string,
  lockedKeywords: string[],
): boolean {
  const primary = normalizeHighlightKeywords(lockedKeywords)[0];
  if (!primary || !longText.trim()) return false;
  const opening = (longText.split(/\n\n/)[0] ?? longText).slice(0, 400);
  return !opening.toLowerCase().includes(primary.toLowerCase());
}
