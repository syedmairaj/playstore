/**
 * POST /api/cron/refresh-market-rank-wins
 *
 * Pre-warms market_rank_wins_cache for all workspace/app pairs with tracked keywords.
 * Schedule: every 6 hours (vercel.json).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRankWinsCached,
  listRankWinsCacheTargets,
} from "@/lib/market/rank-wins-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "POST /api/cron/refresh-market-rank-wins";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const targets = await listRankWinsCacheTargets(admin);

  let refreshed = 0;
  const errors: string[] = [];

  for (const { workspaceId, appId } of targets) {
    try {
      await getRankWinsCached({
        supabase: admin,
        workspaceId,
        appId,
        forceRefresh: true,
      });
      refreshed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${workspaceId}/${appId}: ${message}`);
    }
  }

  console.info(
    JSON.stringify({
      event: "market_rank_wins_cache_refresh",
      targets: targets.length,
      refreshed,
      errors: errors.length,
    }),
  );

  if (errors.length > 0 && refreshed === 0) {
    return NextResponse.json(
      { ok: false, errors, summary: { targets: targets.length, refreshed } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    summary: {
      targets: targets.length,
      refreshed,
      errorCount: errors.length,
      ranAt: new Date().toISOString(),
    },
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}
