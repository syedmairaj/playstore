import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { extractPackageIdFromPlayStoreDetailsUrl } from "@/lib/keywords/play-store-details-url";

/** Subset of the Serper preview JSON used to compute a stored rank. */
export type SerperCountryResultForSnapshot = {
  country: string;
  error: string | null;
  items: readonly {
    packageId: string | null;
    position: number | string;
    link?: string;
  }[];
};

export function normPkgForSerperSnapshot(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  let t = id.trim();
  if (!t) return null;
  try {
    t = decodeURIComponent(t);
  } catch {
    /* keep raw */
  }
  const low = t.toLowerCase();
  return low.length > 0 ? low : null;
}

function normMarket(m: string): string {
  return String(m ?? "").trim().toLowerCase();
}

function itemPosition(item: { position: number | string }): number | null {
  const p = item.position;
  if (typeof p === "number" && Number.isFinite(p)) return p;
  if (typeof p === "string") {
    const n = Number.parseInt(p.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Package id from Serper row `packageId` or Play details `?id=` on `link`. */
export function effectiveSerperPreviewItemPackage(item: {
  packageId: string | null;
  link?: string;
}): string | null {
  const fromId = normPkgForSerperSnapshot(item.packageId);
  if (fromId) return fromId;
  return normPkgForSerperSnapshot(extractPackageIdFromPlayStoreDetailsUrl(item.link));
}

function effectiveItemPackage(
  item: { packageId: string | null; link?: string },
): string | null {
  return effectiveSerperPreviewItemPackage(item);
}

/** Strict or suffix/prefix family match (e.g. com.foo vs com.foo.debug). */
function itemMatchesTrackedPackage(want: string, item: { packageId: string | null; link?: string }): boolean {
  const ep = effectiveItemPackage(item);
  if (!ep) return false;
  if (ep === want) return true;
  if (ep.startsWith(`${want}.`) || want.startsWith(`${ep}.`)) return true;
  return false;
}

/**
 * Resolves a single integer rank for `keyword_rank_snapshots.rank`:
 * prefer the app's position in **primaryMarket**; else best (minimum) position
 * across countries; else {@link SERPER_RANK_NOT_IN_FIRST_PAGE}.
 */
export function resolveRankForSerperSnapshot(
  results: readonly SerperCountryResultForSnapshot[],
  packageName: string,
  primaryMarket: string,
): number {
  const want = normPkgForSerperSnapshot(packageName);
  if (!want) return SERPER_RANK_NOT_IN_FIRST_PAGE;

  const primary = normMarket(primaryMarket);
  let primaryHit: number | undefined;
  const others: number[] = [];

  for (const block of results) {
    if (block.error) continue;
    const country = normMarket(block.country);
    for (const item of block.items) {
      if (!itemMatchesTrackedPackage(want, item)) continue;
      const pos = itemPosition(item);
      if (pos == null) continue;
      if (country === primary) {
        if (primaryHit === undefined || pos < primaryHit) primaryHit = pos;
      } else {
        others.push(pos);
      }
    }
  }

  if (primaryHit != null) return primaryHit;
  const pool = others;
  if (pool.length === 0) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  return Math.min(...pool);
}

/**
 * Rank for one Play market from Serper organic items: best position where the result’s
 * **package id** (`packageId` or `?id=` on the Play details URL) matches `packageName`.
 * Result **titles** are ignored. Else {@link SERPER_RANK_NOT_IN_FIRST_PAGE}.
 */
export function resolveRankInCountryForSerperSnapshot(
  results: readonly SerperCountryResultForSnapshot[],
  packageName: string,
  countryCode: string,
): number {
  const want = normPkgForSerperSnapshot(packageName);
  if (!want) return SERPER_RANK_NOT_IN_FIRST_PAGE;

  const cc = normMarket(countryCode);
  const block = results.find((b) => normMarket(b.country) === cc);
  if (!block || block.error) return SERPER_RANK_NOT_IN_FIRST_PAGE;

  let best: number | undefined;
  for (const item of block.items) {
    if (!itemMatchesTrackedPackage(want, item)) continue;
    const pos = itemPosition(item);
    if (pos == null) continue;
    if (best === undefined || pos < best) best = pos;
  }
  return best ?? SERPER_RANK_NOT_IN_FIRST_PAGE;
}

/** Client preview rows: same package matching as rank snapshot resolution. */
export function serperPreviewRowMatchesWorkspacePackage(
  workspacePackageName: string | null | undefined,
  item: { packageId: string | null; link?: string },
): boolean {
  const want = normPkgForSerperSnapshot(workspacePackageName);
  if (!want) return false;
  return itemMatchesTrackedPackage(want, item);
}
