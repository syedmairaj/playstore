/**
 * GET /api/workspaces/[workspaceId]/staging/list
 *
 * Retrieve all signals from workspace staging vault.
 * Used by Brand Mirror Engine and Consultant Layer as primary context.
 *
 * Query params:
 * - signalType: Filter by type (keyword, review_issue, etc)
 * - appId: Filter signals for specific app
 * - language: Filter by language (en, ar, etc)
 * - limit: Max results (default 1000)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { listVaultSignals } from "@/lib/staging-vault/staging-vault-service";

const ROUTE = "GET /api/workspaces/[workspaceId]/staging/list";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  // Verify workspace membership
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  // Parse query params
  const url = new URL(request.url);
  const signalType = url.searchParams.get("signalType") as
    | "keyword"
    | "review_issue"
    | "competitor_weakness"
    | "optimization_insight"
    | null;
  const appId = url.searchParams.get("appId") || undefined;
  const language = url.searchParams.get("language") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 5000);

  try {
    // List vault signals
    const vault = await listVaultSignals(supabase, workspaceId, {
      signalType: signalType || undefined,
      language,
      sourceAppId: appId,
      limit,
    });

    return NextResponse.json({
      ok: true,
      data: vault,
    });
  } catch (error) {
    console.error(`[${ROUTE}] Error:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "staging_error",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
