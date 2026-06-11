/** Typical Android applicationId / Play package name (at least two segments). */
const PLAY_STORE_PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/** Legacy Competitor Spy mock ids (`com.example.*`) — not real Play listings. */
export function isPlaceholderPlayStorePackageId(id: string | null | undefined): boolean {
  const s = typeof id === "string" ? id.trim().toLowerCase() : "";
  return s.startsWith("com.example.");
}

/** True when `id` is non-empty and looks like a real Play package id (not a placeholder fragment). */
export function isValidPlayStorePackageId(id: string | null | undefined): boolean {
  const s = typeof id === "string" ? id.trim() : "";
  if (!s) return false;
  if (isPlaceholderPlayStorePackageId(s)) return false;
  return PLAY_STORE_PACKAGE_RE.test(s);
}

/** Canonical Play Store app details URL for a package id. */
export function playStoreAppDetailsUrl(packageId: string): string {
  const id = packageId.trim();
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}`;
}

/**
 * Parse Android package id from a Google Play app details URL.
 * Shared by Serper ingestion and client-side rank resolution (no `server-only`).
 */
export function extractPackageIdFromPlayStoreDetailsUrl(
  link: string | null | undefined,
): string | null {
  if (!link || typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)play\.google\.com$/i.test(url.hostname)) return null;
    if (!/\/store\/apps/i.test(url.pathname)) return null;
    const rawId = url.searchParams.get("id");
    if (!rawId || !rawId.trim()) return null;
    try {
      return decodeURIComponent(rawId.trim());
    } catch {
      return rawId.trim();
    }
  } catch {
    return null;
  }
}
