import "server-only";

import type { ListingOptimizerInput } from "@/lib/types/listing";

export const MISSING_KEYWORD_CONTEXT_MESSAGE =
  "Missing Keyword Context. Please visit the Keyword Tracker to select target keywords.";

export class MissingKeywordContextError extends Error {
  readonly code = "missing_keyword_context" as const;

  constructor(message = MISSING_KEYWORD_CONTEXT_MESSAGE) {
    super(message);
    this.name = "MissingKeywordContextError";
  }
}

export function countTrackedKeywordSignals(
  input: Pick<ListingOptimizerInput, "trackedKeywordSignals">,
): number {
  return input.trackedKeywordSignals?.length ?? 0;
}

/**
 * Pre-Generation Guard — blocks AI calls when Keyword Tracker signals are empty.
 */
export function assertPreGenerationKeywordContext(
  input: Pick<ListingOptimizerInput, "trackedKeywordSignals"> & {
    includeOptimizerContext?: boolean;
  },
): void {
  if (input.includeOptimizerContext === false) {
    return;
  }

  if (countTrackedKeywordSignals(input) === 0) {
    throw new MissingKeywordContextError();
  }
}

export function logTrackedKeywordSignalsPreflight(params: {
  workspaceId: string;
  step: string;
  appId?: string;
  vaultLocale?: string;
  trackedKeywordSignals: ListingOptimizerInput["trackedKeywordSignals"];
  queueHash?: string;
}): void {
  const signals = params.trackedKeywordSignals ?? [];
  console.log(
    JSON.stringify({
      event: "listing_generate_preflight",
      workspaceId: params.workspaceId,
      step: params.step,
      appId: params.appId ?? null,
      vaultLocale: params.vaultLocale ?? null,
      queueHash: params.queueHash ?? null,
      trackedKeywordSignals: {
        count: signals.length,
        keywords: signals.map((s) => s.keyword),
      },
    }),
  );
}
