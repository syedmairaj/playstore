import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOptimizedContextFromItems } from "@/lib/optimizer/context-adapter";
import { readOptimizationQueue } from "@/lib/optimization-queue/optimization-queue.service";
import { computeActiveContextQueueHash } from "@/lib/optimization-queue/optimization-queue-hash-server";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import { resolveSignalImpactScore } from "@/lib/optimizer/context-adapter";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import {
  CONTEXT_PACKAGE_MAX_SIGNALS,
  type ContextPackageSignalPoint,
  type ContextPackageV1,
} from "@/lib/listing/context-package.types";
import { writeContextPackage } from "@/lib/listing/context-package-store";

export type CompressContextPackageArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
};

function categoryToSignalPoint(
  category: ReturnType<typeof resolveQueueItemCategory>,
): ContextPackageSignalPoint["category"] {
  switch (category) {
    case "tracker":
      return "keywords";
    case "strength":
      return "competitors";
    case "review":
      return "reviews";
    case "opportunity":
    default:
      return "market";
  }
}

function buildSignalPoints(
  items: Awaited<ReturnType<typeof readOptimizationQueue>>,
): ContextPackageSignalPoint[] {
  const ranked = [...items].sort(
    (a, b) => resolveSignalImpactScore(b) - resolveSignalImpactScore(a),
  );

  const points: ContextPackageSignalPoint[] = [];
  const seen = new Set<string>();

  for (const item of ranked) {
    if (points.length >= CONTEXT_PACKAGE_MAX_SIGNALS) break;
    const label = item.content.trim();
    if (!label) continue;
    const preview = label.toLowerCase();
    if (seen.has(preview)) continue;
    seen.add(preview);

    points.push({
      category: categoryToSignalPoint(resolveQueueItemCategory(item)),
      label,
      source: item.source,
      impactScore: resolveSignalImpactScore(item),
    });
  }

  return points;
}

/**
 * Compress raw vault queue items into a 5-point Context Package and commit to Redis.
 * Intended for background invocation when Review / Competitor / Keyword signals change.
 */
export async function compressSignalsToContextPackage(
  args: CompressContextPackageArgs,
): Promise<ContextPackageV1> {
  const queueItems = await readOptimizationQueue(
    args.supabase,
    args.workspaceId,
    args.locale,
    args.appId,
  );

  const optimized = buildOptimizedContextFromItems(queueItems);
  const queueHash = computeActiveContextQueueHash(queueItems, args.locale);

  const pkg: ContextPackageV1 = {
    version: "1",
    workspaceId: args.workspaceId,
    appId: args.appId?.trim() || null,
    locale: args.locale,
    queueHash,
    compressedAt: new Date().toISOString(),
    signalPoints: buildSignalPoints(queueItems),
    synthesis: optimized.synthesis,
    trackedKeywordSignals: optimized.trackedKeywordSignals,
    topStagedIssues: optimized.topStagedIssues,
    activeSignalTypes: optimized.activeSignalTypes,
  };

  await writeContextPackage(pkg);

  console.log(
    JSON.stringify({
      event: "context_package_compressed",
      workspaceId: args.workspaceId,
      locale: args.locale,
      appId: args.appId ?? null,
      signalPointCount: pkg.signalPoints.length,
      queueHash,
    }),
  );

  return pkg;
}

/**
 * Fire-and-forget background compression — never blocks the staging mutation response.
 */
export function scheduleSignalCompression(args: CompressContextPackageArgs): void {
  queueMicrotask(() => {
    void compressSignalsToContextPackage(args).catch((error) => {
      console.error("[signal-compressor] background compression failed", {
        workspaceId: args.workspaceId,
        locale: args.locale,
        appId: args.appId ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}
