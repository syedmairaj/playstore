/**
 * Google Play Store Acquisition CSV API
 *
 * Downloads and parses the monthly acquisition overview CSV files that
 * Google Play Console exports to GCS.  These are the canonical source
 * for store-listing funnel metrics (visitors → installers → CVR).
 *
 * ── GCS bucket structure ─────────────────────────────────────────────────────
 *
 *   gs://pubsite_prod_rev_{developerAccountId}/
 *     stats/
 *       acquisitions/
 *         acquisitions_overview_v2_{YYYYMM}_{packageName}.csv
 *
 * ── CSV column reference (v2 format) ────────────────────────────────────────
 *
 *   Date                           YYYYMMDD
 *   Package Name                   e.g. com.example.app
 *   Country (Play Store)           ISO 3166-1 alpha-2, lowercase
 *   Store Listing Visitors         bigint  — unique users who viewed the listing
 *   Store Listing Acquisitions     bigint  — unique users who installed
 *   Install CTR (%)                numeric — Acquisitions / Visitors × 100
 *   Organic Play Store Visitors    bigint  (subset of Store Listing Visitors)
 *   Organic Acquisitions           bigint
 *   Organic Install CTR (%)        numeric
 *   Paid Visitors                  bigint
 *   Paid Acquisitions              bigint
 *   Paid Install CTR (%)           numeric
 *
 * We aggregate all rows for a given date across countries to produce
 * one total-daily row per package.
 *
 * Impressions are NOT in the acquisition CSV — they come from a separate
 * store_performance file.  The `impressions` field is set to null here
 * and can be filled from a future store-performance fetch.
 */

import "server-only";
import {
  getGooglePlayAccessToken,
  getDeveloperAccountId,
  PLAY_SCOPES,
} from "@/lib/performance/google-play-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

/** One aggregated row per (package, date) after summing across countries. */
export type RawAcquisitionRow = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  packageName: string;
  /** Total unique store-listing page visitors (all countries). */
  storeVisitors: bigint;
  /** Total unique installers from store listing (all countries). */
  installers: bigint;
  /**
   * Store-listing conversion rate = installers / storeVisitors × 100.
   * Recomputed from the aggregated totals rather than averaging the
   * per-country CTR percentages (which would be a weighted-average error).
   */
  conversionRate: number | null;
  /**
   * Impressions are null from this data source.
   * Populated by a separate store-performance fetch.
   */
  impressions: null;
  /** Raw country-level rows before aggregation (for debugging). */
  countryCount: number;
};

export type FetchAcquisitionReportOptions = {
  packageName: string;
  /** ISO date (YYYY-MM-DD). Defaults to 30 days ago. */
  fromDate?: string;
  /** ISO date (YYYY-MM-DD). Defaults to today. */
  toDate?: string;
};

export type FetchAcquisitionReportResult =
  | { ok: true; rows: RawAcquisitionRow[]; filesProcessed: number }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "auth_failed"
        | "gcs_list_failed"
        | "no_files"
        | "parse_failed";
      detail?: string;
    };

// ─── GCS helpers ─────────────────────────────────────────────────────────────

const GCS_JSON_API = "https://storage.googleapis.com/storage/v1";
const GCS_DOWNLOAD = "https://storage.googleapis.com";
const BUCKET_PREFIX = "pubsite_prod_rev_";

async function listBucketObjects(
  bucketName: string,
  prefix: string,
  accessToken: string,
): Promise<string[]> {
  const url =
    `${GCS_JSON_API}/b/${encodeURIComponent(bucketName)}/o` +
    `?prefix=${encodeURIComponent(prefix)}&fields=items/name`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.error("[play-store-acquisition-api] GCS list failed:", res.status, await res.text());
    return [];
  }

  const json = (await res.json()) as { items?: { name: string }[] };
  return (json.items ?? []).map((i) => i.name);
}

