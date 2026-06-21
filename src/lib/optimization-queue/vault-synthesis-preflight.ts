import { z } from "zod";
import type { OptimizationQueueItem, OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";
import { buildActiveContextSynthesis } from "@/lib/optimization-queue/build-active-context-synthesis";
import { filterItemsForActiveContextQueueHash } from "@/lib/optimization-queue/optimization-queue-hash-canonical";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import type { ListingGenerationWarning } from "@/lib/listing/listing-generation-warnings";

export const EMPTY_SYNTHESIS_VAULT_MESSAGE =
  "No signals are currently available for synthesis. Stage keywords in Keyword Tracker and competitor or review insights in Active Context, then try again.";

const synthesisSignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
  signalCluster: z.string(),
});

const clusterSynthesisPayloadSchema = z.object({
  offensive: z.array(synthesisSignalSchema),
  defensive: z.array(synthesisSignalSchema),
  market: z.array(synthesisSignalSchema),
});

export type VaultSynthesisReadiness = {
  totalItems: number;
  keywordCount: number;
  competitorCount: number;
  reviewCount: number;
  marketCount: number;
  isEmpty: boolean;
  hasKeywords: boolean;
  hasCompetitors: boolean;
  hasAnySignals: boolean;
  hasSynthesisClusters: boolean;
};

export type QueueHashSignalPopulation = {
  /** Hash source includes at least one Keyword Tracker row. */
  hashReady: boolean;
  /** Hash source includes keyword + competitor/strength rows. */
  hashFullyPopulated: boolean;
  keywordCount: number;
  competitorCount: number;
  totalItems: number;
  message?: string;
};

function countByCategory(items: OptimizationQueueItem[]): Omit<
  VaultSynthesisReadiness,
  "isEmpty" | "hasKeywords" | "hasCompetitors" | "hasAnySignals" | "hasSynthesisClusters"
