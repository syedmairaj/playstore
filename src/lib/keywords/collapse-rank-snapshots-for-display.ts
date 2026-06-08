import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";

export type RawRankSnapshot = {
  rank: number | null;
  snapshot_at: string;
  country_code?: string | null;
  /** e.g. `serper`, `manual`, `demo` */
  source?: string | null;
};

export type CollapseSnapshotsOptions = {
  /**
   * Keyword primary Play market (`keywords.market`, lowercase alpha-2 when possible).
   * When several `country_code` rows share the same instant, the folded series
   * prefers that market's rank (see `docs/database.md` — keyword_rank_snapshots).
   */
  primaryMarket?: string | null;
};

export type CollapsedRankPoint = {
  rank: number;
  captured_at: string;
  /** Market tag for the chosen rank when known; null for legacy or ambiguous multi-market buckets. */
  country_code: string | null;
  source: string | null;
};

function normMarket(m: string): string {
  return String(m ?? "").trim().toLowerCase();
}

/** Same instant across rows even if Postgres/client stringify timestamps differently. */
export function rankSnapshotInstantMs(iso: string): number {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function toFiniteRank(rk: unknown): number | null {
  if (rk == null) return null;
  const n = typeof rk === "number" ? rk : Number(rk);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valid stored ranks for folding: organic positions plus Serper sentinel `101` (“20+”).
 * Values above this range are ignored as corrupt/out-of-contract.
 */
function isChartableRank(n: number): boolean {
  return n >= 1 && n <= 500;
}

/** Prefer lowest organic rank; if none, keep sentinel 101 when present. */
function pickBestRankForInstant(values: (number | null)[]): number | undefined {
  const nums = values
    .map(toFiniteRank)
    .filter((n): n is number => n != null && isChartableRank(n));
  if (nums.length === 0) return undefined;
  const organic = nums.filter((n) => n < SERPER_RANK_NOT_IN_FIRST_PAGE);
  if (organic.length > 0) return Math.min(...organic);
  if (nums.some((n) => n === SERPER_RANK_NOT_IN_FIRST_PAGE)) {
    return SERPER_RANK_NOT_IN_FIRST_PAGE;
  }
  return Math.min(...nums);
}

function snapshotSource(r: RawRankSnapshot): string | null {
  const s = r.source;
  if (s == null || String(s).trim() === "") return null;
  return String(s).trim();
}

type MergedBucket = { rank: number; country_code: string | null; source: string | null };

function mergeBucketForPrimary(
  bucket: RawRankSnapshot[],
  primaryMarket: string | null | undefined,
): MergedBucket | undefined {
  const pm = primaryMarket ? normMarket(primaryMarket) : "";

  if (pm) {
    const explicitPrimary = bucket.filter((r) => {
      const cc = r.country_code;
      if (cc == null || String(cc).trim() === "") return false;
      return normMarket(String(cc)) === pm;
    });
    if (explicitPrimary.length > 0) {
      const rank = pickBestRankForInstant(explicitPrimary.map((r) => r.rank));
      if (rank === undefined) return undefined;
      const winners = explicitPrimary.filter((r) => toFiniteRank(r.rank) === rank);
      const w0 = winners[0];
      return {
        rank,
        country_code: pm,
        source: w0 ? snapshotSource(w0) : null,
      };
    }
    const legacy = bucket.filter(
      (r) => r.country_code == null || String(r.country_code).trim() === "",
    );
    if (legacy.length > 0) {
      const rank = pickBestRankForInstant(legacy.map((r) => r.rank));
      if (rank === undefined) return undefined;
      const w = legacy.find((r) => toFiniteRank(r.rank) === rank);
      return {
        rank,
        country_code: null,
        source: w ? snapshotSource(w) : null,
      };
    }
  } else {
    const legacyOnly = bucket.filter(
      (r) => r.country_code == null || String(r.country_code).trim() === "",
    );
    if (legacyOnly.length === bucket.length && legacyOnly.length > 0) {
      const rank = pickBestRankForInstant(legacyOnly.map((r) => r.rank));
      if (rank === undefined) return undefined;
      const w = legacyOnly.find((r) => toFiniteRank(r.rank) === rank);
      return {
        rank,
        country_code: null,
        source: w ? snapshotSource(w) : null,
      };
    }
  }

  const rank = pickBestRankForInstant(bucket.map((r) => r.rank));
  if (rank === undefined) return undefined;
  const contributors = bucket.filter((r) => {
    const n = toFiniteRank(r.rank);
    return n != null && isChartableRank(n) && n === rank;
  });
  if (contributors.length > 1 && pm) {
    const pmHit = contributors.find(
      (c) => normMarket(String(c.country_code ?? "")) === pm,
    );
    if (pmHit) {
      return {
        rank,
        country_code: pm,
        source: snapshotSource(pmHit),
      };
    }
  }
  if (contributors.length === 1) {
    const c = contributors[0]!;
    const ccRaw = c.country_code;
    const tagged =
      ccRaw != null && String(ccRaw).trim() !== "" ? normMarket(String(ccRaw)) : null;
    return {
      rank,
      country_code: tagged,
      source: snapshotSource(c),
    };
  }
  return {
    rank,
    country_code: null,
    source: contributors[0] ? snapshotSource(contributors[0]) : null,
  };
}

/**
 * One chart/table point per snapshot instant: prefers **`keywords.market`**
 * when per-country rows exist at that instant; otherwise legacy `country_code`
 * null rows, then best rank across markets.
 *
 * Organic ranks win over sentinel `101` (“20+”) when mixing countries.
 */
export function collapseSnapshotsToBestRankSeries(
  rows: RawRankSnapshot[],
  options?: CollapseSnapshotsOptions,
): CollapsedRankPoint[] {
  const primaryMarket = options?.primaryMarket ?? null;
  const byInstant = new Map<number, RawRankSnapshot[]>();
  for (const r of rows) {
    const ms = rankSnapshotInstantMs(String(r.snapshot_at ?? ""));
    if (!Number.isFinite(ms)) continue;
    const list = byInstant.get(ms) ?? [];
    list.push(r);
    byInstant.set(ms, list);
  }

  const out: CollapsedRankPoint[] = [];
  const sortedMs = [...byInstant.keys()].sort((a, b) => a - b);
  for (const ms of sortedMs) {
    const bucket = byInstant.get(ms) ?? [];
    const merged = mergeBucketForPrimary(bucket, primaryMarket);
    if (merged === undefined) continue;
    out.push({
      ...merged,
      captured_at: new Date(ms).toISOString(),
    });
  }
  return out;
}

export function latestFromCollapsedSeries(
  chronological: CollapsedRankPoint[],
): CollapsedRankPoint | null {
  if (chronological.length === 0) return null;
  return chronological[chronological.length - 1]!;
}
