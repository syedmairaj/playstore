import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { captureKeywordAsoBaselineIfUnset } from "@/lib/keywords/capture-aso-baseline";
import { maybeCreateAsoRankImprovementAlert } from "@/lib/keywords/evaluate-aso-improvement-alert";
import { maybeCreateRankAlerts } from "@/lib/keywords/evaluate-alerts";
import {
  resolveRankInCountryForSerperSnapshot,
  rankForSnapshotInsert,
} from "@/lib/keywords/serper-snapshot-rank-resolve";
import {
  formatTrackedCompetitorRankForDb,
  resolveTrackedCompetitorRankInSerp,
} from "@/lib/keywords/tracked-competitor-ranks";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { keywordSerperSaveBodySchema } from "@/lib/validation/keyword-serper-save-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/workspaces/[workspaceId]/keywords/serper-save";

type Ctx = { params: Promise<{ workspaceId: string }> };

function normTerm(t: string): string {
  return String(t ?? "").trim().toLowerCase();
}

function normMarket(m: string): string {
  return String(m ?? "").trim().toLowerCase();
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

  const termTrimmed = parsed.term.trim();
  const termNorm = normTerm(termTrimmed);
  let saveCountries = [
    ...new Set(parsed.countries.map((c) => normMarket(String(c))).filter(Boolean)),
  ];
  const primaryHint = parsed.primaryCountry ? normMarket(String(parsed.primaryCountry)) : "";
  if (primaryHint && saveCountries.includes(primaryHint)) {
    saveCountries = [primaryHint, ...saveCountries.filter((c) => c !== primaryHint)];
  }
  if (saveCountries.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: "Select at least one country." } },
      { status: 400 },
    );
  }
  const primaryMarket = normMarket(saveCountries[0]) || "us";

  const { data: kwCandidates, error: kwListErr } = await supabase
    .from("keywords")
    .select("id,term,market,created_at")
    .eq("workspace_id", workspaceId)
    .eq("app_id", parsed.appId)
    .order("created_at", { ascending: true });

  if (kwListErr) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: kwListErr.message } },
      { status: 500 },
    );
  }

  const matches = (kwCandidates ?? []).filter(
    (k) => normTerm(String(k.term ?? "")) === termNorm,
  );

  const rowForPrimary = matches.find((k) => normMarket(String(k.market ?? "")) === primaryMarket);
  let keywordId: string;
  let createdKeyword = false;

  if (parsed.keywordId) {
    const chosen = matches.find((k) => String(k.id) === String(parsed.keywordId));
    if (!chosen) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "invalid_keyword",
            message: "Keyword not found for this app and term, or it belongs to another term.",
          },
        },
        { status: 400 },
      );
    }
    const chosenExisting = chosen;
    keywordId = chosenExisting.id as string;
    const currentM = normMarket(String(chosenExisting.market ?? ""));
    if (currentM !== primaryMarket) {
      const otherHasPrimary = matches.some(
        (k) =>
          String(k.id) !== String(chosenExisting.id) &&
          normMarket(String(k.market ?? "")) === primaryMarket,
      );
      if (!otherHasPrimary) {
        const { error: updErr } = await supabase
          .from("keywords")
          .update({ market: primaryMarket })
          .eq("id", keywordId)
          .eq("workspace_id", workspaceId);
        if (updErr) {
          return NextResponse.json(
            { ok: false, error: { code: "update_error", message: updErr.message } },
            { status: 400 },
          );
        }
      } else if (rowForPrimary?.id) {
        keywordId = rowForPrimary.id as string;
      }
    }
  } else {
    const chosenExisting = rowForPrimary ?? matches[0];

    if (chosenExisting?.id) {
      keywordId = chosenExisting.id as string;
      const currentM = normMarket(String(chosenExisting.market ?? ""));
      if (currentM !== primaryMarket) {
        const otherHasPrimary = matches.some(
          (k) =>
            String(k.id) !== String(chosenExisting.id) &&
            normMarket(String(k.market ?? "")) === primaryMarket,
        );
        if (!otherHasPrimary) {
          const { error: updErr } = await supabase
            .from("keywords")
            .update({ market: primaryMarket })
            .eq("id", keywordId)
            .eq("workspace_id", workspaceId);
          if (updErr) {
            return NextResponse.json(
              { ok: false, error: { code: "update_error", message: updErr.message } },
              { status: 400 },
            );
          }
        } else if (rowForPrimary?.id) {
          keywordId = rowForPrimary.id as string;
        }
      }
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("keywords")
        .insert({
          workspace_id: workspaceId,
          app_id: parsed.appId,
          term: termTrimmed,
          market: primaryMarket,
          locale: "en-US",
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        const dup =
          insErr?.code === "23505" ||
          /duplicate key|keywords_unique_term/i.test(insErr?.message ?? "");
        if (!dup) {
          return NextResponse.json(
            { ok: false, error: { code: "insert_error", message: insErr?.message ?? "Failed" } },
            { status: 400 },
          );
        }
        // Race or prior row: attach snapshots to the existing keyword instead of failing save.
        const { data: retryRows, error: retryErr } = await supabase
          .from("keywords")
          .select("id,term,market,created_at")
          .eq("workspace_id", workspaceId)
          .eq("app_id", parsed.appId)
          .order("created_at", { ascending: true });
        if (retryErr) {
          return NextResponse.json(
            { ok: false, error: { code: "query_error", message: retryErr.message } },
            { status: 500 },
          );
        }
        const dupMatches = (retryRows ?? []).filter(
          (k) => normTerm(String(k.term ?? "")) === termNorm,
        );
        const rowPrimaryDup = dupMatches.find(
          (k) => normMarket(String(k.market ?? "")) === primaryMarket,
        );
        const chosenDup = rowPrimaryDup ?? dupMatches[0];
        if (!chosenDup?.id) {
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
        keywordId = chosenDup.id as string;
        createdKeyword = false;
        const currentDupM = normMarket(String(chosenDup.market ?? ""));
        if (currentDupM !== primaryMarket) {
          const otherHasPrimaryDup = dupMatches.some(
            (k) =>
              String(k.id) !== String(chosenDup.id) &&
              normMarket(String(k.market ?? "")) === primaryMarket,
          );
          if (!otherHasPrimaryDup) {
            const { error: updDupErr } = await supabase
              .from("keywords")
              .update({ market: primaryMarket })
              .eq("id", keywordId)
              .eq("workspace_id", workspaceId);
            if (updDupErr) {
              return NextResponse.json(
                { ok: false, error: { code: "update_error", message: updDupErr.message } },
                { status: 400 },
              );
            }
          } else if (rowPrimaryDup?.id) {
            keywordId = rowPrimaryDup.id as string;
          }
        }
      } else {
        keywordId = inserted.id as string;
        createdKeyword = true;
      }
    }
  }

  const snapshotRankByCountry =
    parsed.snapshotRanks && parsed.snapshotRanks.length > 0
      ? new Map(
          parsed.snapshotRanks.map((e) => [
            normMarket(String(e.country)),
            e.rank as number,
          ]),
        )
      : null;

  const rankForCountry = (cc: string): number => {
    const key = normMarket(cc);
    const serverRaw = resolveRankInCountryForSerperSnapshot(parsed.results, pkg, cc);
    const serverDb = rankForSnapshotInsert(serverRaw);
    const fromClient = snapshotRankByCountry?.get(key);
    if (fromClient != null && fromClient < SERPER_RANK_NOT_IN_FIRST_PAGE) {
      if (serverDb < SERPER_RANK_NOT_IN_FIRST_PAGE) return Math.min(fromClient, serverDb);
      return fromClient;
    }
    if (
      fromClient != null &&
      fromClient >= SERPER_RANK_NOT_IN_FIRST_PAGE &&
      serverDb < SERPER_RANK_NOT_IN_FIRST_PAGE
    ) {
      return serverDb;
    }
    if (fromClient != null) return fromClient;
    return serverDb;
  };

  const { data: competitorRows } = await supabase
    .from("workspace_competitor_analyses")
    .select("competitor_package_id")
    .eq("workspace_id", workspaceId)
    .order("analyzed_at", { ascending: false })
    .limit(2);

  const comp1Pkg =
    (competitorRows?.[0]?.competitor_package_id as string | undefined) ?? null;
  const comp2Pkg =
    (competitorRows?.[1]?.competitor_package_id as string | undefined) ?? null;

  const snapshotAt = new Date().toISOString();
  const rows = saveCountries.map((cc) => ({
    keyword_id: keywordId,
    rank: rankForCountry(cc),
    source: "serper" as const,
    country_code: cc,
    snapshot_at: snapshotAt,
    competitor_1_package: comp1Pkg,
    competitor_1_rank: comp1Pkg
      ? formatTrackedCompetitorRankForDb(
          resolveTrackedCompetitorRankInSerp(parsed.results, comp1Pkg, cc),
        )
      : null,
    competitor_2_package: comp2Pkg,
    competitor_2_rank: comp2Pkg
      ? formatTrackedCompetitorRankForDb(
          resolveTrackedCompetitorRankInSerp(parsed.results, comp2Pkg, cc),
        )
      : null,
  }));

  const { data: prevRows } = await supabase
    .from("keyword_rank_snapshots")
    .select("rank,snapshot_at,country_code")
    .eq("keyword_id", keywordId)
    .or(`country_code.is.null,country_code.eq.${primaryMarket}`)
    .order("snapshot_at", { ascending: false })
    .limit(1);

  const prevRank =
    prevRows && prevRows.length > 0 ? (prevRows[0].rank as number | null) : null;

  const primaryNewRank = rankForCountry(primaryMarket);

  const { data: snaps, error: snapErr } = await supabase
    .from("keyword_rank_snapshots")
    .insert(rows)
    .select("id,rank,snapshot_at,best_rank,source,country_code");

  if (snapErr || !snaps?.length) {
    if (createdKeyword) {
      await supabase.from("keywords").delete().eq("id", keywordId);
    }
    return NextResponse.json(
      { ok: false, error: { code: "insert_error", message: snapErr?.message ?? "Failed" } },
      { status: 400 },
    );
  }

  const primarySnap =
    snaps.find((s) => normMarket(String(s.country_code ?? "")) === primaryMarket) ?? snaps[0];

  await maybeCreateRankAlerts({
    supabase,
    workspaceId,
    keywordId,
    keywordTerm: termTrimmed,
    prevRank,
    newRank: primaryNewRank,
  });

  await captureKeywordAsoBaselineIfUnset(supabase, {
    keywordId,
    candidateRank: primaryNewRank,
    source: "initial_save",
  });

  await maybeCreateAsoRankImprovementAlert({
    supabase,
    workspaceId,
    keywordId,
    keywordTerm: termTrimmed,
    newPrimaryRank: primaryNewRank,
  });

  return NextResponse.json({
    ok: true,
    keywordId,
    createdKeyword,
    rank: primarySnap.rank,
    snapshotAt: primarySnap.snapshot_at,
    countries: saveCountries,
    creditsCharged: 0,
    route: ROUTE,
    message:
      "Ranks saved from your last preview. Saving does not use extra AI credits or another live fetch.",
  });
}
