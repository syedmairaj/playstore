import {
  effectiveSerperPreviewItemPackage,
  normPkgForSerperSnapshot,
  type SerperCountryResultForSnapshot,
} from "@/lib/keywords/serper-snapshot-rank-resolve";

export type SerpCompetitorEntry = {
  rank: number;
  title: string;
  package_name: string;
  icon_url?: string | null;
};

/** Max competitors persisted in DB / vault (UI displays up to 5). */
export const SERP_COMPETITORS_STORE_LIMIT = 10;

type SerpCompetitorItem = {
  packageId: string | null;
  link?: string;
  position: number | string;
  title?: string;
  icon_url?: string | null;
};

function itemPosition(item: { position: number | string }): number | null {
  const p = item.position;
  if (typeof p === "number" && Number.isFinite(p)) return p;
  if (typeof p === "string") {
    const n = Number.parseInt(p.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function packageExcluded(want: string, pkg: string): boolean {
  if (pkg === want) return true;
  if (pkg.startsWith(`${want}.`) || want.startsWith(`${pkg}.`)) return true;
  return false;
}

/**
 * Top organic Play apps from one Serper country block, sorted by SERP position.
 * Excludes the tracked app package and dedupes by package id.
 */
export function extractSerpCompetitorsFromCountryBlock(
  items: readonly SerpCompetitorItem[],
  options?: { excludePackage?: string | null; limit?: number },
): SerpCompetitorEntry[] {
  const limit = options?.limit ?? 5;
  const excludeNorm = options?.excludePackage
    ? normPkgForSerperSnapshot(options.excludePackage)
    : null;

  const candidates: SerpCompetitorEntry[] = [];
  const seenPkg = new Set<string>();

  for (const item of items) {
    const pkg = effectiveSerperPreviewItemPackage(item);
    if (!pkg) continue;
    if (excludeNorm && packageExcluded(excludeNorm, pkg)) continue;
    if (seenPkg.has(pkg)) continue;
    seenPkg.add(pkg);

    const pos = itemPosition(item);
    if (pos == null || pos < 1) continue;

    candidates.push({
      rank: pos,
      title: String(item.title ?? pkg).trim() || pkg,
      package_name: pkg,
      icon_url:
        item.icon_url?.trim() ||
        `https://icon.horse/icon/${encodeURIComponent(pkg)}`,
    });
  }

  candidates.sort((a, b) => a.rank - b.rank);
  return candidates.slice(0, limit);
}

/** Resolves one country's SERP competitors from a multi-country Serper result array. */
export function extractSerpCompetitorsForCountry(
  results: readonly SerperCountryResultForSnapshot[],
  country: string,
  excludePackage?: string | null,
  limit = 5,
): SerpCompetitorEntry[] {
  const cc = String(country ?? "").trim().toLowerCase();
  const block = results.find((b) => String(b.country ?? "").trim().toLowerCase() === cc);
  if (!block || block.error) return [];
  return extractSerpCompetitorsFromCountryBlock(block.items, {
    excludePackage,
    limit,
  });
}
