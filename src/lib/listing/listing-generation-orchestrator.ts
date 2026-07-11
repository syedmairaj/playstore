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
import { safeAssemble, suggestHighIntentTitle } from "@/lib/listing/listing-assembler";
import { MODULAR_LONG_ACCEPT_MIN_CHARS } from "@/lib/listing/modular-output-validation";
import { pruneContext } from "@/lib/optimizer/prune-context";
import { modularStateToListingCopy } from "@/lib/listing/assemble-modular-listing";
import {
  enrichListingInputForHeuristics,
  buildHeuristicShortVariations,
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
import { generateListingPipelineCaptions } from "@/lib/gemini/generate-screenshot-captions";
import type { CaptionsStepData } from "@/lib/listing/listing-version.types";
import { generateRunwarePromptBatch } from "@/lib/runware/runware-visual-prompt";
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
import { shortVariationText, orderShortVariations, shortVariationTypeFromOrchestrationId } from "@/lib/listing/modular-short-variations";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { upsertListingGeneration } from "@/lib/db/listing-generations";
import { recordGenerationPhaseCost } from "@/lib/listing/record-generation-phase-cost";
import {
  clearListingGenerationJobState,
  LISTING_GENERATION_SUPERSEDED_ERROR,
} from "@/lib/db/listing-generation-job";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { INSTANT_DRAFT_PROMPT_VERSION } from "@/lib/listing/listing-export-unlock";
import { linkListingGenerationToTrackedKeywords } from "@/lib/keywords/link-listing-generation-to-keywords";
import {
  resolveListingPersistenceContext,
  type ListingPersistenceContext,
} from "@/lib/listing/listing-persistence-context";
import {
  assertWorkspaceHandshake,
  WorkspaceHandshakeError,
} from "@/lib/workspace/workspace-handshake";
import {
  applyListingGenerationAdapter,
} from "@/lib/listing/listing-generation-adapter";
import type { ContextPackageV1 } from "@/lib/listing/context-package.types";
import type { CoreAsoTemplateResult } from "@/lib/listing/core-aso-template";
import type { GenerationSignalContext } from "@/lib/listing/generation-signal-context.types";
import { buildCoreAsoTemplateListing } from "@/lib/listing/core-aso-template";
import { runSynthesisWithFailSafe } from "@/lib/listing/synthesis-fail-safe";
import {
  assertPreGenerationKeywordContext,
  countTrackedKeywordSignals,
  logTrackedKeywordSignalsPreflight,
  MissingKeywordContextError,
} from "@/lib/listing/listing-pre-generation-guard";
import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";
import {
  fetchDraftState,
  mergeModularListingBaseline,
  persistListingDraftOnGenerate,
} from "@/lib/listing/listing-draft-persist";
import type { ListingDraftPersistState } from "@/lib/listing/listing-draft-persist.types";
import type { ListingDraftPersistedPhases } from "@/lib/listing/listing-draft-persist.types";
import { enrichListingInputWithRequestKeywords } from "@/lib/listing/merge-request-keyword-signals";
import { applyModularStepSignals } from "@/lib/listing/modular-step-signals";
import { runSerializedModularPipeline } from "@/lib/listing/modular-serial-pipeline";
import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import {
  applyCompiledContextToListingInput,
  compileContextForStep,
  stampAndCompileListingContext,
  type CompiledContext,
} from "@/lib/listing/context-gateway";
import { assertPipelineStateForStep, checkPipelineStateForStep } from "@/lib/listing/modular-pipeline-state-machine";
import { clampPlayStoreTitle } from "@/lib/listing/clamp-play-store-title";

export { WorkspaceHandshakeError, MissingKeywordContextError };
import { ModularPhaseOrderError } from "@/lib/listing/modular-phase-guard";
import { normalizeShortVariationText } from "@/lib/listing/modular-output-validation";

export { ModularPhaseOrderError };
export {
  ModularPipelineEntryError,
  GenerationInProgressError,
} from "@/lib/listing/modular-pipeline-state-machine";

function modularShortFromFullOutput(
  data: ListingGenerationOutput,
  input: ListingOptimizerInput,
): ModularShortStepData {
  const orch =
    data.orchestration?.modules?.conversion?.shortVariations;
  if (orch && orch.length >= 3) {
    return {
      variations: orderShortVariations(
        orch.map((v, i) => ({
          type: shortVariationTypeFromOrchestrationId(v.variationId ?? "", i),
          text: normalizeShortVariationText(v.shortDescription ?? ""),
        })),
      ),
    };
  }

  const title =
    clampPlayStoreTitle(data.title?.trim() ?? "") ||
    clampPlayStoreTitle(input.appName?.trim() ?? "") ||
    "App";
  return buildHeuristicShortVariations(input, title);
}

async function persistListingGenerationResult(
  ctx: OrchestratorRunContext,
  persistence: ListingPersistenceContext,
  input: ListingOptimizerInput,
  output: ListingGenerationOutput,
  step: "finalize" | "full",
) {
  try {
    const queueHash = ctx.body.queueHash?.trim();
    if (!ctx.isDraft && queueHash) {
      await clearListingGenerationJobState(persistence.workspaceId, queueHash);

      if (!ctx.skipSupersededPersistGuard) {
        const { data: draftRow } = await ctx.supabase
          .from("workspace_listing_drafts")
          .select("updated_at, generation_error, generation_status")
          .eq("workspace_id", persistence.workspaceId)
          .eq("queue_hash", queueHash)
          .maybeSingle();

        if (
          typeof draftRow?.generation_error === "string" &&
          draftRow.generation_error.includes(LISTING_GENERATION_SUPERSEDED_ERROR) &&
          (draftRow.generation_status === "pending" ||
            draftRow.generation_status === "processing")
        ) {
          return { ok: false as const, message: "superseded" };
        }

        if (ctx.workerStartedAt != null && draftRow?.updated_at) {
          const draftUpdatedMs = Date.parse(draftRow.updated_at);
          if (
            Number.isFinite(draftUpdatedMs) &&
            draftUpdatedMs > ctx.workerStartedAt
          ) {
            return { ok: false as const, message: "superseded_by_newer_draft" };
          }
        }
      }
    }

    const persist = await upsertListingGeneration(ctx.supabase, {
      input,
      output,
      clientIp: ctx.clientIp,
      model: ctx.model,
      promptVersion: ctx.isDraft
        ? INSTANT_DRAFT_PROMPT_VERSION
        : orchestratorPromptVersion(step),
      workspaceId: persistence.workspaceId,
      userId: persistence.userId,
      creditsLedgerId: ctx.creditsLedgerId ?? null,
      appId: persistence.appId,
    });

    const finalPersist =
      persist.ok || ctx.isDraft
        ? persist
        : await upsertListingGeneration(getSupabaseAdmin(), {
            input,
            output,
            clientIp: ctx.clientIp,
            model: ctx.model,
            promptVersion: ctx.isDraft
              ? INSTANT_DRAFT_PROMPT_VERSION
              : orchestratorPromptVersion(step),
            workspaceId: persistence.workspaceId,
            userId: persistence.userId,
            creditsLedgerId: ctx.creditsLedgerId ?? null,
            appId: persistence.appId,
          });

    if (finalPersist.ok && persistence.appId) {
      try {
        await linkListingGenerationToTrackedKeywords({
          supabase: ctx.supabase,
          workspaceId: persistence.workspaceId,
          appId: persistence.appId,
          listingGenerationId: finalPersist.id,
        });
      } catch (linkError) {
        console.warn(
          JSON.stringify({
            event: "listing_generation_keyword_link_failed",
            workspaceId: persistence.workspaceId,
            generationId: finalPersist.id,
            message:
              linkError instanceof Error ? linkError.message : String(linkError),
          }),
        );
      }
    }

    return finalPersist;
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "listing_generation_history_persist_error",
        workspaceId: persistence.workspaceId,
        queueHash: ctx.body.queueHash,
        step,
        message: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : undefined,
      }),
    );
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "persist_failed",
    };
  }
}

