import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { keywordTrackerPreviewDraftSchema } from "@/lib/validation/keyword-tracker-preview-draft";

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
    .from("workspace_keyword_serper_preview_drafts")
    .select("payload,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("workspace_keyword_serper_preview_drafts") && msg.toLowerCase().includes("relation")) {
      return NextResponse.json({ ok: true, draft: null, unavailable: true });
    }
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: msg } },
      { status: 500 },
    );
  }

  const rawPayload = data?.payload;
  const parsed = keywordTrackerPreviewDraftSchema.safeParse(rawPayload);
  return NextResponse.json({
    ok: true,
    draft: parsed.success ? parsed.data : null,
  });
}

export async function PUT(request: Request, context: Ctx) {
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
    const draft = keywordTrackerPreviewDraftSchema.parse(body);
    const { error } = await supabase.from("workspace_keyword_serper_preview_drafts").upsert(
      {
        workspace_id: workspaceId,
        user_id: user.id,
        payload: draft,
        updated_at: draft.updatedAt,
      },
      { onConflict: "workspace_id,user_id" },
    );

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("workspace_keyword_serper_preview_drafts") && msg.toLowerCase().includes("relation")) {
        return NextResponse.json(
          { ok: false, error: { code: "schema_unavailable", message: "Preview sync requires migration" } },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "upsert_error", message: msg } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation_error", message: "Invalid draft", details: e.flatten() },
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
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("workspace_keyword_serper_preview_drafts")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("workspace_keyword_serper_preview_drafts") && msg.toLowerCase().includes("relation")) {
      return NextResponse.json({ ok: true, cleared: false, unavailable: true });
    }
    return NextResponse.json(
      { ok: false, error: { code: "delete_error", message: msg } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, cleared: true });
}
