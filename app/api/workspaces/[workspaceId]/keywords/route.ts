import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loadWorkspaceKeywords } from "@/lib/keywords/load-workspace-keywords";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { createKeywordSchema } from "@/lib/validation/api";

type Ctx = { params: Promise<{ workspaceId: string }> };

function parseOptionalAppId(url: URL): string | undefined {
  const raw = url.searchParams.get("appId");
  if (!raw || raw === "all") return undefined;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuid.test(raw) ? raw : undefined;
}

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

  const appId = parseOptionalAppId(new URL(request.url));
  const loaded = await loadWorkspaceKeywords(supabase, workspaceId, { appId });
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
    } else {
      const { data: appRow, error: appErr } = await supabase
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (appErr || !appRow) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "invalid_app", message: "App not found in this workspace." },
          },
          { status: 400 },
        );
      }
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
      const msg = error?.message ?? "Failed";
      const dup =
        error?.code === "23505" ||
        /duplicate key|keywords_unique_term_per_app/i.test(error?.message ?? "");
      if (dup) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "duplicate_keyword",
              message:
                "That keyword is already tracked for this app and market. Try editing the filter or use a different term.",
            },
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "insert_error", message: msg } },
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