> {
  let keywordCount = 0;
  let competitorCount = 0;
  let reviewCount = 0;
  let marketCount = 0;

  for (const item of items) {
    const category = resolveQueueItemCategory(item);
    switch (category) {
      case "tracker":
        keywordCount += 1;
        break;
      case "strength":
        competitorCount += 1;
        break;
      case "review":
        reviewCount += 1;
        break;
      case "opportunity":
        marketCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    totalItems: items.length,
    keywordCount,
    competitorCount,
    reviewCount,
    marketCount,
  };
}

export function assessVaultSynthesisReadiness(
  items: OptimizationQueueItem[],
): VaultSynthesisReadiness {
  const counts = countByCategory(items);
  const synthesis = buildActiveContextSynthesis(items);
  const hasSynthesisClusters = activeContextHasSignals(synthesis);

  return {
    ...counts,
    isEmpty: counts.totalItems === 0,
    hasKeywords: counts.keywordCount > 0,
    hasCompetitors: counts.competitorCount > 0,
    hasAnySignals: counts.totalItems > 0,
    hasSynthesisClusters,
  };
}

export function verifyQueueHashSignalPopulation(
  items: OptimizationQueueItem[],
  locale: OptimizationQueueLocale,
): QueueHashSignalPopulation {
  const filtered = filterItemsForActiveContextQueueHash(items, locale);
  const counts = countByCategory(filtered);
  const hashReady = counts.keywordCount > 0 && counts.totalItems > 0;
  const hashFullyPopulated = hashReady && counts.competitorCount > 0;

  let message: string | undefined;
  if (counts.totalItems === 0) {
    message = EMPTY_SYNTHESIS_VAULT_MESSAGE;
  } else if (counts.keywordCount === 0) {
    message =
      "Queue hash has no Keyword Tracker signals. Stage target keywords before generating.";
  } else if (counts.competitorCount === 0) {
    message =
      "Queue hash has keywords but no competitor signals. Add Competitor Spy insights for stronger synthesis.";
  }

  return {
    hashReady,
    hashFullyPopulated,
    keywordCount: counts.keywordCount,
    competitorCount: counts.competitorCount,
    totalItems: counts.totalItems,
    message,
  };
}

export function buildVaultSynthesisWarnings(
  readiness: VaultSynthesisReadiness,
  hashCheck?: QueueHashSignalPopulation,
): ListingGenerationWarning[] {
  const warnings: ListingGenerationWarning[] = [];

  if (readiness.isEmpty || !readiness.hasAnySignals) {
    warnings.push({
      code: "empty_synthesis_vault",
      severity: "warning",
      message: EMPTY_SYNTHESIS_VAULT_MESSAGE,
    });
    return warnings;
  }

  if (!readiness.hasKeywords) {
    warnings.push({
      code: "missing_tracker_signals",
      severity: "warning",
      message:
        "No Keyword Tracker terms in the staging vault. AI copy will lack search-intent anchors.",
    });
  }

  if (!readiness.hasCompetitors) {
    warnings.push({
      code: "missing_competitor_signals",
      severity: "info",
      message:
        "No competitor signals staged. Add Competitor Spy strengths or gaps for displacement copy.",
    });
  }

  if (!readiness.hasSynthesisClusters && readiness.hasAnySignals) {
    warnings.push({
      code: "empty_synthesis_clusters",
      severity: "warning",
      message:
        "Staged vault items could not be clustered for synthesis. Refresh Keyword Tracker and re-stage signals.",
    });
  }

  if (hashCheck && hashCheck.totalItems > 0 && !hashCheck.hashFullyPopulated) {
    if (hashCheck.keywordCount > 0 && hashCheck.competitorCount === 0) {
      // covered by missing_competitor_signals
    } else if (!hashCheck.hashReady && hashCheck.message) {
      warnings.push({
        code: "queue_hash_underpopulated",
        severity: "warning",
        message: hashCheck.message,
      });
    }
  }

  return warnings;
}

export function logStagingVaultPreSynthesis(args: {
  scope: "client" | "server";
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
  vaultItems: OptimizationQueueItem[];
  readiness?: VaultSynthesisReadiness;
  note?: string;
}): void {
  const readiness = args.readiness ?? assessVaultSynthesisReadiness(args.vaultItems);
  const synthesis = buildActiveContextSynthesis(args.vaultItems);

  console.log(
    JSON.stringify({
      event: "staging_vault_pre_synthesis",
      scope: args.scope,
      workspaceId: args.workspaceId,
      locale: args.locale,
      appId: args.appId ?? null,
      note: args.note ?? null,
      readiness,
      vault: {
        itemCount: args.vaultItems.length,
        items: args.vaultItems.map((item) => ({
          id: item.id,
          type: item.type,
          category: resolveQueueItemCategory(item),
          source: item.source,
          contentPreview: item.content.trim().slice(0, 120),
        })),
      },
      synthesisPreview: {
        offensive: synthesis.offensive.length,
        defensive: synthesis.defensive.length,
        market: synthesis.market.length,
      },
    }),
  );
}

/**
 * Log vault dump, build cluster payload, validate shape with Zod before downstream use.
 */
export function validateSynthesisPayloadAfterVault(
  vaultItems: OptimizationQueueItem[],
  meta: {
    scope: "client" | "server";
    workspaceId: string;
    locale: OptimizationQueueLocale;
    appId?: string | null;
  },
): {
  synthesis: ReturnType<typeof buildActiveContextSynthesis>;
  readiness: VaultSynthesisReadiness;
  warnings: ListingGenerationWarning[];
  zodOk: boolean;
} {
  logStagingVaultPreSynthesis({
    ...meta,
    vaultItems,
    note: "before_zod_synthesis_validation",
  });

  const readiness = assessVaultSynthesisReadiness(vaultItems);
  const synthesis = buildActiveContextSynthesis(vaultItems);
  const zodResult = clusterSynthesisPayloadSchema.safeParse(synthesis);

  if (!zodResult.success) {
    console.error(
      JSON.stringify({
        event: "staging_vault_synthesis_zod_failed",
        scope: meta.scope,
        workspaceId: meta.workspaceId,
        issues: zodResult.error.flatten(),
      }),
    );
  }

  const hashCheck = verifyQueueHashSignalPopulation(vaultItems, meta.locale);
  const warnings = buildVaultSynthesisWarnings(readiness, hashCheck);

  return {
    synthesis,
    readiness,
    warnings,
    zodOk: zodResult.success,
  };
}
