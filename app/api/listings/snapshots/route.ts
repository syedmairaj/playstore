import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

// ── Validation ────────────────────────────────────────────────────────────────

const snapshotBodySchema = z.object({
  workspaceId: z.string().uuid(),
  appId: z.string().uuid().optional(),
  generationId: z.string().uuid().optional(),

  // Listing copy
  title: z.string().min(1).max(30),
  shortDescription: z.string().min(1).max(80),
  fullDescription: z.string().min(1).max(4000),

  // Signals (Active Context pills at generation time)
  // Format: review issues as plain labels, market as "market_spotlight:kw"
  signals: z.array(z.string().max(200)).max(60).default([]),

  // Strategy meta
  strategySummary: z.string().max(400).optional(),
  asoScore: z.number().int().min(0).max(100).optional(),
  promptVersion: z.string().max(80).optional(),
  toneStyle: z.enum(["professional", "friendly", "bold", "minimal"]).optional(),
  qualityStatus: z.enum(["maximum", "partial"]).optional(),
});

// ── POST /api/listings/snapshots ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input: z.infer<typeof snapshotBodySchema>;
  try {
    input = snapshotBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  const role = await getWorkspaceRole(supabase, input.workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  // Compute signal type counts for fast attribution queries
  const reviewSignalCount = input.signals.filter(
    (s) => !s.startsWith("market_spotlight:"),
  ).length;
  const marketSignalCount = input.signals.filter(
    (s) => s.startsWith("market_spotlight:"),
  ).length;
  // competitor signals are stored without a prefix (passed via competitorWeaknesses)
  // — we can't reliably distinguish them from review signals server-side without
  // additional metadata. For now market+review cover the key attribution split.
  const competitorSignalCount = 0;

  const { data, error } = await supabase
    .from("listing_snapshots")
    .insert({
      workspace_id: input.workspaceId,
      app_id: input.appId ?? null,
      user_id: user.id,
      generation_id: input.generationId ?? null,
      title: input.title,
      short_description: input.shortDescription,
      full_description: input.fullDescription,
      signals: input.signals,
      review_signal_count: reviewSignalCount,
      market_signal_count: marketSignalCount,
      competitor_signal_count: competitorSignalCount,
      strategy_summary: input.strategySummary ?? null,
      aso_score: input.asoScore ?? null,
      prompt_version: input.promptVersion ?? null,
      tone_style: input.toneStyle ?? null,
      quality_status: input.qualityStatus ?? null,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("[snapshots] insert error:", error?.message);
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Failed to save snapshot." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, snapshotId: data.id, createdAt: data.created_at });
}

// ── GET /api/listings/snapshots?workspaceId=&appId= ───────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const appId = searchParams.get("appId");

  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "workspaceId required." } },
      { status: 400 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  let query = supabase
    .from("listing_snapshots")
    .select(
      "id, created_at, title, short_description, full_description, signals, " +
      "review_signal_count, market_signal_count, competitor_signal_count, " +
      "strategy_summary, aso_score, tone_style, quality_status, generation_id",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (appId) {
    query = query.eq("app_id", appId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, snapshots: data ?? [] });
}
