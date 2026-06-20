import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateListingWithGemini } from "@/lib/gemini/generate-listing";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import {
  generateListingFinalizeExtrasWithGemini,
  generateListingLongWithGemini,
  generateListingTitleWithGemini,
} from "@/lib/gemini/generate-listing-modular";
import { runDefensiveModularShortGeneration } from "@/lib/listing/modular-defensive-generation";
import {
  longLengthWarningMessage,
  runModularLongAssembler,
} from "@/lib/listing/modular-long-assembler";
import { safeAssemble } from "@/lib/listing/listing-assembler";
import { MODULAR_LONG_ACCEPT_MIN_CHARS } from "@/lib/listing/modular-output-validation";
import { pruneContext } from "@/lib/optimizer/prune-context";
import { modularStateToListingCopy } from "@/lib/listing/assemble-modular-listing";
import {
  enrichListingInputForHeuristics,
  finalizeWarningsPayload,
  missingContextShortWarning,
} from "@/lib/listing/listing-generation-heuristics";
import type {
  ModularListingGenerationStep,
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import type {
  ListingGenerationWarning,
  ListingGenerationWarningsPayload,
} from "@/lib/listing/listing-generation-warnings";
import { getModularListingPromptVersion } from "@/lib/prompts/listing-modular";
import { getListingOptimizerPromptVersion } from "@/lib/prompts/listing-optimizer";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  isCreditBilledStep,
  resolveRequestLockedKeywords,
  type ListingModularGenerateBody,
} from "@/lib/validation/listing-modular-generate-body";
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
  preflightWarnings?: ListingGenerationWarning[];
};

type OrchestratorResponseBase = {
  warnings?: ListingGenerationWarningsPayload;
};

export type OrchestratorModularResponse =
  | ({ step: "title"; data: ModularTitleStepData } & OrchestratorResponseBase)
  | ({ step: "short"; data: ModularShortStepData } & OrchestratorResponseBase)
  | ({
      step: "long" | "hook" | "features" | "closing";
      data: ModularLongStepData;
    } & OrchestratorResponseBase)
  | ({
      step: "finalize" | "full";
      data: ListingGenerationOutput;
      asoScorePartial?: boolean;
      retried?: boolean;
      shortDescriptionClamped?: boolean;
      generationId?: string;
      savedAt?: string;
      persisted: boolean;
    } & OrchestratorResponseBase);

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
    includeOptimizerContext: _ioc,
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
  const { step, body } = ctx;
  const { input, warnings } = enrichListingInputForHeuristics(
    body,
    ctx.preflightWarnings ?? [],
  );
  const warningsPayload = () => finalizeWarningsPayload(warnings);

  switch (step) {
    case "title": {
      const locked = resolveLockedKeywords(body);
      const data = await generateListingTitleWithGemini(input, locked);
      return { step: "title", data, warnings: warningsPayload() };
    }

    case "short": {
      const contextTitle =
        body.contextTitle?.trim() ||
        body.modularListing?.title.value?.trim() ||
        input.appName.slice(0, 30);
      const locked = resolveLockedKeywords(body);
      const { data, warnings: shortWarnings } = await runDefensiveModularShortGeneration(
        input,
        contextTitle,
        locked,
      );
      warnings.push(...shortWarnings);
      return { step: "short", data, warnings: warningsPayload() };
    }

    case "long":
    case "hook":
    case "features":
    case "closing": {
      const contextTitle =
        body.contextTitle?.trim() ||
        body.modularListing?.title.value?.trim() ||
        input.appName.slice(0, 30);
      let contextShort =
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
        warnings.push(missingContextShortWarning());
        throw new InvalidModelOutputError(
          "contextShortDescription is required for long-description generation",
        );
      }
      const prunedInput = pruneContext(input);
      const locked = resolveLockedKeywords(body);
      const longContext = { title: contextTitle, shortDescription: contextShort };

      if (step === "long") {
        let assemblerResult;
        try {
          assemblerResult = await runModularLongAssembler({
            supabase: ctx.supabase,
            workspaceId: ctx.workspaceId,
            appId: ctx.appId,
            input: prunedInput,
            context: longContext,
            lockedKeywords: locked,
            inlineFallback: body.modularListing?.longDescription,
          });
        } catch (error) {
          console.warn("[listing-orchestrator/long] assembler error — safeAssemble fallback", error);
          const safe = safeAssemble(body.modularListing?.longDescription ?? {}, {
            targetArabic: prunedInput.targetArabic ?? false,
          });
          assemblerResult = {
            data: safe.data,
            source: "fallback" as const,
            lengthAssessment: safe.lengthAssessment,
            assembleWarnings: safe.warnings,
          };
        }

        const { data, source, timedOut, expansionSkipped, lengthAssessment, assembleWarnings } =
          assemblerResult;

        if (source === "vault_cache") {
          warnings.push({
            code: "long_vault_cache_fallback",
            message: timedOut
              ? "Long description generation timed out; restored best-available cached copy from vault."
              : "Long description generation used best-available cached copy from vault.",
            severity: "warning",
          });
        }
        if (source === "fallback") {
          warnings.push({
            code: "long_assembly_adjusted",
            message: "Generation used safe fallback assembly to deliver a usable listing.",
            severity: "warning",
          });
        }
        if (expansionSkipped) {
          warnings.push({
            code: "long_expansion_skipped",
            message:
              "Assembler skipped post-processing to stay within the 8-second budget; returning best-effort copy.",
            severity: "warning",
          });
        }
        for (const msg of assembleWarnings) {
          warnings.push({
            code: "long_assembly_adjusted",
            message: msg,
            severity: "warning",
          });
        }
        if (lengthAssessment.belowTarget) {
          const lengthMsg = longLengthWarningMessage(lengthAssessment);
          if (lengthMsg) {
            warnings.push({
              code:
                lengthAssessment.charCount > MODULAR_LONG_ACCEPT_MIN_CHARS
                  ? "long_description_below_target"
                  : "long_description_short",
              message: lengthMsg,
              severity: "warning",
            });
          }
        }
        return { step: "long", data, warnings: warningsPayload() };
      }

      const existing = body.modularListing?.longDescription;
      const data = await generateListingLongWithGemini(
        prunedInput,
        longContext,
        step,
        existing,
        locked,
      );
      return { step, data, warnings: warningsPayload() };
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
        warnings: warningsPayload(),
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
        warnings: warningsPayload(),
      };
    }

    default: {
      const _exhaustive: never = step;
      throw new InvalidModelOutputError(`Unknown generation step: ${_exhaustive}`);
    }
  }
}

export { listingInputFromBody };
