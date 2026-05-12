import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { patchWorkspaceSchema } from "@/lib/validation/api";

type Ctx = { params: Promise<{ workspaceId: string }> };

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
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not allowed" } },
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
    const parsed = patchWorkspaceSchema.parse(body);
    const updates: Record<string, unknown> = {};
    if (parsed.name != null) updates.name = parsed.name;
    if (parsed.onboarding_state != null) {
      updates.onboarding_state = parsed.onboarding_state;
    }
    if (parsed.plan != null && role === "owner") {
      updates.plan = parsed.plan;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "No valid fields" } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("workspaces")
      .update(updates)
      .eq("id", workspaceId)
      .select("id,name,plan,onboarding_state")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: { code: "update_error", message: error?.message ?? "Failed" } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, workspace: data });
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

export async function DELETE(_request: Request, context: Ctx) {
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
  if (role !== "owner") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Owner only" } },
      { status: 403 },
    );
  }

  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "delete_error", message: error.message } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
