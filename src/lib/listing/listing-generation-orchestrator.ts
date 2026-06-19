import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateListingWithGemini } from "@/lib/gemini/generate-listing";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import {
  generateListingFinalizeExtrasWithGemini,
  generateListingLongWithGemini,
  generateListingShortWithGemini,
  generateListingTitleWithGemini,
} from "@/lib/gemini/generate-listing-modular";
import { modularStateToListingCopy } from "@/lib/listing/assemble-modular-listing";
import type {
  ModularListingGenerationStep,
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import { getModularListingPromptVersion } from "@/lib/prompts/listing-modular";
import { getListingOptimizerPromptVersion } from "@/lib/prompts/listing-optimizer";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { ListingModularGenerateBody } from "@/lib/validation/listing-modular-generate-body";
import { shortVariationText } from "@/lib/listing/modular-short-variations";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { insertListingGeneration } from "@/lib/db/listing-generations";
import { linkListingGenerationToTrackedKeywords } from "@/lib/keywords/link-listing-generation-to-keywords";

export type OrchestratorRunContext = {
  step: ModularListingGenerationStep;
  body: ListingModularGenerateBody;
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  appId?: string;
  clientIp: string;
  model: string;
  creditsLedgerId?: string | null;
};

export type OrchestratorModularResponse =
  | { step: "title"; data: ModularTitleStepData }
  | { step: "short"; data: ModularShortStepData }
  | { step: "long" | "hook" | "features" | "closing"; data: ModularLongStepData }
  | {
      step: "finalize" | "full";
      data: ListingGenerationOutput;
      asoScorePartial?: boolean;
      retried?: boolean;
      shortDescriptionClamped?: boolean;
      generationId?: string;
      savedAt?: string;
      persisted: boolean;
    };

function listingInputFromBody(body: ListingModularGenerateBody): ListingOptimizerInput {
  const {
    workspaceId: _w,
    appId: _a,
    activeSignalTypes: _s,
    vaultLocale: _l,
    queueHash: _h,
    clientQueueItemCount: _c,
    generationStep: _g,
    lockedKeywords: _lk,
    contextTitle: _ct,
    contextShortDescription: _cs,
    modularListing: _m,
    orchestration: _orch,
    modularTitle: _mt,
    isRegenerate: _ir,
    ...listingInput
  } = body;
  return listingInput;
}

function resolveLockedKeywords(body: ListingModularGenerateBody): string[] {
  return resolveRequestLockedKeywords(body);
}

export function orchestratorPromptVersion(step: ModularListingGenerationStep): string {
  return isCreditBilledStep(step) && step === "full"
    ? getListingOptimizerPromptVersion()
    : getModularListingPromptVersion();
}

export async function runListingGenerationOrchestrator(
  ctx: OrchestratorRunContext,
): Promise<OrchestratorModularResponse> {
  const input = listingInputFromBody(ctx.body);
  const { step, body } = ctx;

  switch (step) {
    case "title": {
      const data = await generateListingTitleWithGemini(
        input,
        resolveLockedKeywords(body),
      );
      return { step: "title", data };
    }

    case "short": {
      const contextTitle =
        body.contextTitle?.trim() ||
        body.modularListing?.title.value?.trim() ||
        input.appName.slice(0, 30);
      const data = await generateListingShortWithGemini(
        input,
        contextTitle,
        resolveLockedKeywords(body),
      );
      return { step: "short", data };
    }

    case "long":
    case "hook":
    case "features":
    case "closing": {
      const contextTitle =
        body.contextTitle?.trim() ||
        body.modularListing?.title.value?.trim() ||
        input.appName.slice(0, 30);
      const contextShort =
        body.contextShortDescription?.trim() ||
        (() => {
          const row =
            body.modularListing?.shortDescription.variations[
              body.modularListing?.shortDescription.selectedIndex ?? 0
            ];
          return row ? shortVariationText(row) : "";
        })() ||
        "";
      if (!contextShort) {
        throw new InvalidModelOutputError(
          "contextShortDescription is required for long-description generation",
        );
      }
      const existing = body.modularListing?.longDescription;
      const block = step === "long" ? undefined : step;
      const data = await generateListingLongWithGemini(
        input,
        { title: contextTitle, shortDescription: contextShort },
        block,
        existing,
        resolveLockedKeywords(body),
      );
      return { step, data };
    }

    case "finalize": {
      if (!body.modularListing) {
        throw new InvalidModelOutputError(
          "modularListing is required for finalize step",
        );
      }
      const copy = modularStateToListingCopy(body.modularListing);
      const extras = await generateListingFinalizeExtrasWithGemini(input, copy);
      const data: ListingGenerationOutput = {
        title: copy.title,
        shortDescription: copy.shortDescription,
        fullDescription: copy.fullDescription,
        keywordSuggestions:
          extras.keywordSuggestions ?? input.targetKeywords.slice(0, 20),
        ctaSuggestions: extras.ctaSuggestions ?? [],
        ...(extras.asoScore != null ? { asoScore: extras.asoScore } : {}),
        ...(extras.scoreBreakdown ? { scoreBreakdown: extras.scoreBreakdown } : {}),
        ...(extras.improvementTips?.length
          ? { improvementTips: extras.improvementTips }
          : {}),
      };

      const persist = await insertListingGeneration(ctx.supabase, {
        input,
        output: data,
        clientIp: ctx.clientIp,
        model: ctx.model,
        promptVersion: orchestratorPromptVersion(step),
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        creditsLedgerId: ctx.creditsLedgerId ?? null,
        appId: ctx.appId ?? null,
      });

      if (persist.ok && ctx.appId) {
        await linkListingGenerationToTrackedKeywords({
          supabase: ctx.supabase,
          workspaceId: ctx.workspaceId,
          appId: ctx.appId,
          listingGenerationId: persist.id,
        });
      }

      return {
        step: "finalize",
        data,
        asoScorePartial: !extras.asoScore,
        persisted: persist.ok,
        generationId: persist.ok ? persist.id : undefined,
        savedAt: persist.ok ? persist.createdAt : undefined,
      };
    }

    case "full": {
      const {
        data,
        asoScorePartial,
        retried,
        shortDescriptionClamped,
      } = await generateListingWithGemini(input);

      const persist = await insertListingGeneration(ctx.supabase, {
        input,
        output: data,
        clientIp: ctx.clientIp,
        model: ctx.model,
        promptVersion: orchestratorPromptVersion(step),
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        creditsLedgerId: ctx.creditsLedgerId ?? null,
        appId: ctx.appId ?? null,
      });

      if (persist.ok && ctx.appId) {
        await linkListingGenerationToTrackedKeywords({
          supabase: ctx.supabase,
          workspaceId: ctx.workspaceId,
          appId: ctx.appId,
          listingGenerationId: persist.id,
        });
      }

      return {
        step: "full",
        data,
        asoScorePartial,
        retried,
        shortDescriptionClamped,
        persisted: persist.ok,
        generationId: persist.ok ? persist.id : undefined,
        savedAt: persist.ok ? persist.createdAt : undefined,
      };
    }

    default: {
      const _exhaustive: never = step;
      throw new InvalidModelOutputError(`Unknown generation step: ${_exhaustive}`);
    }
  }
}

export { listingInputFromBody };
