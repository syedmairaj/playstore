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
import {
  buildHeuristicLongBlocks,
  buildHeuristicShortLine,
  buildHeuristicShortVariations,
  buildHeuristicTitle,
  enrichListingInputForHeuristics,
  finalizeWarningsPayload,
  missingContextShortWarning,
  partialModelOutputWarning,
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
    ...listingInput
  } = body;
  return listingInput;
}

function resolveLockedKeywords(body: ListingModularGenerateBody): string[] {
  return resolveRequestLockedKeywords(body);
}

function hasUsableText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

async function withHeuristicFallback<T>(
  stepLabel: string,
  attempt: () => Promise<T>,
  fallback: () => T,
  isValid: (data: T) => boolean,
  warnings: ListingGenerationWarning[],
): Promise<T> {
  try {
    const data = await attempt();
    if (isValid(data)) return data;
    warnings.push(partialModelOutputWarning(stepLabel));
    return fallback();
  } catch (error) {
    if (error instanceof InvalidModelOutputError) {
      warnings.push(partialModelOutputWarning(stepLabel));
      return fallback();
    }
    throw error;
  }
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
      const data = await withHeuristicFallback(
        "title",
        () => generateListingTitleWithGemini(input, locked),
        () => buildHeuristicTitle(input, locked),
        (value) => hasUsableText(value.title),
        warnings,
      );
      return { step: "title", data, warnings: warningsPayload() };
    }

    case "short": {
      const contextTitle =
        body.contextTitle?.trim() ||
        body.modularListing?.title.value?.trim() ||
        input.appName.slice(0, 30);
      const locked = resolveLockedKeywords(body);
      const data = await withHeuristicFallback(
        "short description",
        () => generateListingShortWithGemini(input, contextTitle, locked),
        () => buildHeuristicShortVariations(input, contextTitle),
        (value) => value.variations.some((v) => hasUsableText(v.text)),
        warnings,
      );
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
        contextShort = buildHeuristicShortLine(input, contextTitle);
        warnings.push(missingContextShortWarning());
      }
      const existing = body.modularListing?.longDescription;
      const block = step === "long" ? undefined : step;
      const locked = resolveLockedKeywords(body);
      const context = { title: contextTitle, shortDescription: contextShort };
      const fallbackLong = () => {
        const full = buildHeuristicLongBlocks(input, context);
        if (block && existing) {
          return {
            hook: block === "hook" ? full.hook : (existing.hook ?? ""),
            features: block === "features" ? full.features : (existing.features ?? ""),
            closing: block === "closing" ? full.closing : (existing.closing ?? ""),
          };
        }
        return full;
      };
      const data = await withHeuristicFallback(
        block ? `long ${block}` : "long description",
        () =>
          generateListingLongWithGemini(input, context, block, existing, locked),
        fallbackLong,
        (value) => {
          if (block) return hasUsableText(value[block]);
          return (
            hasUsableText(value.hook) ||
            hasUsableText(value.features) ||
            hasUsableText(value.closing)
          );
        },
        warnings,
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
      let data: ListingGenerationOutput;
      let asoScorePartial: boolean | undefined;
      let retried: boolean | undefined;
      let shortDescriptionClamped: boolean | undefined;
      try {
        const result = await generateListingWithGemini(input);
        data = result.data;
        asoScorePartial = result.asoScorePartial;
        retried = result.retried;
        shortDescriptionClamped = result.shortDescriptionClamped;
      } catch (error) {
        if (error instanceof InvalidModelOutputError) {
          warnings.push(partialModelOutputWarning("full listing"));
          const title = buildHeuristicTitle(input, resolveLockedKeywords(body));
          const short = buildHeuristicShortVariations(input, title.title);
          const long = buildHeuristicLongBlocks(input, {
            title: title.title,
            shortDescription: short.variations[0]?.text ?? title.title,
          });
          data = {
            title: title.title,
            shortDescription: short.variations[1]?.text ?? short.variations[0]?.text ?? "",
            fullDescription: [long.hook, long.features, long.closing].filter(Boolean).join("\n\n"),
            keywordSuggestions: input.targetKeywords.slice(0, 20),
            ctaSuggestions: [],
          };
          asoScorePartial = true;
        } else {
          throw error;
        }
      }

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
