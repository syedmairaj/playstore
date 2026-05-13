import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { createAppSchema } from "@/lib/validation/api";
import { canAddNewApp } from "@/lib/utils/app-limits";
import { queryWorkspaceAppsList } from "@/lib/workspace/workspace-apps-list";

type Ctx = { params: Promise<{ workspaceId: string }> };

const IS_DEV = process.env.NODE_ENV !== "production";

function logRouteDebug(
  label: string,
  payload: { code: string; message: string; details?: unknown },
) {
  if (!IS_DEV) return;
  console.error(`[POST /api/workspaces/[workspaceId]/apps] ${label}`, payload);
}

function zodErrorToResponsePayload(err: ZodError): {
  message: string;
  details: { issues: ZodError["issues"] };
} {
  const issues = err.issues;
  const parts = issues.map((i) => {
    const p = i.path.length ? i.path.join(".") : "body";
    return `${p}: ${i.message}`;
  });
  return {
    message: parts.length ? parts.join("; ") : "Invalid input",
    details: { issues },
  };
}

type PostgrestErrorShape = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

function logPostgrestInsertError(err: PostgrestErrorShape) {
  if (!IS_DEV) return;
  console.error("[POST /api/workspaces/[workspaceId]/apps] supabase_insert", {
    code: err.code ?? null,
    message: err.message ?? null,
    details: err.details ?? null,
    hint: err.hint ?? null,
  });
}

/** Postgres / PostgREST signals for missing columns (migrations not applied). */
function isPostgresUndefinedColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("42703") ||
    m.includes("undefined_column") ||
    (m.includes("column") && m.includes("does not exist"))
  );
}

/** RLS / privilege — PostgREST often surfaces PG `42501` or policy text in `message`. */
function isPermissionOrRlsDenied(err: PostgrestErrorShape): boolean {
  const code = String(err.code ?? "").trim();
  if (code === "42501") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("violates row-level security") ||
    (msg.includes("permission denied") &&
      (msg.includes("apps") || msg.includes("for table")))
  );
}

const INSERT_SCHEMA_SAFE_MESSAGE =
  "Unable to create the app right now. Please try again later.";

const PERMISSION_DENIED_SAFE_MESSAGE =
  "You don't have permission to add an app to this workspace.";

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
    if (IS_DEV) {
      logRouteDebug("membership_denied", {
        code: "forbidden",
        message: "Workspace not found or not a member",
        details: { workspaceId, userId: user.id },
      });
    }
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  const { rows, error } = await queryWorkspaceAppsList(supabase, workspaceId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, apps: rows });
}

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;

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
    const parsed = createAppSchema.parse(body ?? {});
    const eligibility = await canAddNewApp(workspaceId);
    if (!eligibility.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "plan_app_limit",
            message: eligibility.message ?? "App limit reached for your plan.",
            details: {
              currentCount: eligibility.currentCount,
              limit: eligibility.limit,
              plan: eligibility.plan,
            },
          },
        },
        { status: 403 },
      );
    }

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
      logRouteDebug("membership_denied", {
        code: "forbidden",
        message: "Workspace not found or not a member",
        details: { workspaceId, userId: user.id },
      });
      return NextResponse.json(
        { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
        { status: 403 },
      );
    }

    /**
     * Insert uses columns documented for `apps`: workspace_id, name, package_name, metadata (jsonb).
     * Request JSON uses flat ASO fields; `createAppSchema` maps them into `metadata` before insert.
     */
    const name = parsed.name.trim();
    const meta = parsed.metadata as Record<string, string>;
    const metaIcon = meta.icon_url?.trim();
    const insertPayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      name,
      package_name: parsed.package_name,
      metadata: parsed.metadata,
    };
    if (metaIcon && /^https:\/\//i.test(metaIcon)) {
      insertPayload.icon_url = metaIcon;
    }
    const { data, error } = await supabase
      .from("apps")
      .insert(insertPayload)
      .select("id,name,package_name,metadata,icon_url,created_at")
      .single();

    if (error || !data) {
      const pgErr = error ?? {};
      const raw = pgErr.message ?? "";
      logPostgrestInsertError(pgErr);
      if (isPostgresUndefinedColumnError(raw)) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "schema_mismatch",
              message: INSERT_SCHEMA_SAFE_MESSAGE,
            },
          },
          { status: 500 },
        );
      }
      if (isPermissionOrRlsDenied(pgErr)) {
        logRouteDebug("insert_rls_or_permission_denied", {
          code: "permission_denied",
          message: raw || PERMISSION_DENIED_SAFE_MESSAGE,
          details: {
            workspaceId,
            userId: user.id,
            pgCode: pgErr.code ?? null,
          },
        });
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "permission_denied",
              message: PERMISSION_DENIED_SAFE_MESSAGE,
            },
          },
          { status: 403 },
        );
      }
      const insertMsg =
        raw.length > 0 ? raw : "Could not create the app. Please try again.";
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "insert_error",
            message: insertMsg,
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, app: data }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) {
      const { message, details } = zodErrorToResponsePayload(e);
      logRouteDebug("validation_error", {
        code: "validation_error",
        message,
        details,
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation_error",
            message,
            details,
          },
        },
        { status: 400 },
      );
    }
    console.error("[POST /api/workspaces/[workspaceId]/apps]", e);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "internal_error",
          message: "Something went wrong. Please try again.",
        },
      },
      { status: 500 },
    );
  }
}
