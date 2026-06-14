/**
 * GET /api/workspaces/[workspaceId]/staging-vault/keyword-signals
 *
 * Schema-aware keyword signals for Active Context / ASO Sandbox.
 * Universal vault: locale-isolated state_en / state_ar.
 * Legacy vault: content column JSON fallback (global fetch + locale filter).
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  fetchKeywordSignalsForApp,
  groupKeywordSignals,
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

    const { signals, source } = await fetchKeywordSignalsForApp(supabase, {
      workspaceId,
      appId: query.appId,
      locale: query.locale,
    });

    const grouped = groupKeywordSignals(signals);

    return NextResponse.json({
      ok: true,
      signals,
      grouped,
      total: signals.length,
      locale: query.locale,
      source,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: err.errors[0]?.message ?? "Invalid query" },
        { status: 422 },
      );
    }
    console.error(`[${ROUTE}] Error:`, err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
