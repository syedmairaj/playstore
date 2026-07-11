/** Shared keyword strategy parsing (server + client safe). */

export type KeywordCategory = "competitive" | "intent" | "gap" | "general";

export type CategorisedKeyword = {
  raw: string;
  keyword: string;
  category: KeywordCategory;
};

const CATEGORY_ALIASES: Record<string, KeywordCategory> = {
  competitive: "competitive",
  "high-volume": "competitive",
  "high volume": "competitive",
  volume: "competitive",
  intent: "intent",
  "intent-based": "intent",
  "long-tail": "intent",
  longtail: "intent",
  gap: "gap",
  "competitor-gap": "gap",
  "competitor gap": "gap",
  spy: "gap",
};

export function parseKeyword(raw: string): CategorisedKeyword {
  const bracketMatch = raw.match(/^\[([^\]]+)\]\s*(.+)$/);
  const colonMatch = !bracketMatch && raw.match(/^([a-z\s-]+):\s*(.+)$/i);
  const match = bracketMatch ?? colonMatch;

  if (match) {
    const tag = match[1].trim().toLowerCase();
    const keyword = match[2].trim();
    const category = CATEGORY_ALIASES[tag] ?? "general";
    return { raw, keyword, category };
  }
  return { raw, keyword: raw.trim(), category: "general" };
}

export function categoriseKeywords(
  items: string[],
): Record<KeywordCategory, CategorisedKeyword[]> {
  const buckets: Record<KeywordCategory, CategorisedKeyword[]> = {
    competitive: [],
    intent: [],
    gap: [],
    general: [],
  };
  for (const item of items) {
    const parsed = parseKeyword(item);
    buckets[parsed.category].push(parsed);
  }
  return buckets;
}
