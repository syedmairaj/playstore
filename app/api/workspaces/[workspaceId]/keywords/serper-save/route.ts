import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { maybeCreateRankAlerts } from "@/lib/keywords/evaluate-alerts";
import { resolveRankForSerperSnapshot } from "@/lib/keywords/serper-snapshot-rank";
import { keywordSerperSaveBodySchema } from "@/lib/validation/keyword-serper-save-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/workspaces/[workspaceId]/keywords/serper-save";

type Ctx = { params: Promise<{ workspaceId: string }> };

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

  let parsed: ReturnType<typeof keywordSerperSaveBodySchema.parse>;
  try {
    parsed = keywordSerperSaveBodySchema.parse(body);
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

  const { data: appRow, error: appErr } = await supabase
    .from("apps")
    .select("id,package_name")
    .eq("id", parsed.appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (appErr || !appRow) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_app", message: "App not found in this workspace." } },
      { status: 400 },
    );
  }

  const pkg = String(appRow.package_name ?? "").trim();
  if (!pkg) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_package_name",
          message: "Add this app’s Android package name in workspace settings before saving ranks.",
        },
      },
      { status: 400 },
    );
  }

  const termNorm = parsed.term.trim().toLowerCase();
  const { data: kwCandidates, error: kwListErr } = await supabase
    .from("keywords")
    .select("id,term")
    .eq("workspace_id", workspaceId)
    .eq("app_id", parsed.appId)
    .eq("market", parsed.market);

  if (kwListErr) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: kwListErr.message } },
      { status: 500 },
    );
  }

  const existing = (kwCandidates ?? []).find(
    (k) => String(k.term ?? "").trim().toLowerCase() === termNorm,
  );

  let keywordId: string;
  if (existing?.id) {
    keywordId = existing.id as string;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("keywords")
      .insert({
        workspace_id: workspaceId,
        app_id: parsed.appId,
        term: parsed.term.trim(),
        market: parsed.market,
        locale: "en-US",
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      const dup =
        insErr?.code === "23505" ||
        /duplicate key|keywords_unique_term/i.test(insErr?.message ?? "");
      if (dup) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "duplicate_keyword",
              message: "That keyword is already tracked for this app and market.",
            },
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "insert_error", message: insErr?.message ?? "Failed" } },
        { status: 400 },
      );
    }
    keywordId = inserted.id as string;
  }

  const rank = resolveRankForSerperSnapshot(parsed.results, pkg, parsed.market);

  const { data: prevRows } = await supabase
    .from("keyword_rank_snapshots")
    .select("rank,snapshot_at")
    .eq("keyword_id", keywordId)
    .order("snapshot_at", { ascending: false })
    .limit(1);

  const prevRank =
    prevRows && prevRows.length > 0 ? (prevRows[0].rank as number | null) : null;

  const { data: snap, error: snapErr } = await supabase
    .from("keyword_rank_snapshots")
    .insert({
      keyword_id: keywordId,
      rank,
      source: "serper",
    })
    .select("id,rank,snapshot_at,best_rank,source")
    .single();

  if (snapErr || !snap) {
    if (!existing?.id) {
      await supabase.from("keywords").delete().eq("id", keywordId);
    }
    return NextResponse.json(
      { ok: false, error: { code: "insert_error", message: snapErr?.message ?? "Failed" } },
      { status: 400 },
    );
  }

  await maybeCreateRankAlerts({
    supabase,
    workspaceId,
    keywordId,
    keywordTerm: parsed.term.trim(),
    prevRank,
    newRank: rank,
  });

  return NextResponse.json({
    ok: true,
    keywordId,
    createdKeyword: !existing?.id,
    rank: snap.rank,
    snapshotAt: snap.snapshot_at,
    creditsCharged: 0,
    route: ROUTE,
    message:
      "Rank saved from your preview. Serper credits were charged when you ran Preview live ranks.",
  });
}
