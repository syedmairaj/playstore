/**
 * GET /api/listings/pipeline-status
 *   ?workspaceId=
 *   &appId=          (optional)
 *   &queueHash=      (optional — triggers visual alignment warning check too)
 *   &vaultLocale=    ("en" | "ar", default "en")
 *
 * Lightweight pre-flight check called by the client *before* the user clicks
 * "Generate".  Returns immediately whether the pipeline is ready to generate
 * or blocked because an intel module (Competitor Spy, Review Insights, or
 * Market Intel) still has uncurated DISCOVERY signals.
 *
 * Response 200:
 *   { ready: true }
 * | { ready: false; blockedBy: { module, discoveryCount, message }; visualWarnings? }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkIntelModulesReady } from "@/lib/listing/check-intel-modules-processing";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const appId = searchParams.get("appId") ?? null;
  const queueHash = searchParams.get("queueHash") ?? undefined;
  const vaultLocale = (searchParams.get("vaultLocale") ?? "en") as OptimizationQueueLocale;

  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "workspaceId required" } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found." } },
      { status: 403 },
    );
  }

  const admin = getSupabaseAdmin();
  const result = await checkIntelModulesReady(admin, workspaceId, vaultLocale, appId, {
    queueHash,
  });

  if (result.blocked) {
    return NextResponse.json({
      ok: true,
      ready: false,
      blockedBy: {
        module: result.module,
        discoveryCount: result.discoveryCount,
        message: result.message,
      },
      ...(result.visualWarnings.length > 0 ? { visualWarnings: result.visualWarnings } : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    ready: true,
    ...(result.visualWarnings.length > 0 ? { visualWarnings: result.visualWarnings } : {}),
  });
}
