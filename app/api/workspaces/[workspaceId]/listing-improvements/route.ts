import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isPostgrestTableMissing } from "@/lib/supabase/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { saveListingImprovementBodySchema } from "@/lib/validation/listing-improvement-body";

const TABLE = "workspace_listing_improvements";

type Ctx = { params: Promise<{ workspaceId: string }> };

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

  const url = new URL(request.url);
  const unutilizedOnly = url.searchParams.get("unutilized") === "1";

  let query = supabase
    .from(TABLE)
    .select(
      "id,review_id,review_text,user_name,score,sentiment_tag,app_id,package_name,is_utilized,created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (unutilizedOnly) {
    query = query.eq("is_utilized", false);
  }

  const { data, error } = await query;

  if (error) {
    if (isPostgrestTableMissing(error, TABLE)) {
      console.warn(
        `[api/workspaces/${workspaceId}/listing-improvements] GET: ${TABLE} missing; apply migration 20260519120000_workspace_listing_improvements.sql`,
        error,
      );
      return NextResponse.json({ ok: true, items: [] });
    }
    console.error(`[api/workspaces/${workspaceId}/listing-improvements] GET failed:`, error);
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message ?? "Query failed" } },
      { status: 500 },
    );
  }

  const items = (data ?? []).map((row) => ({
    id: row.id as string,
    reviewId: row.review_id as string,
    reviewText: row.review_text as string,
    userName: row.user_name as string,
    score: row.score as number,
    sentimentTag: row.sentiment_tag as string,
    appId: (row.app_id as string | null) ?? null,
    packageName: (row.package_name as string | null) ?? null,
    isUtilized: row.is_utilized as boolean,
    createdAt: row.created_at as string,
  }));

  return NextResponse.json({ ok: true, items });
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
    const parsed = saveListingImprovementBodySchema.parse(body);

    let resolvedPackageName = parsed.packageName?.trim() ?? null;
    if (parsed.appId) {
      const { data: appRow, error: appError } = await supabase
        .from("apps")
        .select("id,package_name")
        .eq("id", parsed.appId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (appError) {
        console.error(
          `[api/workspaces/${workspaceId}/listing-improvements] app lookup failed:`,
          appError,
        );
        return NextResponse.json(
          { ok: false, error: { code: "query_error", message: appError.message ?? "App lookup failed" } },
          { status: 500 },
        );
      }
      if (!appRow) {
        return NextResponse.json(
          { ok: false, error: { code: "not_found", message: "App not found in workspace" } },
          { status: 404 },
        );
      }
      if (!resolvedPackageName && typeof appRow.package_name === "string" && appRow.package_name.trim()) {
        resolvedPackageName = appRow.package_name.trim();
      }
    }

    const { error } = await supabase.from(TABLE).upsert(
      {
        workspace_id: workspaceId,
        user_id: user.id,
        review_id: parsed.reviewId.trim(),
        review_text: parsed.reviewText.trim(),
        user_name: parsed.userName.trim(),
        score: parsed.score,
        sentiment_tag: parsed.sentimentTag?.trim() || "Competitor Weakness",
        app_id: parsed.appId ?? null,
        package_name: resolvedPackageName,
        is_utilized: false,
      },
      { onConflict: "workspace_id,review_id" },
    );

    if (error) {
      if (isPostgrestTableMissing(error, TABLE)) {
        console.warn(
          `[api/workspaces/${workspaceId}/listing-improvements] POST: ${TABLE} missing; apply migration 20260519120000_workspace_listing_improvements.sql`,
          error,
        );
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "schema_unavailable",
              message:
                "Listing improvements queue is unavailable until migration 20260519120000_workspace_listing_improvements is applied.",
            },
          },
          { status: 503 },
        );
      }
      console.error(`[api/workspaces/${workspaceId}/listing-improvements] POST upsert failed:`, error);
      return NextResponse.json(
        { ok: false, error: { code: "upsert_error", message: error.message ?? "Upsert failed" } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
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
