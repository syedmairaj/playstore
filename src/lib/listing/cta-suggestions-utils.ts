/** First `ctaSuggestions` item is a visibility rationale, not an install CTA. */
const WHY_THIS_RANKS_RE = /^WHY THIS RANKS:/i;

export function extractVisibilityRationale(
  ctaSuggestions: string[] | null | undefined,
): string | null {
  const first = ctaSuggestions?.[0]?.trim() ?? "";
  if (!first || !WHY_THIS_RANKS_RE.test(first)) return null;
  return first.replace(WHY_THIS_RANKS_RE, "").trim() || null;
}

/** Install CTAs only — excludes the visibility rationale row. */
export function installCtaSuggestionsOnly(
  ctaSuggestions: string[] | null | undefined,
): string[] {
  if (!ctaSuggestions?.length) return [];
  return ctaSuggestions.filter(
    (cta, idx) => !(idx === 0 && WHY_THIS_RANKS_RE.test(cta.trim())),
  );
}

export function formatInstallCtasForCopy(
  ctaSuggestions: string[] | null | undefined,
): string {
  return installCtaSuggestionsOnly(ctaSuggestions).join("\n");
}