export type OrchestratorExecutionMode = "read" | "execute";

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
  headerWorkspaceId?: string | null;
  isDraft?: boolean;
  pipeline?: "optimized" | "legacy" | "draft";
  contextPackage?: ContextPackageV1 | null;
  /** `read` — phase persistence check only (producer). `execute` — full generation (worker). */
  executionMode?: OrchestratorExecutionMode;
  /** Internal: serialized pipeline segment — skips phase-order guard. */
  skipPhaseGuard?: boolean;
  pipelineSegment?: boolean;
  /** Pre-compiled Context Gateway package (route may pass to skip duplicate compile). */
  compiledContext?: CompiledContext;
  /** Async worker: invoked at the start of each serialized pipeline phase. */
  onPipelinePhaseStart?: (phase: "title" | "short" | "long") => void | Promise<void>;
  /** Async worker: epoch ms when the job started — used to skip stale persists. */
  workerStartedAt?: number;
  /** Sync full unlock — skip superseded guard so history persist is not blocked. */
  skipSupersededPersistGuard?: boolean;
  /**
   * Unified workspace intelligence signals (brand kit, market intel, reviews,
   * keyword tracker, competitor signals).  Fetched by the executor before the
   * orchestrator call; injected into the LLM input for all generation steps.
   */
  signalContext?: GenerationSignalContext;
};

