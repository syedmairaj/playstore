import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { keywordsBulkBodySchema } from "@/lib/validation/keywords-bulk-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string }> };

function normalizeDedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const n = raw.trim();
    if (n.length < 1) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
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

  let parsed: ReturnType<typeof keywordsBulkBodySchema.parse>;
  try {
    parsed = keywordsBulkBodySchema.parse(body);
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

  const { terms, appId, listingGenerationId } = parsed;
  const market = parsed.market ?? "us";
  const locale = parsed.locale ?? "en-US";

  const { data: appRow, error: appErr } = await supabase
    .from("apps")
    .select("id")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (appErr || !appRow) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_app", message: "App not found in this workspace." } },
      { status: 400 },
    );
  }

  const { data: genRow, error: genErr } = await supabase
    .from("listing_generations")
    .select("id, workspace_id, app_id")
    .eq("id", listingGenerationId)
    .maybeSingle();
  if (genErr || !genRow || genRow.workspace_id !== workspaceId) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "invalid_generation", message: "Listing generation not found." },
      },
      { status: 400 },
    );
  }
  if (genRow.app_id && genRow.app_id !== appId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "generation_app_mismatch",
          message: "This keyword batch belongs to a different app.",
        },
      },
      { status: 400 },
    );
  }

  const normalizedTerms = normalizeDedupeTerms(terms);
  if (normalizedTerms.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        added: [],
        skippedDuplicates: [],
        creditsCharged: 0,
        message: "no_new_terms",
      },
      { status: 200 },
    );
  }

  const { data: existingRows } = await supabase
    .from("keywords")
    .select("term")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .eq("market", market);

  const existingKeys = new Set(
    (existingRows ?? []).map((r) => String(r.term ?? "").trim().toLowerCase()),
  );

  const skippedDuplicates: string[] = [];
  const pending: string[] = [];
  for (const t of normalizedTerms) {
    const key = t.toLowerCase();
    if (existingKeys.has(key)) {
      skippedDuplicates.push(t);
    } else {
      pending.push(t);
      existingKeys.add(key);
    }
  }

  if (pending.length === 0) {
    return NextResponse.json({
      ok: true,
      added: [],
      skippedDuplicates,
      creditsCharged: 0,
    });
  }

  const added: { id: string; term: string }[] = [];

  try {
    for (const term of pending) {
      const { data: keyword, error: insErr } = await supabase
        .from("keywords")
        .insert({
          workspace_id: workspaceId,
          app_id: appId,
          term,
          market,
          locale,
          source: "ai_listing",
          listing_generation_id: listingGenerationId,
        })
        .select("id,term")
        .single();

      if (insErr || !keyword) {
        const dup =
          insErr?.code === "23505" ||
          /duplicate key|keywords_unique_term_per_app/i.test(insErr?.message ?? "");
        if (dup) {
          skippedDuplicates.push(term);
          continue;
        }
        throw new Error(insErr?.message ?? "insert_error");
      }

      added.push({ id: keyword.id as string, term: keyword.term as string });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json(
      { ok: false, error: { code: "insert_error", message: msg } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    added,
    skippedDuplicates,
    creditsCharged: 0,
  });
}
