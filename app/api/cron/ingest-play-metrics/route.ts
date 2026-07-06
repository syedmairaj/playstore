/**
 * POST /api/cron/ingest-play-metrics
 *
 * Daily cron job that pulls acquisition metrics from Google Play Console's
 * GCS bucket and upserts them into the `listing_performance` table.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *
 * Protected by a Bearer token check against CRON_SECRET.
 * Vercel Cron automatically sends the CRON_SECRET as a Bearer token;
 * GitHub Actions / manual triggers must do the same:
 *
 *   curl -X POST https://yourapp.vercel.app/api/cron/ingest-play-metrics \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * ── Schedule ──────────────────────────────────────────────────────────────────
 *
 * Registered in vercel.json:
 *   { "path": "/api/cron/ingest-play-metrics", "schedule": "0 6 * * *" }
 *
 * Runs at 06:00 UTC daily.  GCS acquisition reports have a ~1-day lag, so
 * yesterday's data is reliably available by 06:00 UTC.
 *
 * ── Manual / backfill trigger ─────────────────────────────────────────────────
 *
 * To backfill a date range, POST with a JSON body:
 *   { "fromDate": "2026-06-01", "toDate": "2026-06-27" }
 *
 * To target a single workspace:
 *   { "workspaceId": "uuid-...", "fromDate": "2026-06-01" }
 *
 * ── Response ──────────────────────────────────────────────────────────────────
 *
 *   200 { ok: true, summary: { workspaces, apps, rowsUpserted, ranAt } }
 *   207 { ok: false, errors: [...], partial: { rowsUpserted } }   ← partial success
 *   401 Unauthorized
 *   500 Internal error
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  ingestAllWorkspaces,
  discoverIngestionTargets,
} from "@/lib/performance/listing-performance-ingestion";
import { isGooglePlayConfigured } from "@/lib/performance/google-play-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5-minute Vercel function timeout (Pro plan)

const ROUTE = "POST /api/cron/ingest-play-metrics";

// ─── Auth guard ───────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(`[${ROUTE}] CRON_SECRET is not set — endpoint is inaccessible.`);
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token === cronSecret;
}

// ─── Body parser ──────────────────────────────────────────────────────────────

type CronBody = {
  /** Override the start date for the fetch window (YYYY-MM-DD). */
  fromDate?: string;
  /** Override the end date for the fetch window (YYYY-MM-DD). */
  toDate?: string;
  /** Restrict ingestion to a single workspace (for manual triggers). */
  workspaceId?: string;
};

async function parsebody(request: NextRequest): Promise<CronBody> {
  try {
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as CronBody;
  } catch {
    return {};
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ranAt = new Date().toISOString();

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!isAuthorized(request)) {
    console.warn(`[${ROUTE}] Unauthorized request.`);
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  // ── Play Store API configuration check ───────────────────────────────────
  if (!isGooglePlayConfigured()) {
    console.warn(`[${ROUTE}] Google Play not configured — skipping ingestion.`);
    return NextResponse.json({
      ok: false,
      error:
        "Google Play API not configured. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON and GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID.",
      ranAt,
    });
  }

  // ── Parse optional body ───────────────────────────────────────────────────
  const body = await parsebody(request);

  // If a specific workspaceId was requested, narrow the target list.
  let targets: Awaited<ReturnType<typeof discoverIngestionTargets>> | undefined;
  if (body.workspaceId) {
    const all = await discoverIngestionTargets();
    targets = all.filter((t) => t.workspaceId === body.workspaceId);

    if (targets.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No configured apps found for workspace ${body.workspaceId}.`,
          ranAt,
        },
        { status: 404 },
      );
    }
  }

  console.info(`[${ROUTE}] Starting ingestion`, {
    fromDate: body.fromDate ?? "yesterday (default)",
    toDate: body.toDate ?? "yesterday (default)",
    targetWorkspace: body.workspaceId ?? "all",
    ranAt,
  });

  // ── Run ingestion ─────────────────────────────────────────────────────────
  const result = await ingestAllWorkspaces({
    fromDate: body.fromDate,
    toDate: body.toDate,
    targets,
  });

  const summary = {
    workspacesProcessed: result.totalWorkspaces,
    appsProcessed: result.totalApps,
    rowsUpserted: result.totalRowsUpserted,
    errors: result.errors,
    ranAt,
  };

  console.info(`[${ROUTE}] Ingestion complete.`, summary);

  // ── Response ──────────────────────────────────────────────────────────────
  if (!result.ok && result.errors.length > 0 && result.totalRowsUpserted === 0) {
    // All jobs failed — hard error.
    return NextResponse.json(
      { ok: false, summary },
      { status: 500 },
    );
  }

  if (!result.ok && result.errors.length > 0) {
    // Some jobs failed, some succeeded — partial success.
    return NextResponse.json({ ok: false, summary }, { status: 207 });
  }

  return NextResponse.json({ ok: true, summary });
}
