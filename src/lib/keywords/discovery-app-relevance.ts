/**
 * Per-app AI Discovery relevance guards (ASO multi-app isolation).
 * Rejects listing-generation keyword packs that belong to another app/vertical.
 */

const HEALTH_MEDICAL_RE =
  /\b(blood pressure|glucose|sodium|diabetes|calorie|nutrition|wellness|symptom|medical|fitness tracker|health data|diet goals|sugar level|salt intake|blood sugar)\b/i;

const SOCIAL_PHOTO_RE =
  /\b(photo|camera|selfie|chat|message|friends|stories|social|snap|pose|share|dm|messenger)\b/i;

export type DiscoveryRelevanceApp = {
  appName: string;
  category?: string | null;
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function categoryBucket(category: string | null | undefined): string {
  const c = category?.trim().toLowerCase() ?? "";
  if (!c) return "unknown";
  if (c.includes("health") || c.includes("fitness") || c.includes("medical")) {
    return "health";
  }
  if (
    c.includes("social") ||
    c.includes("communication") ||
    c.includes("photo") ||
    c.includes("camera")
  ) {
    return "social";
  }
  if (c.includes("productivity")) return "productivity";
  if (c.includes("finance") || c.includes("money")) return "finance";
  return "other";
}

function appIsHealthVertical(app: DiscoveryRelevanceApp): boolean {
  if (categoryBucket(app.category) === "health") return true;
  const joined = tokenize(app.appName).join(" ");
  return /\b(salt|sugar|sodium|glucose|health|fitness|diet|nutrition)\b/.test(
    joined,
  );
}

function appIsSocialVertical(app: DiscoveryRelevanceApp): boolean {
  return categoryBucket(app.category) === "social";
}

/** True when a single keyword is clearly from a different vertical than the selected app. */
export function keywordConflictsWithAppVertical(
  keyword: string,
  app: DiscoveryRelevanceApp,
): boolean {
  const k = norm(keyword);
  if (!k) return false;

  const tokens = tokenize(app.appName);
  if (tokens.some((t) => k.includes(t))) return false;

  if (appIsSocialVertical(app) && !appIsHealthVertical(app)) {
    if (HEALTH_MEDICAL_RE.test(k) && !SOCIAL_PHOTO_RE.test(k)) return true;
  }

  if (appIsHealthVertical(app)) {
    if (SOCIAL_PHOTO_RE.test(k) && !HEALTH_MEDICAL_RE.test(k)) {
      // Allow brand-ish social terms only when they share app tokens (handled above).
      if (/\b(snapchat|instagram|tiktok|facebook)\b/i.test(k)) return true;
    }
  }

  return false;
}

/**
 * Keep only AI listing keywords that fit the selected app.
 * Drops cross-app pollution (e.g. Salt Sugar health terms under a Social "snap" app).
 */
export function filterAiListingKeywordsForApp(
  keywords: string[],
  app: DiscoveryRelevanceApp,
): string[] {
  return keywords.filter((kw) => !keywordConflictsWithAppVertical(kw, app));
}

/**
 * Whether an AI listing keyword pack is trustworthy for the selected app.
 * Rejects packs that are mostly another vertical after filtering.
 */
export function isAiListingPackTrustedForApp(
  keywords: string[],
  app: DiscoveryRelevanceApp,
): boolean {
  if (!keywords.length) return false;
  const kept = filterAiListingKeywordsForApp(keywords, app);
  if (kept.length === 0) return false;
  // If more than half of the pack was foreign-vertical, treat the whole pack as contaminated.
  if (kept.length < keywords.length * 0.5) return false;
  return true;
}

/** Join keyword list for blob / discovery-restore checks. */
export function joinKeywordsForRestoreCheck(keywords: string[]): string {
  return keywords.map((k) => k.trim()).filter(Boolean).join(", ");
}
