/**
 * POST / DELETE /api/workspaces/[workspaceId]/staging-vault/keywords
 *
 * Stage or remove keyword_validator signals in workspace_staging_vault.
 * Direct JSONB patch (same pattern as live-rank route) — avoids vaultRouter import.
 *
 * Producer isolation: only touches state_{locale}.features.keyword_validator.signals.[keyword]
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST/DELETE /api/workspaces/[workspaceId]/staging-vault/keywords";

const postBodySchema = z.object({
  appId: z.string().uuid(),
  locale: z.enum(["en", "ar"]).default("en"),
  keyword: z.string().min(1).max(200),
  difficulty: z.number().min(0).max(10),
  confidence: z.number().min(0).max(100),
  searchVolume: z.number().min(0),
  competition: z.number().min(0).max(100).optional(),
  monthlyInstalls: z
    .object({
      low: z.number(),
      realistic: z.number(),
      high: z.number(),
    })
    .optional(),
  recommendation: z.string().optional(),
});

const deleteBodySchema = z.object({
  appId: z.string().uuid(),
  locale: z.enum(["en", "ar"]).default("en"),
  keyword: z.string().min(1).max(200),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

async function authorize(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return { error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();
  const auth = await authorize(supabase, workspaceId);
  if ("error" in auth && auth.error) return auth.error;
  const { user } = auth as { user: { id: string } };

  let body: z.infer<typeof postBodySchema>;
  try {
    body = postBodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof ZodError ? err.errors[0]?.message ?? "Invalid request" : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  const stateKey = body.locale === "ar" ? "state_ar" : "state_en";
  const now = new Date().toISOString();
  const keywordKey = body.keyword.trim();

  try {
    const { data: vaultRow } = await supabase
      .from("workspace_staging_vault")
      .select(`id, ${stateKey}, change_count, active_features`)
      .eq("workspace_id", workspaceId)
      .eq("app_id", body.appId)
      .is("deleted_at", null)
      .maybeSingle();

    const signalEntry = {
      keyword: keywordKey,
      difficulty: body.difficulty,
      confidence: body.confidence,
      search_volume: body.searchVolume,
      competition: body.competition ?? 0,
      monthly_installs: body.monthlyInstalls ?? null,
      recommendation: body.recommendation ?? null,
      staged_at: now,
    };

    if (vaultRow) {
      const currentState = (vaultRow[stateKey as keyof typeof vaultRow] ?? {}) as Record<
        string,
        unknown
      >;
      const features = (currentState.features ?? {}) as Record<string, unknown>;
      const kvFeature = (features.keyword_validator ?? {}) as Record<string, unknown>;
      const signals = (kvFeature.signals ?? {}) as Record<string, unknown>;
      const existing = (signals[keywordKey] ?? {}) as Record<string, unknown>;

      const updatedState: Record<string, unknown> = {
        ...currentState,
        features: {
          ...features,
          keyword_validator: {
            ...kvFeature,
            signals: {
              ...signals,
              [keywordKey]: {
                ...existing,
                ...signalEntry,
              },
            },
          },
        },
      };

      const activeFeatures = Array.isArray(vaultRow.active_features)
        ? [...new Set([...(vaultRow.active_features as string[]), "keyword_validator"])]
        : ["keyword_validator"];

      await supabase
        .from("workspace_staging_vault")
        .update({
          [stateKey]: updatedState,
          updated_at: now,
          change_count: ((vaultRow.change_count as number) ?? 0) + 1,
          last_modified_by: user.id,
          active_features: activeFeatures,
        })
        .eq("workspace_id", workspaceId)
        .eq("app_id", body.appId);
    } else {
      const newState = {
        features: {
          keyword_validator: {
            signals: {
              [keywordKey]: signalEntry,
            },
          },
        },
        metadata: {
          workspace_id: workspaceId,
          app_id: body.appId,
          locale: body.locale,
          schema_version: "1.0",
          last_producer: "keyword_validator",
          last_producer_timestamp: now,
          feature_count: 1,
          total_bytes: 0,
          dirty_flags: {},
        },
      };

      await supabase.from("workspace_staging_vault").insert({
        workspace_id: workspaceId,
        app_id: body.appId,
        state_en:
          body.locale === "en"
            ? newState
            : { features: {}, metadata: { locale: "en", schema_version: "1.0" } },
        state_ar:
          body.locale === "ar"
            ? newState
            : { features: {}, metadata: { locale: "ar", schema_version: "1.0" } },
        last_modified_by: user.id,
        change_count: 1,
        active_features: ["keyword_validator"],
      });
    }

    console.info(`[${ROUTE}] Staged keyword "${keywordKey}" for app ${body.appId}`);

    return NextResponse.json({
      ok: true,
      keyword: keywordKey,
      stagedAt: now,
    });
  } catch (err) {
    console.error(`[${ROUTE}] POST error:`, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Staging failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();
  const auth = await authorize(supabase, workspaceId);
  if ("error" in auth && auth.error) return auth.error;
  const { user } = auth as { user: { id: string } };

  let body: z.infer<typeof deleteBodySchema>;
  try {
    body = deleteBodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof ZodError ? err.errors[0]?.message ?? "Invalid request" : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  const stateKey = body.locale === "ar" ? "state_ar" : "state_en";
  const keywordKey = body.keyword.trim();
  const now = new Date().toISOString();

  try {
    const { data: vaultRow } = await supabase
      .from("workspace_staging_vault")
      .select(`id, ${stateKey}, change_count`)
      .eq("workspace_id", workspaceId)
      .eq("app_id", body.appId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!vaultRow) {
      return NextResponse.json({ ok: true, removed: false });
    }

    const currentState = (vaultRow[stateKey as keyof typeof vaultRow] ?? {}) as Record<
      string,
      unknown
    >;
    const features = (currentState.features ?? {}) as Record<string, unknown>;
    const kvFeature = (features.keyword_validator ?? {}) as Record<string, unknown>;
    const signals = { ...(kvFeature.signals as Record<string, unknown> | undefined) };

    if (!(keywordKey in signals)) {
      return NextResponse.json({ ok: true, removed: false });
    }

    delete signals[keywordKey];

    const updatedState: Record<string, unknown> = {
      ...currentState,
      features: {
        ...features,
        keyword_validator: {
          ...kvFeature,
          signals,
        },
      },
    };

    await supabase
      .from("workspace_staging_vault")
      .update({
        [stateKey]: updatedState,
        updated_at: now,
        change_count: ((vaultRow.change_count as number) ?? 0) + 1,
        last_modified_by: user.id,
      })
      .eq("workspace_id", workspaceId)
      .eq("app_id", body.appId);

    console.info(`[${ROUTE}] Removed keyword "${keywordKey}" from app ${body.appId}`);

    return NextResponse.json({ ok: true, removed: true, keyword: keywordKey });
  } catch (err) {
    console.error(`[${ROUTE}] DELETE error:`, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Removal failed" },
      { status: 500 }
    );
  }
}
