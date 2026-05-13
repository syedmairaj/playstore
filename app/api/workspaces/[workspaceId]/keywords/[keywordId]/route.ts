import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string; keywordId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { workspaceId, keywordId } = await context.params;
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

  const { data: keyword, error: kwErr } = await supabase
    .from("keywords")
    .select("id,term,market,locale,created_at,app_id")
    .eq("id", keywordId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (kwErr || !keyword) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Keyword not found" } },
      { status: 404 },
    );
  }

  const { data: rankRows, error: rErr } = await supabase
    .from("keyword_rank_snapshots")
    .select("rank,snapshot_at,best_rank")
    .eq("keyword_id", keywordId)
    .order("snapshot_at", { ascending: true })
    .limit(500);

  if (rErr) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: rErr.message } },
      { status: 400 },
    );
  }

  const ranks = (rankRows ?? []).map((r) => ({
    rank: r.rank as number | null,
    captured_at: r.snapshot_at as string,
    best_rank: r.best_rank as number | null,
  }));

  const latest =
    ranks.length === 0
      ? null
      : [...ranks].sort(
          (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime(),
        )[0] ?? null;

  return NextResponse.json({
    ok: true,
    keyword: {
      id: keyword.id,
      term: keyword.term,
      market: keyword.market,
      locale: keyword.locale,
      created_at: keyword.created_at,
      app_id: keyword.app_id,
      ranks,
      latest,
    },
  });
}

export async function DELETE(_request: Request, context: Ctx) {
  const { workspaceId, keywordId } = await context.params;
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

  const { data: keyword, error: selErr } = await supabase
    .from("keywords")
    .select("id")
    .eq("id", keywordId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (selErr || !keyword) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Keyword not found" } },
      { status: 404 },
    );
  }

  const { error } = await supabase.from("keywords").delete().eq("id", keywordId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "delete_error", message: error.message } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
