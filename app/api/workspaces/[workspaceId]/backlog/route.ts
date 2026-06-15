import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE = "POST /api/workspaces/[workspaceId]/backlog";
const TABLE = "workspace_listing_backlog";

type Ctx = { params: Promise<{ workspaceId: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// Validation schema
// ─────────────────────────────────────────────────────────────────────────────

const backlogBodySchema = z.object({
  /** Android package identifier — own app or competitor. */
  packageName: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i,
      "Must be a valid Android package name (e.g. com.example.app)",
    ),

  /** ISO 3166-1 alpha-2 market code (lowercase). Default "us". */
  countryCode: z
    .string()
    .trim()
    .toLowerCase()
    .length(2)
    .optional()
    .default("us"),

  /** IssueItem.title — action-oriented, ≤ 60 chars. */
  title: z.string().trim().min(1).max(60),

  /** IssueItem.description — one dense sentence, ≤ 300 chars. */
  description: z.string().trim().min(1).max(300),

  /** IssueItem.severity enum. */
  severity: z.enum(["CRITICAL", "MEDIUM", "LOW"]).default("MEDIUM"),

  /**
   * IssueItem.impact — fraction [0.0–1.0].
   * Stored as-is; multiply by 100 for % display in any downstream UI.
   */
  impact: z.number().min(0).max(1).default(0),
});

type BacklogBody = z.infer<typeof backlogBodySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/workspaces/[workspaceId]/backlog
//
// Persists a single IssueCard entry into workspace_listing_backlog.
//
// Idempotent: a unique index on (workspace_id, package_name, country_code,
// issue_title) means a duplicate add returns the existing row instead of a 409.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, context: Ctx) {
  const { workspaceId } = await context.params;

  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { success: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  // ── Body parse ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  let input: BacklogBody;
  try {
    input = backlogBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "validation_error", message: "Invalid input.", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  // ── Upsert — idempotent on dedup index ─────────────────────────────────────
  //
  // onConflict targets the unique index (workspace_id, package_name,
  // country_code, issue_title).  A duplicate add updates nothing but returns
  // the existing row so the client gets a consistent item shape.
  const { data: item, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        workspace_id:      workspaceId,
        package_name:      input.packageName,
        country_code:      input.countryCode,
        issue_title:       input.title,
        issue_description: input.description,
        severity:          input.severity,
        impact:            input.impact,
        added_by:          user.id,
      },
      {
        onConflict:      "workspace_id,package_name,country_code,issue_title",
        ignoreDuplicates: false,
      },
    )
    .select("id, workspace_id, package_name, country_code, issue_title, issue_description, severity, impact, created_at")
    .single();

  if (error) {
    console.error(`[${ROUTE}] upsert failed:`, error.message);
    return NextResponse.json(
      { success: false, error: { code: "db_error", message: "Failed to save to backlog." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, item }, { status: 201 });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/workspaces/[workspaceId]/backlog
//
// Returns all backlog items for the workspace, ordered by creation date desc.
// Useful for a future "My Optimisation Queue" view.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest, context: Ctx) {
  const { workspaceId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { success: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  const { data: items, error } = await supabase
    .from(TABLE)
    .select("id, package_name, country_code, issue_title, issue_description, severity, impact, is_implemented, metadata, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`[${ROUTE}] fetch failed:`, error.message);
    return NextResponse.json(
      { success: false, error: { code: "db_error", message: "Failed to fetch backlog." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, items: items ?? [] });
}
