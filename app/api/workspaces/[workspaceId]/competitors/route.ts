import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { normalizeStoredCompetitorFromAnalysisJson } from "@/lib/competitors/normalize-stored-competitor";
import { isPostgrestTableMissing } from "@/lib/supabase/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { saveCompetitorAnalysisBodySchema } from "@/lib/validation/competitor-analysis-body";

const COMPETITOR_ANALYSES_TABLE = "workspace_competitor_analyses";

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
    .from(COMPETITOR_ANALYSES_TABLE)
    .select(
      "id,competitor_package_id,competitor_name,category,icon_url,analysis_json,countries,analyzed_at",
    )
    .eq("workspace_id", workspaceId)
    .order("analyzed_at", { ascending: false })
    .limit(40);

  if (error) {
    if (isPostgrestTableMissing(error, COMPETITOR_ANALYSES_TABLE)) {
      console.warn(
        `[api/workspaces/${workspaceId}/competitors] GET: ${COMPETITOR_ANALYSES_TABLE} missing; apply migration 20260516100000_workspace_competitor_analyses.sql`,
        error,
      );
      return NextResponse.json({ ok: true, competitors: [] });
    }
    console.error(`[api/workspaces/${workspaceId}/competitors] GET query failed:`, error);
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message ?? "Query failed" } },
      { status: 500 },
    );
  }

  const competitors = (data ?? [])
    .map((row) => {
      const analysis = row.analysis_json;
      const queryFromJson =
        analysis &&
        typeof analysis === "object" &&
        !Array.isArray(analysis) &&
        typeof (analysis as Record<string, unknown>).query === "string"
          ? ((analysis as Record<string, unknown>).query as string)
          : "";
      const normalized = normalizeStoredCompetitorFromAnalysisJson(
        row.id as string,
        queryFromJson,
        row.competitor_name as string,
        row.competitor_package_id as string,
        analysis,
      );
      if (!normalized) return null;
      return {
        ...normalized,
        // syncStatus signals to the polling client that the DB read is settled.
        // "complete" means this row reflects the scraper's latest write — even when
        // topKeywords/shared arrays are empty (legitimate zero-overlap result).
        syncStatus: "complete" as const,
        countries: Array.isArray(row.countries) ? row.countries : [],
        analyzedAt: row.analyzed_at as string,
        category: (row.category as string | null) ?? null,
        iconUrl: (row.icon_url as string | null) ?? null,
        previewResults:
          row.analysis_json &&
          typeof row.analysis_json === "object" &&
          !Array.isArray(row.analysis_json)
            ? (row.analysis_json as Record<string, unknown>).previewResults ?? null
            : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ ok: true, competitors });
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
    const parsed = saveCompetitorAnalysisBodySchema.parse(body);
    const pkg = parsed.packageId.trim().toLowerCase();

    // ── Preserve custom rows across re-analysis ─────────────────────────────
    // When a competitor is re-analyzed the incoming shared[] only contains
    // auto-detected overlap rows.  Any manually-added entries (isCustom: true)
    // that were previously merged by the custom-keyword route must be carried
    // forward so they survive upsert.
    type RawSharedRow = Record<string, unknown>;
    let incomingShared: RawSharedRow[] = Array.isArray(parsed.analysis.shared)
      ? (parsed.analysis.shared as RawSharedRow[])
      : [];

    try {
      const { data: existingRow } = await supabase
        .from(COMPETITOR_ANALYSES_TABLE)
        .select("analysis_json")
        .eq("workspace_id", workspaceId)
        .eq("competitor_package_id", pkg)
        .maybeSingle();

      if (existingRow?.analysis_json) {
        const existingJson = existingRow.analysis_json as Record<string, unknown>;
        const existingShared: RawSharedRow[] = Array.isArray(existingJson.shared)
          ? (existingJson.shared as RawSharedRow[])
          : [];

        // Collect isCustom rows from the existing DB record.
        const customRows = existingShared.filter((s) => s.isCustom === true);

        if (customRows.length > 0) {
          // Build a dedup set from the incoming automated rows (keyword+country key).
          const incomingKeys = new Set(
            incomingShared.map(
              (s) =>
                `${String(s.keyword ?? "").trim().toLowerCase()}|${String(s.country ?? "").trim().toLowerCase()}`,
            ),
          );
          // Append only custom rows that don't collide with an incoming automated row.
          const safeCustom = customRows.filter(
            (s) =>
              !incomingKeys.has(
                `${String(s.keyword ?? "").trim().toLowerCase()}|${String(s.country ?? "").trim().toLowerCase()}`,
              ),
          );
          incomingShared = [...incomingShared, ...safeCustom];
        }
      }
    } catch {
      // Non-fatal — proceed with the incoming shared as-is.
      console.warn(
        `[api/workspaces/${workspaceId}/competitors] POST: could not read existing row for custom-row preservation`,
      );
    }

    const analysisJson = {
      query: parsed.analysis.query,
      topKeywords: parsed.analysis.topKeywords,
      shared: incomingShared,
      quickWinPlans: parsed.analysis.quickWinPlans,
      quickWinTerms: parsed.analysis.quickWinTerms,
      gaps: parsed.analysis.gaps,
      previewResults: parsed.analysis.previewResults ?? undefined,
    };

    const { data, error } = await supabase
      .from(COMPETITOR_ANALYSES_TABLE)
      .upsert(
        {
          workspace_id: workspaceId,
          competitor_package_id: pkg,
          competitor_name: parsed.displayName.trim(),
          category: parsed.category?.trim() || null,
          icon_url: parsed.iconUrl?.trim() || null,
          analysis_json: analysisJson,
          countries: parsed.countries.map((c) => c.toLowerCase()),
          analyzed_at: new Date().toISOString(),
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,competitor_package_id" },
      )
      .select("id,analyzed_at")
      .single();

    if (error) {
      if (isPostgrestTableMissing(error, COMPETITOR_ANALYSES_TABLE)) {
        console.warn(
          `[api/workspaces/${workspaceId}/competitors] POST: ${COMPETITOR_ANALYSES_TABLE} missing; apply migration 20260516100000_workspace_competitor_analyses.sql`,
          error,
        );
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "schema_unavailable",
              message:
                "Competitor persistence is unavailable until migration 20260516100000_workspace_competitor_analyses is applied.",
            },
          },
          { status: 503 },
        );
      }
      console.error(`[api/workspaces/${workspaceId}/competitors] POST upsert failed:`, error);
      return NextResponse.json(
        { ok: false, error: { code: "upsert_error", message: error.message ?? "Upsert failed" } },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: data.id as string,
      analyzedAt: data.analyzed_at as string,
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation_error", message: "Invalid body", details: e.flatten() },
        },
        { status: 400 },
      );
    }
    throw e;
  }
}
