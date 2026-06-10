/**
 * GET/POST /api/workspaces/[workspaceId]/experiments/snapshots
 *
 * Manage experiment snapshots (baseline & variants) for A/B testing.
 *
 * GET: Fetch all snapshots for an app
 * POST: Create baseline or variant snapshot
 *
 * POST Request (Baseline):
 * {
 *   "action": "create_baseline",
 *   "appId": string,
 *   "title": string,
 *   "shortDescription": string,
 *   "fullDescription": string,
 *   "language": "en" | "ar",
 *   "previewImageUrl": string (optional)
 * }
 *
 * POST Request (Variant):
 * {
 *   "action": "create_variant",
 *   "appId": string,
 *   "baselineSnapshotId": string,
 *   "variantName": string,
 *   "changes": { fieldName: newValue },
 *   "hypothesis": string,
 *   "language": "en" | "ar"
 * }
 *
 * POST Request (Record Metrics):
 * {
 *   "action": "record_metrics",
 *   "snapshotId": string,
 *   "weekNumber": number,
 *   "impressions": number,
 *   "installs": number,
 *   "uninstalls": number,
 *   "crashRate": number,
 *   "rating": number,
 *   "reviews": number,
 *   "metricsSource": "manual" | "google_play_api"
 * }
 *
 * POST Request (Publish Variant):
 * {
 *   "action": "publish_variant",
 *   "snapshotId": string
 * }
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { ExperimentSnapshotsService } from "@/lib/experiment/experiment-snapshots-service";

const ROUTE = "POST /api/workspaces/[workspaceId]/experiments/snapshots";

const createBaselineSchema = z.object({
  action: z.literal("create_baseline"),
  appId: z.string().uuid(),
  title: z.string().min(1).max(50),
  shortDescription: z.string().min(1).max(80),
  fullDescription: z.string().min(1).max(4000),
  language: z.enum(["en", "ar"]),
  previewImageUrl: z.string().url().optional(),
});

const createVariantSchema = z.object({
  action: z.literal("create_variant"),
  appId: z.string().uuid(),
  baselineSnapshotId: z.string().uuid(),
  variantName: z.string().min(1).max(100),
  changes: z.record(z.string()),
  hypothesis: z.string().min(1).max(500),
  language: z.enum(["en", "ar"]),
});

const recordMetricsSchema = z.object({
  action: z.literal("record_metrics"),
  snapshotId: z.string().uuid(),
  weekNumber: z.number().int().positive(),
  impressions: z.number().int().nonnegative(),
  installs: z.number().int().nonnegative(),
  uninstalls: z.number().int().nonnegative(),
  crashRate: z.number().min(0).max(100),
  rating: z.number().min(0).max(5),
  reviews: z.number().int().nonnegative(),
  metricsSource: z.enum(["manual", "google_play_api"]),
});

const publishVariantSchema = z.object({
  action: z.literal("publish_variant"),
  snapshotId: z.string().uuid(),
});

const bodySchema = z.union([
  createBaselineSchema,
  createVariantSchema,
  recordMetricsSchema,
  publishVariantSchema,
]);

const getQuerySchema = z.object({
  appId: z.string().uuid(),
  type: z.enum(["baseline", "variant"]).optional(),
  // Parity fix: callers must pass ?language=en|ar so the service filters
  // snapshots to the correct locale branch of workspace_staging_vault.
  language: z.enum(["en", "ar"]).optional(),
});

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
      type: url.searchParams.get("type"),
      language: url.searchParams.get("language"),
    });

    console.log(`[${ROUTE}] GET snapshots:`, {
      workspaceId,
      appId: query.appId,
      type: query.type,
      language: query.language,
    });

    const service = new ExperimentSnapshotsService(query.appId, workspaceId);
    await service.init();

    const snapshots = await service.getSnapshots({
      type: query.type,
      language: query.language,
    });

    return NextResponse.json({
      ok: true,
      data: snapshots,
    });
  } catch (error) {
    console.error(`[${ROUTE}] GET Error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "fetch_error",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
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

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
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
    const service = new ExperimentSnapshotsService(
      body.appId,
      workspaceId
    );
    await service.init();

    // Create baseline
    if (body.action === "create_baseline") {
      console.log(`[${ROUTE}] 📸 Creating baseline snapshot`);

      const baseline = await service.createBaseline(
        body.title,
        body.shortDescription,
        body.fullDescription,
        body.language,
        body.previewImageUrl
      );

      return NextResponse.json({
        ok: true,
        data: baseline,
      });
    }

    // Create variant
    if (body.action === "create_variant") {
      console.log(`[${ROUTE}] 🔄 Creating variant snapshot: ${body.variantName}`);

      const variant = await service.createVariant(
        body.baselineSnapshotId,
        body.variantName,
        body.changes,
        body.hypothesis,
        body.language
      );

      return NextResponse.json({
        ok: true,
        data: variant,
      });
    }

    // Record metrics
    if (body.action === "record_metrics") {
      console.log(`[${ROUTE}] 📊 Recording metrics for week ${body.weekNumber}`);

      const metrics = await service.recordWeeklyMetrics(body.snapshotId, body.weekNumber, {
        impressions: body.impressions,
        installs: body.installs,
        uninstalls: body.uninstalls,
        crashRate: body.crashRate,
        rating: body.rating,
        reviews: body.reviews,
        metricsSource: body.metricsSource,
      });

      return NextResponse.json({
        ok: true,
        data: metrics,
      });
    }

    // Publish variant
    if (body.action === "publish_variant") {
      console.log(`[${ROUTE}] 🚀 Publishing variant`);

      const published = await service.publishVariant(body.snapshotId);

      return NextResponse.json({
        ok: true,
        data: published,
      });
    }

    return NextResponse.json(
      { ok: false, error: { code: "invalid_action", message: "Unknown action" } },
      { status: 400 }
    );
  } catch (error) {
    console.error(`[${ROUTE}] ❌ Error:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "snapshot_error",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
