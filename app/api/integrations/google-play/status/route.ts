import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getConnectedAccount } from "@/lib/play-store/google-play-oauth";

// GET /api/integrations/google-play/status?workspaceId=xxx
export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json({ ok: false, error: "Workspace not found or no access." }, { status: 403 });
  }

  try {
    const account = await getConnectedAccount(workspaceId);
    return NextResponse.json({
      ok: true,
      connected: account !== null,
      authorizedEmail: account?.authorizedEmail ?? null,
      connectedAt: account?.createdAt ?? null,
    });
  } catch (err) {
    console.error("[google-play/status]", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch integration status." }, { status: 500 });
  }
}