async function downloadObject(
  bucketName: string,
  objectName: string,
  accessToken: string,
): Promise<string | null> {
  // Use the media download endpoint (alt=media).
  const url =
    `${GCS_JSON_API}/b/${encodeURIComponent(bucketName)}/o` +
    `/${encodeURIComponent(objectName)}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.warn(
      "[play-store-acquisition-api] Download failed:",
      objectName,
      res.status,
    );
    return null;
  }

  return res.text();
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

type CsvColumnMap = {
  date: number;
  packageName: number;
  country: number;
  storeVisitors: number;
  storeAcquisitions: number;
  installCtr: number;
};

function parseColumnHeaders(headerLine: string): CsvColumnMap | null {
  // Strip BOM, normalise whitespace, lowercase for fuzzy matching.
  const cols = headerLine
    .replace(/^\uFEFF/, "")
    .split(",")
    .map((h) => h.trim().replace(/"/g, "").toLowerCase());

  const find = (...patterns: string[]): number => {
    for (const pat of patterns) {
      const idx = cols.findIndex((c) => c.includes(pat));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateIdx = find("date");
  const pkgIdx = find("package name", "package");
  const countryIdx = find("country");
  const visitorsIdx = find("store listing visitor", "visitors");
  const acquisitionsIdx = find("store listing acquisition", "installer", "acquisition");
  const ctrIdx = find("install ctr");

  // date and acquisitions are the minimum required columns.
  if (dateIdx === -1 || acquisitionsIdx === -1) return null;

  return {
    date: dateIdx,
    packageName: pkgIdx,
    country: countryIdx,
    storeVisitors: visitorsIdx,
    storeAcquisitions: acquisitionsIdx,
    installCtr: ctrIdx,
  };
}

/**
 * Parses a Google Play acquisition CSV and returns one aggregated row
 * per (packageName, date) combination, summed across all countries.
 */
export function parseAcquisitionCsv(
  csv: string,
  targetPackageName: string,
): RawAcquisitionRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const colMap = parseColumnHeaders(lines[0]);
  if (!colMap) {
    console.warn("[play-store-acquisition-api] Unrecognised CSV header:", lines[0].slice(0, 200));
    return [];
  }

  // Accumulator keyed by YYYY-MM-DD.
  const byDate = new Map<
    string,
    { storeVisitors: bigint; installers: bigint; rows: number }
  >();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);

    // Filter by package when the column is present.
    if (
      colMap.packageName !== -1 &&
      cols[colMap.packageName] !== targetPackageName
    ) {
      continue;
    }

    const rawDate = cols[colMap.date] ?? "";
    if (!rawDate) continue;

    // Normalise YYYYMMDD → YYYY-MM-DD.
    const date = rawDate.includes("-")
      ? rawDate
      : rawDate.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const visitors =
      colMap.storeVisitors !== -1
        ? parseBigInt(cols[colMap.storeVisitors])
        : 0n;
    const installers = parseBigInt(cols[colMap.storeAcquisitions]);

    const acc = byDate.get(date) ?? {
      storeVisitors: 0n,
      installers: 0n,
      rows: 0,
    };

    byDate.set(date, {
      storeVisitors: acc.storeVisitors + visitors,
      installers: acc.installers + installers,
      rows: acc.rows + 1,
    });
  }

  return Array.from(byDate.entries()).map(([date, agg]) => {
    const cvr =
      agg.storeVisitors > 0n
        ? Math.round(
            (Number(agg.installers) / Number(agg.storeVisitors)) * 10000,
          ) / 100
        : null;

    return {
      date,
      packageName: targetPackageName,
      storeVisitors: agg.storeVisitors,
      installers: agg.installers,
      conversionRate: cvr,
      impressions: null,
      countryCount: agg.rows,
    };
  });
}

/** Splits a CSV line respecting quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseBigInt(s: string | undefined): bigint {
  if (!s) return 0n;
  const cleaned = s.replace(/[^0-9]/g, "");
  return cleaned ? BigInt(cleaned) : 0n;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toYYYYMM(isoDate: string): string {
  return isoDate.slice(0, 7).replace("-", "");
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Downloads and parses acquisition CSV files from GCS for the given package
 * and date range.  Aggregates per-country rows into daily totals.
 *
 * Returns typed `RawAcquisitionRow[]` ready for normalization.
 */
export async function fetchAcquisitionReport(
  options: FetchAcquisitionReportOptions,
): Promise<FetchAcquisitionReportResult> {
  const developerAccountId = getDeveloperAccountId();
  if (!developerAccountId) {
    return { ok: false, reason: "not_configured" };
  }

  const tokenResult = await getGooglePlayAccessToken([PLAY_SCOPES.GCS_READ]);
  if (!tokenResult.ok) {
    return { ok: false, reason: "auth_failed", detail: tokenResult.reason };
  }

  const { token } = tokenResult;
  const bucketName = `${BUCKET_PREFIX}${developerAccountId}`;
  const fromDate = options.fromDate ?? defaultFromDate();
  const toDate = options.toDate ?? defaultToDate();

  // List all acquisition overview files in the bucket.
  const prefix = "stats/acquisitions/acquisitions_overview_v2_";
  const allObjects = await listBucketObjects(bucketName, prefix, token);

  if (allObjects.length === 0) {
    return { ok: false, reason: "gcs_list_failed", detail: "No objects found in bucket" };
  }

  // Filter to months that overlap [fromDate, toDate].
  const fromYYYYMM = toYYYYMM(fromDate);
  const toYYYYMM_val = toYYYYMM(toDate);

  const relevantObjects = allObjects.filter((name) => {
    const match = name.match(/acquisitions_overview_v2_(\d{6})_/);
    if (!match) return false;
    const fileMonth = match[1];
    return fileMonth >= fromYYYYMM && fileMonth <= toYYYYMM_val;
  });

  if (relevantObjects.length === 0) {
    return {
      ok: false,
      reason: "no_files",
      detail: `No acquisition files for ${fromDate} – ${toDate}`,
    };
  }

  // Download + parse each file and merge results.
  const allRows = new Map<string, RawAcquisitionRow>();
  let filesProcessed = 0;

  for (const objectName of relevantObjects) {
    const csv = await downloadObject(bucketName, objectName, token);
    if (!csv) continue;

    const parsed = parseAcquisitionCsv(csv, options.packageName);
    filesProcessed++;

    for (const row of parsed) {
      // Later files (more recent month) overwrite earlier ones for the same date.
      allRows.set(row.date, row);
    }
  }

  if (filesProcessed === 0) {
    return { ok: false, reason: "parse_failed", detail: "All downloads failed" };
  }

  // Apply exact date range filter.
  const filtered = Array.from(allRows.values()).filter(
    (r) => r.date >= fromDate && r.date <= toDate,
  );

  return { ok: true, rows: filtered, filesProcessed };
}
