/**
 * GET /api/workspaces/[workspaceId]/staging-vault/keyword-signals
 *
 * Returns parsed keyword_validator signals for Active Context panel.
 * English dashboard reads state_en; pass locale=ar for Arabic listing flows.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  parseKeywordSignalsFromState,
  groupKeywordSignals,
  type KeywordSignal,
} from "@/lib/staging/keyword-signals";

const ROUTE = "GET /api/workspaces/[workspaceId]/staging-vault/keyword-signals";

const querySchema = z.object({
  appId: z.string().uuid(),
  locale: z.enum(["en", "ar"]).default("en"),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      appId: url.searchParams.get("appId"),
      locale: url.searchParams.get("locale") ?? "en",
    });

    const stateKey = query.locale === "ar" ? "state_ar" : "state_en";

    const { data: vaultRow, error } = await supabase
      .from("workspace_staging_vault")
      .select(stateKey)
      .eq("workspace_id", workspaceId)
      .eq("app_id", query.appId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error(`[${ROUTE}] DB error:`, error.message);
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }

    const state = vaultRow?.[stateKey as keyof typeof vaultRow] as
      | Record<string, unknown>
      | undefined;

    const signals: KeywordSignal[] = parseKeywordSignalsFromState(state);
    const grouped = groupKeywordSignals(signals);

    return NextResponse.json({
      ok: true,
      signals,
      grouped,
      total: signals.length,
      locale: query.locale,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: err.errors[0]?.message ?? "Invalid query" },
        { status: 422 }
      );
    }
    console.error(`[${ROUTE}] Error:`, err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
