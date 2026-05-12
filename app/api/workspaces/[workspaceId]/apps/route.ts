import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

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

  const { data, error } = await supabase
    .from("apps")
    .select("id,name,package_name,play_store_url,target_countries,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, apps: data ?? [] });
}
