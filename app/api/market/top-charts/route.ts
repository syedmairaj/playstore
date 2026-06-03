import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchTopCharts, type TopChartApp, type TopChartCollection } from "@/lib/play-store/fetch-top-charts";
import { GPLAY_CATEGORY_LABELS } from "@/lib/market/category-labels";

const ROUTE = "GET /api/market/top-charts";
const CACHE_TABLE = "market_top_charts_cache";

function isValidCategory(cat: string): boolean {
  return cat in GPLAY_CATEGORY_LABELS;
}

function isValidCollection(col: string): col is TopChartCollection {
  return ["TOP_FREE", "TOP_PAID", "GROSSING"].includes(col);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category   = searchParams.get("category") ?? "APPLICATION";
  const country    = (searchParams.get("country") ?? "us").toLowerCase();
  const collection = (searchParams.get("collection") ?? "TOP_FREE").toUpperCase();

  if (!isValidCategory(category)) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_category", message: `Unknown category: ${category}` } },
      { status: 400 },
    );
  }
  if (!isValidCollection(collection)) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_collection", message: `Collection must be TOP_FREE, TOP_PAID, or GROSSING` } },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // ── Auth check ────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  // ── Cache read ────────────────────────────────────────────────────────────
  const { data: cached, error: cacheErr } = await supabase
    .from(CACHE_TABLE)
    .select("apps_json, fetched_at, expires_at")
    .eq("category", category)
    .eq("country", country)
    .eq("collection", collection)
    .maybeSingle();

  if (cacheErr) {
    // Table not yet migrated — log and fall through to live fetch
    console.warn(`[${ROUTE}] Cache read error (table may not exist yet):`, cacheErr.message);
  }

  const now = new Date();
  const isValid =
    cached &&
    cached.apps_json &&
    new Date(cached.expires_at) > now;

  if (isValid) {
    return NextResponse.json({
      ok: true,
      apps: cached.apps_json as TopChartApp[],
      meta: {
        category,
        country,
        collection,
        fetchedAt: cached.fetched_at,
        fromCache: true,
      },
    });
  }

  // ── Live fetch from Google Play ───────────────────────────────────────────
  let apps: TopChartApp[];
  try {
    apps = await fetchTopCharts({ category, country, collection, num: 30 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${ROUTE}] fetchTopCharts failed:`, message);
    return NextResponse.json(
      { ok: false, error: { code: "fetch_failed", message: "Could not load chart data. Try again in a moment." } },
      { status: 502 },
    );
  }

  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  // ── Cache write (fire-and-forget, non-fatal) ──────────────────────────────
  // Use admin/service-role client — the cache table's write policy requires it.
  // Reads use the user's JWT (anon_read policy); writes always go through admin.
  const adminClient = getSupabaseAdmin();
  adminClient
    .from(CACHE_TABLE)
    .upsert(
      {
        category,
        country,
        collection,
        apps_json: apps,
        fetched_at: fetchedAt,
        expires_at: expiresAt,
      },
      { onConflict: "category,country,collection" },
    )
    .then(({ error }) => {
      if (error) {
        console.warn(`[${ROUTE}] Cache write failed (non-fatal):`, error.message);
      }
    });

  return NextResponse.json({
    ok: true,
    apps,
    meta: {
      category,
      country,
      collection,
      fetchedAt,
      fromCache: false,
    },
  });
}
