import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string }> };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, limitRaw))
    : DEFAULT_LIMIT;

  const [{ data: workspace, error: wsErr }, { data: entries, error: ledgerErr }] =
    await Promise.all([
      supabase
        .from("workspaces")
        .select("ai_credits_remaining,ai_credits_monthly_allocation,plan")
        .eq("id", workspaceId)
        .maybeSingle(),
      supabase
        .from("credits_ledger")
        .select("id,created_at,amount,description,source_type,meta")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

  if (wsErr || !workspace) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Workspace not found" } },
      { status: 404 },
    );
  }

  if (ledgerErr) {
    return NextResponse.json(
      { ok: false, error: { code: "ledger_error", message: ledgerErr.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    wallet: {
      remaining:
        typeof workspace.ai_credits_remaining === "number" ? workspace.ai_credits_remaining : 0,
      allocation:
        typeof workspace.ai_credits_monthly_allocation === "number"
          ? workspace.ai_credits_monthly_allocation
          : 0,
      plan: typeof workspace.plan === "string" ? workspace.plan : "free",
    },
    entries: entries ?? [],
  });
}
