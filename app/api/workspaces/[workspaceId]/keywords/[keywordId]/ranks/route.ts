import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { captureKeywordAsoBaselineIfUnset } from "@/lib/keywords/capture-aso-baseline";
import { maybeCreateAsoRankImprovementAlert } from "@/lib/keywords/evaluate-aso-improvement-alert";
import { maybeCreateRankAlerts } from "@/lib/keywords/evaluate-alerts";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { createRankSchema } from "@/lib/validation/api";

type Ctx = { params: Promise<{ workspaceId: string; keywordId: string }> };

export async function POST(request: Request, context: Ctx) {
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
    const parsed = createRankSchema.parse(body);
    const { data: keyword, error: kwErr } = await supabase
      .from("keywords")
      .select("id,term,workspace_id,market")
      .eq("id", keywordId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (kwErr || !keyword) {
      return NextResponse.json(
        { ok: false, error: { code: "not_found", message: "Keyword not found" } },
        { status: 404 },
      );
    }

    const mkt = String(keyword.market ?? "us").trim().toLowerCase() || "us";
    const { data: prevRows } = await supabase
      .from("keyword_rank_snapshots")
      .select("rank,snapshot_at,country_code")
      .eq("keyword_id", keywordId)
      .or(`country_code.is.null,country_code.eq.${mkt}`)
      .order("snapshot_at", { ascending: false })
      .limit(1);

    const prevRank =
      prevRows && prevRows.length > 0 ? (prevRows[0].rank as number | null) : null;

    const { data: rankRow, error } = await supabase
      .from("keyword_rank_snapshots")
      .insert({
        keyword_id: keywordId,
        rank: parsed.rank,
        source: parsed.source ?? "manual",
        country_code: null,
      })
      .select("id,rank,snapshot_at,best_rank,source")
      .single();

    if (error || !rankRow) {
      return NextResponse.json(
        { ok: false, error: { code: "insert_error", message: error?.message ?? "Failed" } },
        { status: 400 },
      );
    }

    await maybeCreateRankAlerts({
      supabase,
      workspaceId,
      keywordId,
      keywordTerm: keyword.term as string,
      prevRank,
      newRank: parsed.rank,
    });

    await captureKeywordAsoBaselineIfUnset(supabase, {
      keywordId,
      candidateRank: parsed.rank,
      source: "initial_save",
    });

    await maybeCreateAsoRankImprovementAlert({
      supabase,
      workspaceId,
      keywordId,
      keywordTerm: keyword.term as string,
      newPrimaryRank: parsed.rank,
    });

    const payload = {
      ...rankRow,
      captured_at: rankRow.snapshot_at,
    };
    return NextResponse.json({ ok: true, rank: payload });
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
