/**
 * GET /api/workspaces/[workspaceId]/optimizer/context
 *
 * Returns staged signals for AI Listing Optimizer Active Context.
 * Reads universal vault rows (state_en / state_ar JSONB) — not legacy signal_type columns.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  flattenVaultToActiveItems,
  flattenVaultToArchivedItems,
  type VaultRowForContext,
  type VaultLocale,
} from "@/lib/staging/optimizer-context-adapter";

type Ctx = { params: Promise<{ workspaceId: string }> };

const ROUTE = "GET /api/workspaces/[workspaceId]/optimizer/context";

const querySchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
});

export async function GET(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          code: "auth_required",
          message: "You must be logged in to access this resource",
        },
        { status: 401 }
      );
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json(
        {
          error: "Forbidden",
          code: "not_workspace_member",
          message: "You do not have access to this workspace",
        },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    let query: z.infer<typeof querySchema>;
    try {
      query = querySchema.parse({
        locale: url.searchParams.get("locale") ?? "en",
        appId: url.searchParams.get("appId") ?? undefined,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Validation error", code: "validation", message: err.errors[0]?.message },
          { status: 422 }
        );
      }
      throw err;
    }

    const locale = query.locale as VaultLocale;

    let dbQuery = supabase
      .from("workspace_staging_vault")
      .select("id, app_id, state_en, state_ar, updated_at, deleted_at, is_deleted")
      .eq("workspace_id", workspaceId);

    if (query.appId) {
      dbQuery = dbQuery.eq("app_id", query.appId);
    }

    const { data: vaultRows, error: fetchError } = await dbQuery;

    if (fetchError) {
      console.error(`[${ROUTE}] Database fetch error:`, fetchError.message);
      return NextResponse.json(
        {
          error: "Database Error",
          code: "db_fetch_failed",
          message: "Failed to fetch staging vault",
          details: fetchError.message,
        },
        { status: 500 }
      );
    }

    const rows = (vaultRows ?? []) as VaultRowForContext[];
    const activeItems = flattenVaultToActiveItems(rows, locale);
    const archivedItems = flattenVaultToArchivedItems(rows, locale);

    const stats = {
      totalStaged: activeItems.length,
      totalArchived: archivedItems.length,
      lastSyncAt: new Date().toISOString(),
    };

    return NextResponse.json(
      {
        activeItems,
        archivedItems,
        stats,
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch (error) {
    console.error(`[${ROUTE}] Unexpected error:`, error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        code: "internal_error",
        message: "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
