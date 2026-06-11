const GENERIC_PACKAGE_SEGMENTS = new Set([
  "com",
  "org",
  "net",
  "io",
  "app",
  "android",
  "ios",
  "mobile",
  "phone",
  "free",
  "pro",
  "lite",
]);

/** Strip Play Store SERP boilerplate from competitor listing titles. */
export function normalizeCompetitorDisplayName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let t = raw.trim();
  if (!t) return null;
  t = t.replace(/\s*[-–—|]\s*Apps on Google Play\s*$/i, "").trim();
  t = t.replace(/\s*on Google Play\s*$/i, "").trim();
  return t.length > 0 ? t : null;
}

function titleLeadFromName(raw: string): string {
  const cleaned = normalizeCompetitorDisplayName(raw) ?? raw.trim();
  if (!cleaned) return "";
  return (cleaned.includes(":") ? cleaned.split(":")[0] : cleaned).trim();
}

/**
 * Derives 1–2 character monogram initials from a competitor display name.
 * Examples: MyFitnessPal → MF, Strava → S, Nike Run Club → NR.
 * Returns null when the name is empty or cannot yield letters.
 */
export function getCompetitorInitials(name: string | null | undefined): string | null {
  const titleLead = titleLeadFromName(String(name ?? ""));
  if (!titleLead) return null;

  const words = titleLead.split(/\s+/).filter((w) => w.length > 0 && !/^com\.[a-z0-9_.]+$/i.test(w));
  if (words.length >= 2) {
    const fromWords = words
      .slice(0, 2)
      .map((w) => {
        const ch = [...w][0];
        return ch && /\p{L}/u.test(ch) ? ch.toUpperCase() : "";
      })
      .join("");
    if (fromWords.length > 0) return fromWords.slice(0, 2);
  }

  const word = words[0] ?? titleLead;
  const caps = [...word].filter((ch) => /[A-Z]/.test(ch));
  if (caps.length >= 2) return caps.slice(0, 2).join("");
  if (caps.length === 1) return caps[0]!;

  const first = [...word][0];
  return first && /\p{L}/u.test(first) ? first.toUpperCase() : null;
}

/** Last-resort initials from package id when no display name exists (never "C" from `com.`). */
export function getCompetitorInitialsFromPackageId(packageId: string): string | null {
  const pkg = String(packageId ?? "").trim().toLowerCase();
  if (!pkg) return null;
  const segments = pkg
    .replace(/^com\./, "")
    .split(".")
    .filter((s) => s.length > 0 && !GENERIC_PACKAGE_SEGMENTS.has(s) && s !== "example");
  const label = segments[segments.length - 1] ?? segments[0];
  if (!label) return null;
  const first = [...label][0];
  return first && /\p{L}/u.test(first) ? first.toUpperCase() : null;
}

/**
 * Resolve initials for UI badges: name → serp title → package segment.
 * Returns null when unknown (caller should show placeholder icon).
 */
export function resolveCompetitorInitials(
  displayName: string | null | undefined,
  packageId: string,
  serpDisplayName?: string | null,
): string | null {
  for (const candidate of [displayName, serpDisplayName]) {
    const initials = getCompetitorInitials(candidate);
    if (initials) return initials;
  }
  return getCompetitorInitialsFromPackageId(packageId);
}