type OrchestratorResponseBase = {
  warnings?: ListingGenerationWarningsPayload;
  draftPersisted?: boolean;
  draftUpdatedAt?: string;
};

function withSynthesisQueueContext(
  input: ListingOptimizerInput,
  queueHash: string,
): ListingOptimizerInput {
  return { ...input, synthesisQueueHash: queueHash };
}

function enforceListingContextGate(
  input: ListingOptimizerInput,
  options: { isDraft: boolean },
): void {
  if (options.isDraft) return;
  if (countTrackedKeywordSignals(input) > 0) return;
  if ((input.targetKeywords?.length ?? 0) > 0) return;
  if (input.activeContext && activeContextHasSignals(input.activeContext)) return;
  assertPreGenerationKeywordContext({
    trackedKeywordSignals: input.trackedKeywordSignals,
    includeOptimizerContext: true,
  });
}

function appendContextGapWarningIfNeeded(
  input: ListingOptimizerInput,
  warnings: ListingGenerationWarning[],
): void {
  if (countTrackedKeywordSignals(input) === 0) return;
  if (input.activeContext && activeContextHasSignals(input.activeContext)) return;
  if (warnings.some((w) => w.code === "context_gap")) return;
  warnings.push({
    code: "context_gap",
    severity: "warning",
    message:
      "Context gap — Keyword Tracker terms are staged but Review/Market/Competitor signals are sparse. Copy may score below full synthesis health.",
  });
}

function draftResponseMeta(
  meta: { ok: true; updatedAt: string } | { ok: false },
): Pick<OrchestratorResponseBase, "draftPersisted" | "draftUpdatedAt"> {
  if (meta.ok) {
    return { draftPersisted: true, draftUpdatedAt: meta.updatedAt };
  }
  return { draftPersisted: false };
}

export type OrchestratorModularResponse =
  | ({ step: "title"; data: ModularTitleStepData } & OrchestratorResponseBase)
  | ({ step: "short"; data: ModularShortStepData } & OrchestratorResponseBase)
  | ({
      step: "long" | "hook" | "features" | "closing";
      data: ModularLongStepData;
    } & OrchestratorResponseBase)
  | ({ step: "pipeline"; data: ModularListingState } & OrchestratorResponseBase)
  | ({ step: "captions"; data: CaptionsStepData } & OrchestratorResponseBase)
  | ({
      step: "finalize" | "full";
      data: ListingGenerationOutput;
      asoScorePartial?: boolean;
      retried?: boolean;
      shortDescriptionClamped?: boolean;
      generationId?: string;
      savedAt?: string;
      persisted: boolean;
      /** Structured long-description blocks from the instant-draft path (isDraft: true).
       *  Populated only for draft-path "full" responses so the client can pre-fill the
       *  ModularListingPanel block editors without waiting for the async pipeline. */
      modularDraftLong?: import("@/lib/listing/modular-listing.types").ModularLongStepData;
      /** Three distinct Phase 2 preview lines (growth / conversion / utility). */
      modularDraftShort?: ModularShortStepData;
    } & OrchestratorResponseBase);

export type OrchestratorReadResponse = {
  step: ModularListingGenerationStep;
  readOnly: true;
  phasesReady: true;
  persistedPhases: ListingDraftPersistedPhases;
};

export type OrchestratorRunResult = OrchestratorModularResponse | OrchestratorReadResponse;

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
    isDraft: _draft,
    fastDraft: _fd,
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

function draftCacheResponseMeta(
  draft: ListingDraftPersistState,
): Pick<OrchestratorResponseBase, "draftPersisted" | "draftUpdatedAt"> {
  if (draft.updatedAt) {
    return { draftPersisted: true, draftUpdatedAt: draft.updatedAt };
  }
  return { draftPersisted: true };
}

async function trackListingPhaseCost(
  ctx: OrchestratorRunContext,
  phase: "title" | "short" | "long" | "full",
  tokensUsed: number,
  options?: { creditCost?: number },
): Promise<void> {
  if (ctx.isDraft || tokensUsed <= 0) return;
  await recordGenerationPhaseCost({
    workspaceId: ctx.workspaceId,
    queueHash: ctx.body.queueHash,
    phase,
    tokensUsed,
    isRegenerate: ctx.body.isRegenerate,
    creditCost: options?.creditCost,
  });
}

function shouldUsePersistedPhase(
  step: ModularListingGenerationStep,
  body: ListingModularGenerateBody,
  draft: ListingDraftPersistState,
): boolean {
  if (body.isRegenerate || draft.isEmpty) return false;
  const phases = draft.persistedPhases;
  switch (step) {
    case "title":
      return phases.title;
    case "short":
      return phases.short;
    case "long":
    case "hook":
    case "features":
    case "closing":
      return phases.long;
    default:
      return false;
  }
}

