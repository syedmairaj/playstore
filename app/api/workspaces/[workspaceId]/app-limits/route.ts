import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { canAddNewApp } from "@/lib/utils/app-limits";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, context: Ctx) {
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

  try {
    const limits = await canAddNewApp(workspaceId);
    return NextResponse.json({ ok: true, ...limits });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load app limits";
    return NextResponse.json(
      { ok: false, error: { code: "app_limits_error", message } },
      { status: 500 },
    );
  }
}
