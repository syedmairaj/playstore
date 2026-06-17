/**
 * GET/POST /api/workspaces/[workspaceId]/optimization-queue
 *
 * Curated optimization queue — single source of truth for Active Context & synthesis.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  addToOptimizationQueue,
  buildOptimizationQueueStats,
  readOptimizationQueue,
} from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";

type Ctx = { params: Promise<{ workspaceId: string }> };

const ROUTE = "optimization-queue";

const querySchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
});

const addBodySchema = z.object({
  locale: z.enum(["en", "ar"]).optional(),
  appId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        type: z.enum([
          "keyword_gap",
          "review_pain_point",
          "feature_request",
          "competitor_strength",
          "competitor_keyword",
          "market_keyword",
          "competitor_weakness",
        ]),
        category: z.enum(["tracker", "review", "opportunity", "strength"]).optional(),
        content: z.string().min(1).max(2000),
        source: z.enum([
          "keyword_tracker",
          "competitor_spy",
          "review_analysis",
          "market_intel",
          "manual",
        ]),
        sourceContext: z.string().optional(),
        sourceContextId: z.string().optional(),
        signalCluster: z
          .enum(["OFFENSIVE_GROWTH", "DEFENSIVE_PAIN_POINT", "MARKET_INTEL"])
          .optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(50)
    .superRefine((items, ctx) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item.source !== "manual") continue;
        const cluster =
          item.signalCluster ??
          item.metadata?.signal_cluster ??
          item.metadata?.cluster_category;
        if (
          cluster !== "OFFENSIVE_GROWTH" &&
          cluster !== "DEFENSIVE_PAIN_POINT" &&
          cluster !== "MARKET_INTEL"
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Manual queue items require signalCluster",
            path: [i, "signalCluster"],
          });
        }
      }
    }),
});

export async function GET(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const query = querySchema.parse({
      locale: url.searchParams.get("locale") ?? "en",
      appId: url.searchParams.get("appId") ?? undefined,
    });

    const locale = query.locale as OptimizationQueueLocale;
    const items = await readOptimizationQueue(
      supabase,
      workspaceId,
      locale,
      query.appId,
    );

    return NextResponse.json({
      items,
      stats: buildOptimizationQueueStats(items),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.flatten() },
        { status: 422 },
      );
    }
    console.error(`[${ROUTE}] GET error:`, error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = addBodySchema.parse(await request.json());
    const locale = (body.locale ?? "en") as OptimizationQueueLocale;

    const result = await addToOptimizationQueue(
      supabase,
      workspaceId,
      locale,
      body.items,
      { appId: body.appId, userId: user.id },
    );

    return NextResponse.json({
      ok: true,
      addedCount: result.addedCount,
      skippedCount: result.skippedCount,
      items: result.items,
      stats: buildOptimizationQueueStats(result.items),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.flatten() },
        { status: 422 },
      );
    }
    console.error(`[${ROUTE}] POST error:`, error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
