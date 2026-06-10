/**
 * GET/POST /api/workspaces/[workspaceId]/staging/vault
 *
 * Universal Vault API - Access and manage staging state
 *
 * ✅ BACKWARD COMPATIBLE:
 * - Existing /staging/add, /staging/delete routes continue working
 * - New /staging/vault provides low-level vault access
 * - Both routes can coexist without conflicts
 *
 * Features:
 * - GET: Fetch vault state (EN or AR)
 * - POST: Update vault via producer registry
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { vaultRouter } from "@/lib/staging/vault-router";

const ROUTE = "GET/POST /api/workspaces/[workspaceId]/staging/vault";

const getQuerySchema = z.object({
  appId: z.string().uuid(),
  locale: z.enum(["en", "ar"]).optional(),
});

const postBodySchema = z.object({
  appId: z.string().uuid(),
  locale: z.enum(["en", "ar"]),
  feature: z.string().min(1).max(100),
  payload: z.any(), // Feature-specific payload
});

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET: Fetch vault state
 * Returns entire vault or specific locale
 */
export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  try {
    const url = new URL(request.url);
    const query = getQuerySchema.parse({
      appId: url.searchParams.get("appId"),
      locale: url.searchParams.get("locale"),
    });

    console.log(`[${ROUTE}] GET vault:`, {
      workspaceId,
      appId: query.appId,
      locale: query.locale,
    });

    // Get vault via router
    const vault = await vaultRouter.getVault(workspaceId, query.appId);

    if (!vault) {
      return NextResponse.json(
        { ok: false, error: { code: "not_found", message: "Vault not found" } },
        { status: 404 }
      );
    }

    // Return specific locale or both
    const response = query.locale
      ? query.locale === "en"
        ? { state: vault.state_en, locale: "en" }
        : { state: vault.state_ar, locale: "ar" }
      : {
          state_en: vault.state_en,
          state_ar: vault.state_ar,
          metadata: {
            vaultId: vault.id,
            createdAt: vault.created_at,
            updatedAt: vault.updated_at,
            activeFeatures: vault.active_features,
            changeCount: vault.change_count,
          },
        };

    return NextResponse.json({
      ok: true,
      data: response,
    });
  } catch (error) {
    console.error(`[${ROUTE}] GET Error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { ok: false, error: { code: "fetch_error", message } },
      { status: 500 }
    );
  }
}

/**
 * POST: Update vault via producer
 * Routes request to correct producer, maintains isolation
 */
export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  let body;
  try {
    body = postBodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation",
            message: err.errors[0]?.message ?? "Invalid request",
          },
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 }
    );
  }

  try {
    console.log(`[${ROUTE}] POST vault update:`, {
      workspaceId,
      appId: body.appId,
      locale: body.locale,
      feature: body.feature,
    });

    // Route through vault router to producer
    const response = await vaultRouter.routeProducerRequest({
      locale: body.locale,
      userId: user.id,
      workspaceId,
      appId: body.appId,
      feature: body.feature,
      payload: body.payload,
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: response.error },
        { status: 500 }
      );
    }

    console.log(`[${ROUTE}] ✅ Update successful:`, {
      feature: body.feature,
      locale: body.locale,
    });

    return NextResponse.json({
      ok: true,
      data: response.data,
    });
  } catch (error) {
    console.error(`[${ROUTE}] POST Error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { ok: false, error: { code: "update_error", message } },
      { status: 500 }
    );
  }
}
