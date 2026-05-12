import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loadWorkspaceKeywords } from "@/lib/keywords/load-workspace-keywords";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { createKeywordSchema } from "@/lib/validation/api";

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

  const loaded = await loadWorkspaceKeywords(supabase, workspaceId);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: loaded.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, keywords: loaded.keywords });
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
    const parsed = createKeywordSchema.parse(body);
    let appId = parsed.appId ?? null;
    if (!appId) {
      const { data: app, error: appErr } = await supabase
        .from("apps")
        .select("id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (appErr || !app) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "no_app",
              message: "No default app found for this workspace.",
            },
          },
          { status: 400 },
        );
      }
      appId = app.id;
    }

    const { data: keyword, error } = await supabase
      .from("keywords")
      .insert({
        workspace_id: workspaceId,
        app_id: appId,
        term: parsed.term,
        market: parsed.market ?? "us",
        locale: parsed.locale ?? "en-US",
      })
      .select("id,term,market,locale,created_at,app_id")
      .single();

    if (error || !keyword) {
      return NextResponse.json(
        { ok: false, error: { code: "insert_error", message: error?.message ?? "Failed" } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, keyword });
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