function titleDataFromPersistedDraft(
  draft: ListingDraftPersistState,
  locked: string[],
): ModularTitleStepData {
  return {
    title: draft.modularState.title.value,
    lockedKeywords: locked,
  };
}

function shortDataFromPersistedDraft(draft: ListingDraftPersistState): ModularShortStepData {
  return {
    variations: draft.modularState.shortDescription.variations,
  };
}

function longDataFromPersistedDraft(
  draft: ListingDraftPersistState,
  step: "long" | "hook" | "features" | "closing",
): ModularLongStepData {
  const { hook, features, closing } = draft.modularState.longDescription;
  if (step === "hook") return { hook, features: "", closing: "" };
  if (step === "features") return { hook: "", features, closing: "" };
  if (step === "closing") return { hook: "", features: "", closing };
  return { hook, features, closing };
}

export async function runListingGenerationOrchestrator(
  ctx: OrchestratorRunContext,
): Promise<OrchestratorRunResult> {
  const { step, body } = ctx;
  const persistence = resolveListingPersistenceContext({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    appId: ctx.appId,
    body,
    headerWorkspaceId: ctx.headerWorkspaceId,
  });
  const { workspaceId } = persistence;

  const draftParams = {
    workspaceId,
    userId: persistence.userId,
    appId: persistence.appId,
    queueHash: body.queueHash,
    vaultLocale: body.vaultLocale,
  };

  /** Producer read path — phase persistence check only; no Gemini or draft writes. */
  if (ctx.executionMode === "read") {
    const phaseCheck = await checkPipelineStateForStep(ctx.supabase, {
      step,
      queueHash: body.queueHash,
      isRegenerate: body.isRegenerate,
      skipGuard: ctx.skipPhaseGuard,
      draftParams,
    });

    if (!phaseCheck.ok) {
      throw new ModularPhaseOrderError(phaseCheck.missingPhases, phaseCheck.code);
    }

    return {
      step,
      readOnly: true,
      phasesReady: true,
      persistedPhases: phaseCheck.persistedPhases,
    };
  }

  let gatewayContext = ctx.compiledContext;
  const contextStep = step === "pipeline" ? "title" : step;
  if (!ctx.isDraft && body.queueHash?.trim() && !gatewayContext) {
    if (!ctx.pipelineSegment) {
      gatewayContext = await stampAndCompileListingContext(ctx.supabase, {
        workspaceId,
        appId: persistence.appId,
        queueHash: body.queueHash,
        vaultLocale: body.vaultLocale,
        step: contextStep,
      });
    } else {
      gatewayContext = await compileContextForStep(ctx.supabase, {
        workspaceId,
        appId: persistence.appId,
        queueHash: body.queueHash,
        vaultLocale: body.vaultLocale,
        step: contextStep,
      });
    }
  }

  await assertWorkspaceHandshake({
    supabase: ctx.supabase,
    workspaceId,
    userId: ctx.userId,
    headerWorkspaceId: ctx.headerWorkspaceId,
  });

  const pipeline = ctx.pipeline ?? (ctx.isDraft ? "draft" : "legacy");
  const { input: heuristicInput, warnings } = enrichListingInputForHeuristics(
    body,
    ctx.preflightWarnings ?? [],
  );
  const heuristicInputWithKeywords = enrichListingInputWithRequestKeywords(
    applyCompiledContextToListingInput(heuristicInput, gatewayContext),
  );

  const adapted = applyListingGenerationAdapter({
    input: heuristicInputWithKeywords,
    pipeline: pipeline === "draft" ? "legacy" : pipeline,
    contextPackage: ctx.contextPackage,
  });
  const input = adapted.input;
  const signalStep = step === "pipeline" ? "pipeline" : step;
  const modelInput = applyModularStepSignals(
    withSynthesisQueueContext(input, body.queueHash),
    signalStep,
  );

  // Attach workspace intelligence signals so every prompt builder can inject them.
  if (ctx.signalContext) {
    modelInput.signalContext = ctx.signalContext;
  }

  logTrackedKeywordSignalsPreflight({
    workspaceId,
    step,
    appId: persistence.appId ?? undefined,
    vaultLocale: body.vaultLocale,
    trackedKeywordSignals: modelInput.trackedKeywordSignals,
    queueHash: body.queueHash,
  });

  enforceListingContextGate(modelInput, { isDraft: ctx.isDraft === true });
  appendContextGapWarningIfNeeded(modelInput, warnings);

  const persistedDraft = await fetchDraftState(ctx.supabase, {
    workspaceId,
    userId: persistence.userId,
    appId: persistence.appId,
    queueHash: body.queueHash,
    vaultLocale: body.vaultLocale,
  });

  const bodyForGeneration: ListingModularGenerateBody = persistedDraft.isEmpty
    ? body
    : {
        ...body,
        modularListing: mergeModularListingBaseline(
          persistedDraft.modularState,
          body.modularListing,
        ),
        ...(body.contextTitle?.trim()
          ? {}
          : persistedDraft.modularState.title.value.trim()
            ? { contextTitle: persistedDraft.modularState.title.value.trim() }
            : {}),
      };

  await assertPipelineStateForStep(ctx.supabase, {
    step,
    queueHash: body.queueHash,
    isRegenerate: body.isRegenerate,
    // Also skip the guard for the classic instant-draft path (isDraft: true).
    // That path generates title + short + long in a single Gemini call and never
    // writes persisted_phases, so the guard would permanently block every full
    // draft generation by seeing all three phases as false.
    // The guard is only meaningful for the async modular pipeline where phases
    // are generated and persisted individually before a "full" or "finalize" step.
    skipGuard: ctx.skipPhaseGuard || ctx.isDraft === true,
    draftParams,
  });

  if (ctx.isDraft) {
    const locked = resolveLockedKeywords(body);
    if (step === "full" || step === "title" || step === "short") {
      const coreTemplate = buildCoreAsoTemplateListing(input, locked);
      const { listing: template, modularLong } = coreTemplate;
      if (step === "title") {
        const titleData = {
          title: template.title,
          lockedKeywords: locked.length > 0 ? locked : input.targetKeywords.slice(0, 5),
        };
        const titleDraftMeta = await persistListingDraftOnGenerate({
          supabase: ctx.supabase,
          persistence,
          body: bodyForGeneration,
          step: "title",
          titleData,
        });
        return {
          step: "title",
          data: titleData,
          warnings: finalizeWarningsPayload([
            ...warnings,
            {
              code: "category_best_practices",
              severity: "info",
              message: "Instant draft preview — run full generation for AI-optimized copy.",
            },
          ]),
          ...draftResponseMeta(titleDraftMeta),
        };
      }
      if (step === "short") {
        const shortData = {
          variations: [
            { type: "growth" as const, text: template.shortDescription },
            { type: "conversion" as const, text: template.shortDescription },
            { type: "utility" as const, text: template.shortDescription },
          ],
        };
        const shortDraftMeta = await persistListingDraftOnGenerate({
          supabase: ctx.supabase,
          persistence,
          body: bodyForGeneration,
          step: "short",
          shortData,
        });
        return {
          step: "short",
          data: shortData,
          warnings: finalizeWarningsPayload(warnings),
          ...draftResponseMeta(shortDraftMeta),
        };
      }
      const fullDraftMeta = await persistListingDraftOnGenerate({
        supabase: ctx.supabase,
        persistence,
        body: bodyForGeneration,
        step: "full",
        finalizeOutput: template,
      });

      const modularDraftShort = buildHeuristicShortVariations(input, template.title);
      await persistListingDraftOnGenerate({
        supabase: ctx.supabase,
        persistence,
        body: bodyForGeneration,
        step: "short",
        shortData: modularDraftShort,
      });

      // Also write to listing_generations so that /api/listings/latest returns
      // fresh draft content on F5 refresh rather than a stale previous generation.
      // Without this, the hydration endpoint only sees listing_generations rows
      // (never workspace_listing_drafts) and serves old data on page reload.
      const draftPersist = await persistListingGenerationResult(
        ctx,
        persistence,
        input,
        template,
        "full",
      );

      return {
        step: "full",
        data: template,
        modularDraftLong: modularLong,
        modularDraftShort,
        persisted: draftPersist.ok,
        generationId: draftPersist.ok ? draftPersist.id : undefined,
        savedAt: draftPersist.ok ? draftPersist.updatedAt : undefined,
        warnings: finalizeWarningsPayload(warnings),
        ...draftResponseMeta(fullDraftMeta),
      };
    }
  }

  const warningsPayload = () => finalizeWarningsPayload(warnings);

  switch (step) {
    case "pipeline": {
      if (ctx.pipelineSegment) {
        throw new InvalidModelOutputError("Invalid nested pipeline invocation.");
      }
      const pipelineResult = await runSerializedModularPipeline(ctx, {
        onPhaseStart: ctx.onPipelinePhaseStart,
      });
      return {
        step: "pipeline",
        data: pipelineResult.modularState,
        warnings: pipelineResult.warnings ?? warningsPayload(),
        draftPersisted: pipelineResult.draftPersisted,
        draftUpdatedAt: pipelineResult.draftUpdatedAt,
      };
    }

    case "title": {
      const locked = resolveLockedKeywords(bodyForGeneration);
      if (shouldUsePersistedPhase("title", body, persistedDraft)) {
        const data = titleDataFromPersistedDraft(persistedDraft, locked);
        return {
          step: "title",
          data,
          warnings: warningsPayload(),
          ...draftCacheResponseMeta(persistedDraft),
        };
      }
      const titleResult = await generateListingTitleWithGemini(modelInput, locked);
      const data = {
        ...titleResult.data,
        title: suggestHighIntentTitle(titleResult.data.title),
      };
      await trackListingPhaseCost(ctx, "title", titleResult.tokensUsed);
      const titleDraftMeta = await persistListingDraftOnGenerate({
        supabase: ctx.supabase,
        persistence,
        body: bodyForGeneration,
        step: "title",
        titleData: data,
      });
      return {
        step: "title",
        data,
        warnings: warningsPayload(),
        ...draftResponseMeta(titleDraftMeta),
      };
    }

    case "short": {
      if (shouldUsePersistedPhase("short", body, persistedDraft)) {
        const data = shortDataFromPersistedDraft(persistedDraft);
        return {
          step: "short",
          data,
          warnings: warningsPayload(),
          ...draftCacheResponseMeta(persistedDraft),
        };
      }
      const contextTitle =
        bodyForGeneration.contextTitle?.trim() ||
        bodyForGeneration.modularListing?.title.value?.trim() ||
        clampPlayStoreTitle(input.appName);
      const locked = resolveLockedKeywords(bodyForGeneration);
      const { data, warnings: shortWarnings, tokensUsed: shortTokens } =
        await runDefensiveModularShortGeneration(
        modelInput,
        contextTitle,
        locked,
      );
      warnings.push(...shortWarnings);
      await trackListingPhaseCost(ctx, "short", shortTokens);
      const shortDraftMeta = await persistListingDraftOnGenerate({
        supabase: ctx.supabase,
        persistence,
        body: bodyForGeneration,
        step: "short",
        shortData: data,
      });
      return {
        step: "short",
        data,
        warnings: warningsPayload(),
        ...draftResponseMeta(shortDraftMeta),
      };
    }

    case "long":
    case "hook":
    case "features":
    case "closing": {
      if (shouldUsePersistedPhase(step, body, persistedDraft)) {
        const data = longDataFromPersistedDraft(persistedDraft, step);
        return {
          step,
          data,
          warnings: warningsPayload(),
          ...draftCacheResponseMeta(persistedDraft),
        };
      }
      const contextTitle =
        bodyForGeneration.contextTitle?.trim() ||
        bodyForGeneration.modularListing?.title.value?.trim() ||
        clampPlayStoreTitle(input.appName);
      let contextShort =
        bodyForGeneration.contextShortDescription?.trim() ||
        (() => {
          const row =
            bodyForGeneration.modularListing?.shortDescription.variations[
              bodyForGeneration.modularListing?.shortDescription.selectedIndex ?? 0
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
      const prunedInput = pruneContext(modelInput);
      const locked = resolveLockedKeywords(bodyForGeneration);
      const longContext = { title: contextTitle, shortDescription: contextShort };

      if (step === "long") {
        let assemblerResult;
        try {
          assemblerResult = await runModularLongAssembler({
            supabase: ctx.supabase,
            workspaceId,
            appId: persistence.appId ?? undefined,
            input: prunedInput,
            context: longContext,
            lockedKeywords: locked,
            inlineFallback: bodyForGeneration.modularListing?.longDescription,
          });
        } catch (error) {
          console.warn("[listing-orchestrator/long] assembler error — safeAssemble fallback", error);
          const safe = safeAssemble(bodyForGeneration.modularListing?.longDescription ?? {}, {
            targetArabic: prunedInput.targetArabic ?? false,
          });
          assemblerResult = {
            data: safe.data,
            source: "fallback" as const,
            lengthAssessment: safe.lengthAssessment,
            assembleWarnings: safe.warnings,
            tokensUsed: 0,
          };
        }

        const { data, source, timedOut, expansionSkipped, lengthAssessment, assembleWarnings, tokensUsed } =
          assemblerResult;

        await trackListingPhaseCost(ctx, "long", tokensUsed);

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
        const longDraftMeta = await persistListingDraftOnGenerate({
          supabase: ctx.supabase,
          persistence,
          body: bodyForGeneration,
          step: "long",
          longData: data,
        });
        return {
          step: "long",
          data,
          warnings: warningsPayload(),
          ...draftResponseMeta(longDraftMeta),
        };
      }

      const existing = bodyForGeneration.modularListing?.longDescription;
      const longResult = await generateListingLongWithGemini(
        prunedInput,
        longContext,
        step,
        existing,
        locked,
      );
      await trackListingPhaseCost(ctx, "long", longResult.tokensUsed);
      const blockDraftMeta = await persistListingDraftOnGenerate({
        supabase: ctx.supabase,
        persistence,
        body: bodyForGeneration,
        step,
        longData: longResult.data,
      });
      return {
        step,
        data: longResult.data,
        warnings: warningsPayload(),
        ...draftResponseMeta(blockDraftMeta),
      };
    }

    case "finalize": {
      if (!bodyForGeneration.modularListing) {
        throw new InvalidModelOutputError(
          "modularListing is required for finalize step",
        );
      }
      const copy = modularStateToListingCopy(bodyForGeneration.modularListing);
      const extras = await generateListingFinalizeExtrasWithGemini(modelInput, copy);
      await trackListingPhaseCost(ctx, "full", extras.tokensUsed);
      const data: ListingGenerationOutput = {
        title: copy.title,
        shortDescription: copy.shortDescription,
        fullDescription: copy.fullDescription,
        keywordSuggestions:
          extras.data.keywordSuggestions ?? input.targetKeywords.slice(0, 20),
        ctaSuggestions: extras.data.ctaSuggestions ?? [],
        ...(extras.data.asoScore != null ? { asoScore: extras.data.asoScore } : {}),
        ...(extras.data.scoreBreakdown ? { scoreBreakdown: extras.data.scoreBreakdown } : {}),
        ...(extras.data.improvementTips?.length
          ? { improvementTips: extras.data.improvementTips }
          : {}),
      };

      const persist = await persistListingGenerationResult(
        ctx,
        persistence,
        input,
        data,
        "finalize",
      );

      const finalizeDraftMeta = await persistListingDraftOnGenerate({
        supabase: ctx.supabase,
        persistence,
        body: bodyForGeneration,
        step: "finalize",
        finalizeOutput: data,
      });

      return {
        step: "finalize",
        data,
        asoScorePartial: !extras.data.asoScore,
        persisted: persist.ok,
        generationId: persist.ok ? persist.id : undefined,
        savedAt: persist.ok ? persist.updatedAt : undefined,
        warnings: warningsPayload(),
        ...draftResponseMeta(finalizeDraftMeta),
      };
    }

    case "full": {
      const locked = resolveLockedKeywords(bodyForGeneration);
      let data: ListingGenerationOutput;
      let asoScorePartial: boolean | undefined;
      let retried: boolean | undefined;
      let shortDescriptionClamped: boolean | undefined;

      const synthesisResult = await runSynthesisWithFailSafe({
        route: "listing-orchestrator",
        workspaceId,
        userId: persistence.userId,
        step: "full",
        pipeline: pipeline === "optimized" ? "optimized" : "legacy",
        input,
        lockedKeywords: locked,
        warnings,
        execute: async () => {
          const gemini = await generateListingWithGemini(modelInput);
          asoScorePartial = gemini.asoScorePartial;
          retried = gemini.retried;
          shortDescriptionClamped = gemini.shortDescriptionClamped;
          try {
            await trackListingPhaseCost(ctx, "full", gemini.tokensUsed);
          } catch (costError) {
            console.warn(
              JSON.stringify({
                event: "listing_phase_cost_track_failed",
                workspaceId,
                step: "full",
                message:
                  costError instanceof Error ? costError.message : String(costError),
              }),
            );
          }
          return gemini.data;
        },
      });

      data = synthesisResult.data;

      try {
        const modularDraftShort = modularShortFromFullOutput(data, modelInput);

        const persist = await persistListingGenerationResult(
          ctx,
          persistence,
          input,
          data,
          "full",
        );

        if (!persist.ok) {
          console.warn(
            JSON.stringify({
              event: "listing_generation_history_persist_failed",
              workspaceId,
              queueHash: body.queueHash,
              message: "message" in persist ? persist.message : "unknown",
            }),
          );
        }

        if (data.title?.trim()) {
          await persistListingDraftOnGenerate({
            supabase: ctx.supabase,
            persistence,
            body: bodyForGeneration,
            step: "title",
            titleData: {
              title: clampPlayStoreTitle(data.title.trim()),
              lockedKeywords:
                locked.length > 0
                  ? locked
                  : (input.targetKeywords ?? []).slice(0, 5),
            },
          });
        }

        await persistListingDraftOnGenerate({
          supabase: ctx.supabase,
          persistence,
          body: bodyForGeneration,
          step: "short",
          shortData: modularDraftShort,
        });

        const fullDraftMeta = await persistListingDraftOnGenerate({
          supabase: ctx.supabase,
          persistence,
          body: bodyForGeneration,
          step: "full",
          finalizeOutput: data,
        });

        return {
          step: "full",
          data,
          modularDraftShort,
          asoScorePartial: asoScorePartial === true,
          retried,
          shortDescriptionClamped,
          persisted: persist.ok,
          generationId: persist.ok ? persist.id : undefined,
          savedAt: persist.ok ? persist.updatedAt : undefined,
          warnings: synthesisResult.warnings ?? warningsPayload(),
          ...draftResponseMeta(fullDraftMeta),
        };
      } catch (postSynthesisError) {
        console.log(
          JSON.stringify({
            event: "full_step_post_synthesis_failed",
            workspaceId,
            queueHash: body.queueHash,
            message:
              postSynthesisError instanceof Error
                ? postSynthesisError.message
                : String(postSynthesisError),
            errorName:
              postSynthesisError instanceof Error
                ? postSynthesisError.name
                : undefined,
            stack:
              postSynthesisError instanceof Error
                ? postSynthesisError.stack
                : undefined,
          }),
        );

        const modularDraftShort = modularShortFromFullOutput(data, modelInput);
        return {
          step: "full",
          data,
          modularDraftShort,
          asoScorePartial: asoScorePartial === true,
          retried,
          shortDescriptionClamped,
          persisted: false,
          warnings: finalizeWarningsPayload([
            ...warnings,
            partialModelOutputWarning("full"),
            {
              code: "category_best_practices",
              severity: "warning",
              message:
                "Generation completed but vault persistence hit an error — copy is shown; retry unlock if export stays locked.",
            },
          ]),
          ...draftResponseMeta({ ok: false }),
        };
      }
    }

    case "captions": {
      // Screenshot captions derived from the long description tone.
      // Not credit-billed — a lightweight post-pipeline enrichment step.
      const longText =
        (bodyForGeneration.modularListing?.longDescription?.features ??
          bodyForGeneration.modularListing?.longDescription?.hook ??
          "") +
        "\n" +
        (bodyForGeneration.modularListing?.longDescription?.closing ?? "");

      const listingTitle =
        bodyForGeneration.modularListing?.title?.value?.trim() ||
        bodyForGeneration.contextTitle?.trim() ||
        input.appName;

      const captionsResult = await generateListingPipelineCaptions({
        appName: input.appName,
        category: input.category,
        listingTitle,
        toneStyle: input.toneStyle,
        appFeatures: input.appFeatures,
        longDescription:
          longText.trim() || input.appFeatures.slice(0, 800),
        locale: (body.vaultLocale ?? "en") as "en" | "ar",
        lockedKeywords: body.targetKeywords?.slice(0, 5),
        // Brand Kit binding: color palette + style guide the Runware screenshot backgrounds.
        brandKit: ctx.signalContext?.brandKit
          ? {
              primaryColor: ctx.signalContext.brandKit.primaryColor,
              colorPalette: ctx.signalContext.brandKit.colorPalette,
              style: ctx.signalContext.brandKit.style,
              toneGuidelines: ctx.signalContext.brandKit.toneGuidelines,
            }
          : undefined,
      });

      // ── Runware Visual Prompt Generation ──────────────────────────────────
      // When a brand kit is available, generate one Runware image-generation
      // payload per caption.  The positivePrompt is embedded ONTO each
      // ScreenshotCaption as `runwarePrompt` so it is persisted to
      // listing_versions.screenshot_captions JSONB — enabling CVR correlation
      // in the performance attribution dashboard.
      const signalBrandKit = ctx.signalContext?.brandKit;
      let captionsWithPrompts = captionsResult.captions;
      let runwarePayloads: CaptionsStepData["runwarePayloads"];

      if (signalBrandKit) {
        const locale = (body.vaultLocale ?? "en") as "en" | "ar";
        const runwareBatch = generateRunwarePromptBatch(
          captionsResult.captions,
          input.appName,
          input.category,
          signalBrandKit,
          locale,
        );
        runwarePayloads = runwareBatch.results.map((r) => r.payload);

        // Embed the Runware positivePrompt onto each caption for DB persistence.
        // Build an order-keyed map for O(1) lookup.
        const promptByOrder = new Map(
          runwareBatch.results.map((r) => [r.caption.order, r.payload.positivePrompt]),
        );
        captionsWithPrompts = captionsResult.captions.map((c) => ({
          ...c,
          runwarePrompt: promptByOrder.get(c.order) ?? null,
        }));
      }

      return {
        step: "captions",
        data: {
          captions: captionsWithPrompts,
          ...(runwarePayloads ? { runwarePayloads } : {}),
        },
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
