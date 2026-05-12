import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { markAlertsReadSchema } from "@/lib/validation/api";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";

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

  let q = supabase
    .from("workspace_alerts")
    .select("id,type,title,body,severity,read_at,created_at,keyword_id,meta")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (unreadOnly) {
    q = q.is("read_at", null);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, alerts: data ?? [] });
}

export async function PATCH(request: Request, context: Ctx) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  try {
    const { alertIds } = markAlertsReadSchema.parse(body);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("workspace_alerts")
      .update({ read_at: now })
      .eq("workspace_id", workspaceId)
      .in("id", alertIds);

    if (error) {
      return NextResponse.json(
        { ok: false, error: { code: "update_error", message: error.message } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation_error", message: "Invalid input", details: e.flatten() },
        },
        { status: 400 },
      );
    }
    throw e;
  }
}
