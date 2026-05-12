import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { inviteMemberSchema } from "@/lib/validation/api";

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
    .from("workspace_invitations")
    .select("id,email,role,created_at,invited_by")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, invitations: data ?? [] });
}

export async function POST(request: Request, context: Ctx) {
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
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Admins only" } },
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
    const { email, role: inviteRole } = inviteMemberSchema.parse(body);
    const { data, error } = await supabase
      .from("workspace_invitations")
      .insert({
        workspace_id: workspaceId,
        email: email.toLowerCase(),
        role: inviteRole,
        invited_by: user.id,
      })
      .select("id,email,role,created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: { code: "insert_error", message: error?.message ?? "Failed" } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, invitation: data });
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
