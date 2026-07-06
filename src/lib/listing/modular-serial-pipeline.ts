import "server-only";

import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import { EMPTY_MODULAR_LISTING_STATE } from "@/lib/listing/modular-listing.types";
import { shortVariationText } from "@/lib/listing/modular-short-variations";
import type { ListingModularGenerateBody } from "@/lib/validation/listing-modular-generate-body";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";
import { assertDraftPhasesPersisted } from "@/lib/listing/modular-pipeline-state-machine";
import {
  runListingGenerationOrchestrator,
  type OrchestratorModularResponse,
  type OrchestratorRunContext,
} from "@/lib/listing/listing-generation-orchestrator";

export type SerializedModularPipelineResult = {
  step: "pipeline";
  modularState: ModularListingState;
  warnings?: ListingGenerationWarningsPayload;
  draftPersisted: boolean;
  draftUpdatedAt?: string;
};

function isTitleResult(
  result: OrchestratorModularResponse,
): result is Extract<OrchestratorModularResponse, { step: "title" }> {
  return result.step === "title";
}

function isShortResult(
  result: OrchestratorModularResponse,
): result is Extract<OrchestratorModularResponse, { step: "short" }> {
  return result.step === "short";
}

function isLongResult(
  result: OrchestratorModularResponse,
): result is Extract<OrchestratorModularResponse, { step: "long" }> {
  return result.step === "long";
}

function mergeWarnings(
  acc: ListingGenerationWarningsPayload | undefined,
  next?: ListingGenerationWarningsPayload,
): ListingGenerationWarningsPayload | undefined {
  if (!next) return acc;
  if (!acc) return next;
  return {
    ...acc,
    items: [...acc.items, ...next.items],
    healthScore: next.healthScore ?? acc.healthScore,
    healthLabel: next.healthLabel ?? acc.healthLabel,
  };
}

function bodyAfterTitle(
  body: ListingModularGenerateBody,
  title: string,
  lockedKeywords: string[],
): ListingModularGenerateBody {
  return {
    ...body,
    contextTitle: title,
    modularListing: {
      ...(body.modularListing ?? EMPTY_MODULAR_LISTING_STATE),
      title: { value: title, locked: true },
      shortDescription:
        body.modularListing?.shortDescription ??
        EMPTY_MODULAR_LISTING_STATE.shortDescription,
      longDescription:
        body.modularListing?.longDescription ??
        EMPTY_MODULAR_LISTING_STATE.longDescription,
    },
    lockedKeywords: lockedKeywords.length > 0 ? lockedKeywords : body.lockedKeywords,
  };
}

function bodyAfterShort(
  body: ListingModularGenerateBody,
  shortVariations: ModularListingState["shortDescription"]["variations"],
): ListingModularGenerateBody {
  const selected =
    shortVariations[shortVariations.length > 2 ? 2 : shortVariations.length - 1];
  const shortText = selected ? shortVariationText(selected) : "";
  return {
    ...body,
    contextShortDescription: shortText,
    modularListing: {
      ...(body.modularListing ?? EMPTY_MODULAR_LISTING_STATE),
      shortDescription: {
        variations: shortVariations,
        selectedIndex: shortVariations.length > 2 ? 2 : 0,
      },
    },
  };
}

function draftLookupParams(ctx: OrchestratorRunContext) {
  return {
    workspaceId: ctx.workspaceId,
    appId: ctx.appId,
    queueHash: ctx.body.queueHash,
    userId: ctx.userId,
    vaultLocale: ctx.body.vaultLocale,
  };
}

/**
 * Strictly sequential server pipeline: title → short → long (full description).
 * Each segment verifies `workspace_listing_drafts` persistence before advancing (409 on conflict).
 */
export async function runSerializedModularPipeline(
  ctx: OrchestratorRunContext,
  options?: {
    onPhaseStart?: (phase: "title" | "short" | "long") => void | Promise<void>;
  },
): Promise<SerializedModularPipelineResult> {
  const segmentCtx: OrchestratorRunContext = {
    ...ctx,
    skipPhaseGuard: true,
    pipelineSegment: true,
    compiledContext: undefined,
  };

  let warnings: ListingGenerationWarningsPayload | undefined;
  let draftPersisted = false;
  let draftUpdatedAt: string | undefined;

  await options?.onPhaseStart?.("title");
  const titleResult = await runListingGenerationOrchestrator({
    ...segmentCtx,
    step: "title",
  });
  if (!isTitleResult(titleResult)) {
    throw new Error("Serialized pipeline failed at title step.");
  }
  warnings = mergeWarnings(warnings, titleResult.warnings);
  if (titleResult.draftPersisted) {
    draftPersisted = true;
    draftUpdatedAt = titleResult.draftUpdatedAt ?? draftUpdatedAt;
  }
  await assertDraftPhasesPersisted(ctx.supabase, draftLookupParams(ctx), ["title"]);

  const titleValue = titleResult.data.title.trim();
  const lockedKeywords = titleResult.data.lockedKeywords ?? [];
  let body = bodyAfterTitle(ctx.body, titleValue, lockedKeywords);

  await options?.onPhaseStart?.("short");
  const shortResult = await runListingGenerationOrchestrator({
    ...segmentCtx,
    step: "short",
    body,
  });
  if (!isShortResult(shortResult)) {
    throw new Error("Serialized pipeline failed at short step.");
  }
  warnings = mergeWarnings(warnings, shortResult.warnings);
  if (shortResult.draftPersisted) {
    draftPersisted = true;
    draftUpdatedAt = shortResult.draftUpdatedAt ?? draftUpdatedAt;
  }
  await assertDraftPhasesPersisted(ctx.supabase, draftLookupParams(ctx), [
    "title",
    "short",
  ]);

  const variations = shortResult.data.variations.filter((v) => v.text.trim());
  body = bodyAfterShort(body, variations);

  await options?.onPhaseStart?.("long");
  const longResult = await runListingGenerationOrchestrator({
    ...segmentCtx,
    step: "long",
    body,
  });
  if (!isLongResult(longResult)) {
    throw new Error("Serialized pipeline failed at long step.");
  }
  warnings = mergeWarnings(warnings, longResult.warnings);
  if (longResult.draftPersisted) {
    draftPersisted = true;
    draftUpdatedAt = longResult.draftUpdatedAt ?? draftUpdatedAt;
  }
  await assertDraftPhasesPersisted(ctx.supabase, draftLookupParams(ctx), [
    "title",
    "short",
    "long",
  ]);

  const modularState: ModularListingState = {
    title: { value: titleValue, locked: true },
    shortDescription: {
      variations,
      selectedIndex: variations.length > 2 ? 2 : 0,
    },
    longDescription: {
      hook: longResult.data.hook,
      features: longResult.data.features,
      closing: longResult.data.closing,
    },
  };

  console.log(
    JSON.stringify({
      event: "serialized_modular_pipeline_complete",
      workspaceId: ctx.workspaceId,
      queueHash: ctx.body.queueHash,
      vaultLocale: ctx.body.vaultLocale,
    }),
  );

  return {
    step: "pipeline",
    modularState,
    warnings,
    draftPersisted,
    draftUpdatedAt,
  };
}
