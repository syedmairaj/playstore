import type { OptimizationQueueSynthesisPayload } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { logClientContextAudit } from "@/lib/client/context-audit-log-client";
import {
  sanitizeActiveContextForGenerate,
  sanitizeTrackedKeywordSignalsForGenerate,
} from "@/lib/listing/sanitize-listing-generate-payload";
import type {
  ModularListingGenerationStep,
  ModularListingState,
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import { shortVariationText } from "@/lib/listing/modular-short-variations";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";
import type { GenerateOptimizedListingSuccess } from "@/lib/listing/generate-optimized-listing";
import { fetchWithRetry } from "@/lib/client/fetch-with-retry";
import { pollListingGenerationJob } from "@/lib/client/poll-listing-generation-status";
import { createListingGenerationAbortSignal, isListingGenerationClientTimeout, releaseListingGenerationAbort } from "@/lib/client/listing-generation-abort";
import {
  LISTING_GENERATION_TIMEOUT_MESSAGE,
} from "@/lib/listing/listing-fast-draft";

export type ModularGenerateBaseInput = {
  workspaceId: string;
  appId?: string;
  appName: string;
  category: string;
  targetKeywords: string;
  appFeatures: string;
  toneStyle: string;
  targetArabic: boolean;
  userInstruction?: string;
  queueSynthesis: OptimizationQueueSynthesisPayload;
  queueItemCount?: number;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
};

export type ModularGenerateClientHooks = {
  onWorkspaceHandshakeFailed?: () => void | Promise<void>;
};

function listingGenerateHeaders(workspaceId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Workspace-Id": workspaceId,
  };
}

async function handleModularApiFailure(
  res: Response,
  json: { ok: false; error: ModularApiError["error"] },
  hooks?: ModularGenerateClientHooks,
): Promise<ModularApiError> {
  if (
    res.status === 409 &&
    json.error.code === "workspace_handshake_failed"
  ) {
    await hooks?.onWorkspaceHandshakeFailed?.();
  }
  return {
    ok: false,
    status: res.status,
    error: json.error,
  };
}

export type ModularStepRequestOptions = {
  includeOptimizerContext?: boolean;
  /** @deprecated Blind generation is blocked — always sends optimizer context. */
  fastDraft?: boolean;
  signal?: AbortSignal;
  /** Skip the default 120s client abort budget (e.g. tests). */
  skipTimeout?: boolean;
  /**
   * Called immediately when the API returns 202 with a queued jobId, before
   * the internal polling loop begins.  Use this to start a component-level
   * progress tracker (e.g. useListingPipeline) without waiting for generation
   * to complete.  The internal poll still runs to resolution so the calling
   * hook receives the final result; the callback is purely a notification.
   *
   * `versionId` is included when POST /api/listings/generate created a
   * placeholder ListingVersion row — pass it to the UI so the optimistic
   * DeploymentView shell can link to the correct version.
   */
  onJobQueued?: (jobId: string, versionId?: string) => void;
};

function parseResponseJson(raw: Response): Promise<unknown> {
  return raw.json().catch((error) => {
    console.error("Frontend Fetch Error:", error);
    throw error;
  });
}

function coerceModularStepSuccess<TStep extends ModularListingGenerationStep, TData>(
  step: TStep,
  res: Response,
  json: unknown,
): ModularStepSuccess<TStep, TData> | null {
  if (!res.ok || !json || typeof json !== "object") return null;

  const body = json as Record<string, unknown>;
  if (body.ok === false) return null;

  const generationStep = (body.generationStep ?? step) as TStep;
  const modularData = (body.modularData ?? body.data) as TData | undefined;

  if (body.ok === true || modularData != null || body.generationStep != null) {
    return {
      ok: true,
      generationStep,
      ...(modularData !== undefined ? { modularData } : {}),
      ...(body.warnings
        ? { warnings: body.warnings as ListingGenerationWarningsPayload }
        : {}),
      ...(body.meta
        ? { meta: body.meta as ModularStepSuccess<TStep, TData>["meta"] }
        : {}),
    };
  }

  return null;
}

type ModularApiError = {
  ok: false;
  status: number;
  aborted?: boolean;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    fieldErrors?: Record<string, string[]>;
    remaining?: number;
    required?: number;
  };
};

export type ModularStepSuccess<TStep extends ModularListingGenerationStep, TData> = {
  ok: true;
  generationStep: TStep;
  modularData?: TData;
  data?: ListingGenerationOutput;
  warnings?: ListingGenerationWarningsPayload;
  meta?: {
    model?: string;
    promptVersion?: string;
    creditsCharged?: number;
    persisted?: boolean;
    generationId?: string;
    savedAt?: string;
    asoScorePartial?: boolean;
    quality_status?: string;
    quality_warning?: string;
    trialRegenerationsUsed?: number;
    trialRegenerationsRemaining?: number;
    creditsRemaining?: number;
    draftPersisted?: boolean;
    draftUpdatedAt?: string;
    isSignalEnhanced?: boolean;
    fastDraft?: boolean;
  };
};

import { capLockedKeywords } from "@/lib/validation/listing-modular-generate-body";
import { sanitizeModularListingForApiIngress } from "@/lib/listing/sanitize-modular-listing-for-api";

function parseKeywordList(text: string): string[] {
  return capLockedKeywords(text.split(/[,;\n]+/));
}

function resolveLockedKeywordsForBody(
  input: ModularGenerateBaseInput,
  extras?: { lockedKeywords?: string[] },
): string[] {
  if (extras?.lockedKeywords && extras.lockedKeywords.length > 0) {
    return capLockedKeywords(extras.lockedKeywords);
  }
  return parseKeywordList(input.targetKeywords);
}

function longDescriptionHasContent(long: ModularListingState["longDescription"]): boolean {
  return Boolean(
    long.hook.trim() || long.features.trim() || long.closing.trim(),
  );
}

/** Omit empty draft long blocks from API payload — context fields carry title/short. */
function resolveContextTitle(
  input: ModularGenerateBaseInput,
  extras?: { contextTitle?: string; modularListing?: ModularListingState },
): string {
  const fromExtras = extras?.contextTitle?.trim();
  if (fromExtras) return fromExtras.slice(0, 30);
  const fromModular = extras?.modularListing?.title?.value?.trim();
  if (fromModular) return fromModular.slice(0, 30);
  return input.appName.trim().slice(0, 30);
}

function modularListingForRequest(
  state: ModularListingState | undefined,
  step: ModularListingGenerationStep,
): ModularListingState | undefined {
  if (!state) return undefined;

  if (step === "finalize") {
    return state;
  }

  if (step === "long" && !longDescriptionHasContent(state.longDescription)) {
    return undefined;
  }

  return sanitizeModularListingForApiIngress(state);
}

function buildModularRequestBody(
  input: ModularGenerateBaseInput,
  step: ModularListingGenerationStep,
  extras?: {
    lockedKeywords?: string[];
    contextTitle?: string;
    contextShortDescription?: string;
    modularListing?: ModularListingState;
    userInstruction?: string;
    isRegenerate?: boolean;
    request?: ModularStepRequestOptions;
  },
) {
  const { queueSynthesis } = input;
  const includeOptimizerContext = extras?.request?.includeOptimizerContext ?? true;
  const activeContext = includeOptimizerContext
    ? sanitizeActiveContextForGenerate(queueSynthesis.activeContext)
    : undefined;
  const trackedKeywordSignals = includeOptimizerContext
    ? sanitizeTrackedKeywordSignalsForGenerate(queueSynthesis.trackedKeywordSignals)
    : [];

  logClientContextAudit({
    workspaceId: input.workspaceId,
    appId: input.appId,
    queueItemCount: input.queueItemCount ?? 0,
    queueHash: input.queueHash,
    vaultLocale: input.vaultLocale,
    synthesis: {
      ...queueSynthesis,
      activeContext: activeContext ?? queueSynthesis.activeContext,
      trackedKeywordSignals,
    },
    note: `modular step: ${step}`,
  });

  const instruction = extras?.userInstruction?.trim() || input.userInstruction?.trim();
  const modularListing = extras?.modularListing
    ? modularListingForRequest(extras.modularListing, step)
    : undefined;
  const contextTitle =
    step === "short" ||
    step === "long" ||
    step === "hook" ||
    step === "features" ||
    step === "closing"
      ? resolveContextTitle(input, extras)
      : extras?.contextTitle?.trim();

  return {
    workspaceId: input.workspaceId,
    ...(input.appId ? { appId: input.appId } : {}),
    appName: input.appName,
    category: input.category,
    targetKeywords: input.targetKeywords,
    appFeatures: input.appFeatures,
    toneStyle: input.toneStyle,
    targetArabic: input.targetArabic,
    vaultLocale: input.vaultLocale,
    queueHash: input.queueHash,
    clientQueueItemCount: input.queueItemCount ?? 0,
    generationStep: step,
    isRegenerate: extras?.isRegenerate ?? false,
    includeOptimizerContext,
    ...(instruction ? { userInstruction: instruction } : {}),
    ...(activeContext ? { activeContext } : {}),
    ...(trackedKeywordSignals.length > 0 ? { trackedKeywordSignals } : {}),
    ...(includeOptimizerContext
      ? {
          strategyMode: queueSynthesis.strategyMode,
          ...(queueSynthesis.topStagedIssues.length > 0
            ? { topStagedIssues: queueSynthesis.topStagedIssues }
            : {}),
          activeSignalTypes: queueSynthesis.activeSignalTypes,
        }
      : {}),
    /** Always send an array — never omit (Zod expects [] not undefined). */
    lockedKeywords: resolveLockedKeywordsForBody(input, extras),
    ...(contextTitle ? { contextTitle } : {}),
    ...(extras?.contextShortDescription
      ? { contextShortDescription: extras.contextShortDescription }
      : {}),
    ...(modularListing ? { modularListing } : {}),
  };
}

async function postModularStep<TStep extends ModularListingGenerationStep, TData>(
  input: ModularGenerateBaseInput,
  step: TStep,
  extras?: Parameters<typeof buildModularRequestBody>[2],
  hooks?: ModularGenerateClientHooks,
): Promise<ModularStepSuccess<TStep, TData> | ModularApiError> {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) {
    await hooks?.onWorkspaceHandshakeFailed?.();
    return {
      ok: false,
      status: 409,
      error: {
        code: "workspace_handshake_failed",
        message: "Workspace ID is missing. Re-select your workspace in Keyword Tracker.",
      },
    };
  }

  const externalSignal = extras?.request?.signal;
  const skipTimeout = extras?.request?.skipTimeout === true;
  const timeoutAbort =
    !externalSignal && !skipTimeout ? createListingGenerationAbortSignal() : null;
  const signal = externalSignal ?? timeoutAbort?.signal;

  try {
    const res = await fetchWithRetry(
      "/api/listings/generate",
      {
        method: "POST",
        headers: listingGenerateHeaders(workspaceId),
        credentials: "same-origin",
        body: JSON.stringify(buildModularRequestBody(input, step, extras)),
        ...(signal ? { signal } : {}),
      },
    );
    releaseListingGenerationAbort(timeoutAbort);

    let json: unknown;
    try {
      json = await parseResponseJson(res);
    } catch {
      return {
        ok: false,
        status: res.status || 502,
        error: {
          code: "invalid_response",
          message: "Could not parse listing generation response.",
        },
      };
    }

    if (res.status === 202 && json && typeof json === "object") {
      const accepted = json as {
        jobId?: string;
        versionId?: string;
        code?: string;
        message?: string;
        missingPhases?: Array<"title" | "short" | "long">;
      };
      if (accepted.code === "WAITING_FOR_PHASES") {
        if (accepted.jobId) {
          // Notify the component so it can start a progress tracker before polling.
          extras?.request?.onJobQueued?.(accepted.jobId, accepted.versionId);
          return pollListingGenerationJob<TStep, TData>(accepted.jobId, step, {
            signal,
            maxWaitMs: skipTimeout ? 600_000 : 300_000,
          });
        }
        return {
          ok: false,
          status: 202,
          error: {
            code: "WAITING_FOR_PHASES",
            message:
              accepted.message ??
              "Pipeline phases are still processing. Please wait and try again.",
            // Surface missingPhases so the hook can auto-chain the missing steps
            details: { missingPhases: accepted.missingPhases ?? [] },
          },
        };
      }
      if (accepted.jobId) {
        // Notify the component so it can start a progress tracker before polling.
        extras?.request?.onJobQueued?.(accepted.jobId, accepted.versionId);
        return pollListingGenerationJob<TStep, TData>(accepted.jobId, step, {
          signal,
          maxWaitMs: skipTimeout ? 600_000 : 300_000,
        });
      }
    }

    const success = coerceModularStepSuccess<TStep, TData>(step, res, json);
    if (success) {
      return success;
    }

    const failureBody =
      json && typeof json === "object"
        ? (json as { ok?: boolean; error?: ModularApiError["error"] })
        : null;
    const error =
      failureBody?.ok === false && failureBody.error
        ? failureBody.error
        : { message: res.ok ? "Modular generation returned an incomplete response." : "Modular generation failed." };
    return handleModularApiFailure(res, { ok: false, error }, hooks);
  } catch (error) {
    console.error("Frontend Fetch Error:", error);
    if (isListingGenerationClientTimeout(error, timeoutAbort)) {
      return {
        ok: false,
        status: 503,
        aborted: true,
        error: {
          code: "service_unavailable",
          message: LISTING_GENERATION_TIMEOUT_MESSAGE,
        },
      };
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        aborted: true,
        error: {
          code: "request_aborted",
          message: "Listing generation was cancelled.",
        },
      };
    }
    return {
      ok: false,
      status: 0,
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : "Network request failed.",
      },
    };
  } finally {
    releaseListingGenerationAbort(timeoutAbort);
  }
}

/**
 * Single HTTP orchestration — server runs title → short → long sequentially.
 * Prefer over parallel client step calls to avoid context-injection collapse.
 *
 * @param pipelineExtras.onJobQueued - Optional callback fired when the API
 *   returns 202 with a queued jobId, before polling begins.  Pass
 *   `pipeline.startPolling` from `useListingPipeline` here to drive a
 *   component-level progress indicator.
 */
export async function generateModularPipeline(
  input: ModularGenerateBaseInput,
  hooks?: ModularGenerateClientHooks,
  pipelineExtras?: { onJobQueued?: (jobId: string, versionId?: string) => void },
) {
  return postModularStep<"pipeline", ModularListingState>(
    input,
    "pipeline",
    pipelineExtras?.onJobQueued
      ? { request: { onJobQueued: pipelineExtras.onJobQueued } }
      : undefined,
    hooks,
  );
}

export async function generateModularTitle(
  input: ModularGenerateBaseInput,
  lockedKeywords: string[],
  options?: { isRegenerate?: boolean; request?: ModularStepRequestOptions },
  hooks?: ModularGenerateClientHooks,
) {
  return postModularStep<"title", ModularTitleStepData>(
    input,
    "title",
    {
      lockedKeywords: lockedKeywords.length > 0 ? lockedKeywords : [],
      isRegenerate: options?.isRegenerate ?? false,
      request: options?.request,
    },
    hooks,
  );
}

export async function generateModularShort(
  input: ModularGenerateBaseInput,
  contextTitle: string,
  options?: { isRegenerate?: boolean; request?: ModularStepRequestOptions },
  hooks?: ModularGenerateClientHooks,
) {
  return postModularStep<"short", ModularShortStepData>(
    input,
    "short",
    {
      contextTitle,
      isRegenerate: options?.isRegenerate ?? false,
      request: options?.request,
    },
    hooks,
  );
}

export async function generateModularLong(
  input: ModularGenerateBaseInput,
  context: { title: string; shortDescription: string },
  modularListing?: ModularListingState,
  options?: { userInstruction?: string; isRegenerate?: boolean },
  hooks?: ModularGenerateClientHooks,
) {
  return postModularStep<"long", ModularLongStepData>(
    input,
    "long",
    {
      contextTitle: context.title,
      contextShortDescription: context.shortDescription,
      modularListing,
      userInstruction: options?.userInstruction,
      isRegenerate: options?.isRegenerate ?? false,
    },
    hooks,
  );
}

export async function regenerateModularLongBlock(
  input: ModularGenerateBaseInput,
  block: "hook" | "features" | "closing",
  modularListing: ModularListingState,
  hooks?: ModularGenerateClientHooks,
) {
  const shortRow =
    modularListing.shortDescription.variations[
      modularListing.shortDescription.selectedIndex
    ];
  const short = shortRow ? shortVariationText(shortRow) : "";
  return postModularStep<typeof block, ModularLongStepData>(
    input,
    block,
    {
      contextTitle: modularListing.title.value,
      contextShortDescription: short,
      modularListing,
      isRegenerate: true,
    },
    hooks,
  );
}

export async function finalizeModularListing(
  input: ModularGenerateBaseInput,
  modularListing: ModularListingState,
  hooks?: ModularGenerateClientHooks,
): Promise<GenerateOptimizedListingSuccess | ModularApiError> {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) {
    await hooks?.onWorkspaceHandshakeFailed?.();
    return {
      ok: false,
      status: 409,
      error: {
        code: "workspace_handshake_failed",
        message: "Workspace ID is missing. Re-select your workspace in Keyword Tracker.",
      },
    };
  }

  const timeoutAbort = createListingGenerationAbortSignal();

  try {
    const res = await fetchWithRetry("/api/listings/generate", {
      method: "POST",
      headers: listingGenerateHeaders(workspaceId),
      credentials: "same-origin",
      body: JSON.stringify(
        buildModularRequestBody(input, "finalize", { modularListing }),
      ),
      signal: timeoutAbort.signal,
    });
    releaseListingGenerationAbort(timeoutAbort);

    let json: unknown;
    try {
      json = await parseResponseJson(res);
    } catch {
      return {
        ok: false,
        status: res.status || 502,
        error: {
          code: "invalid_response",
          message: "Could not parse finalize response.",
        },
      };
    }

    if (res.status === 202 && json && typeof json === "object") {
      const accepted = json as {
        jobId?: string;
        code?: string;
        message?: string;
        missingPhases?: Array<"title" | "short" | "long">;
      };

      if (accepted.code === "WAITING_FOR_PHASES") {
        if (accepted.jobId) {
          const polled = await pollListingGenerationJob<
            "finalize",
            ListingGenerationOutput
          >(accepted.jobId, "finalize");
          if (polled.ok) {
            const data =
              polled.modularData ?? (polled as { data?: ListingGenerationOutput }).data;
            if (data) {
              return {
                ok: true,
                data,
                ...(polled.warnings ? { warnings: polled.warnings } : {}),
                ...(polled.meta
                  ? { meta: polled.meta as GenerateOptimizedListingSuccess["meta"] }
                  : {}),
              };
            }
          }
          if (!polled.ok) {
            return {
              ok: false,
              status: polled.status,
              error: polled.error,
            };
          }
        }
        return {
          ok: false,
          status: 202,
          error: {
            code: "WAITING_FOR_PHASES",
            message:
              accepted.message ??
              "Pipeline phases are still processing. Please wait and try again.",
            details: { missingPhases: accepted.missingPhases ?? [] },
          },
        };
      }

      if (accepted.jobId) {
        const polled = await pollListingGenerationJob<
          "finalize",
          ListingGenerationOutput
        >(accepted.jobId, "finalize");
        if (polled.ok) {
          const data = polled.modularData ?? (polled as { data?: ListingGenerationOutput }).data;
          if (data) {
            return {
              ok: true,
              data,
              ...(polled.warnings ? { warnings: polled.warnings } : {}),
              ...(polled.meta
                ? { meta: polled.meta as GenerateOptimizedListingSuccess["meta"] }
                : {}),
            };
          }
        }
        if (!polled.ok) {
          return {
            ok: false,
            status: polled.status,
            error: polled.error,
          };
        }
      }
    }

    if (res.ok && json && typeof json === "object") {
      const body = json as Record<string, unknown>;
      if (body.ok !== false && (body.ok === true || body.data != null)) {
        return {
          ok: true,
          data: body.data as ListingGenerationOutput,
          ...(body.warnings
            ? { warnings: body.warnings as ListingGenerationWarningsPayload }
            : {}),
          ...(body.meta
            ? { meta: body.meta as GenerateOptimizedListingSuccess["meta"] }
            : {}),
        };
      }
    }

    const failureBody =
      json && typeof json === "object"
        ? (json as { ok?: boolean; error?: ModularApiError["error"] })
        : null;
    const error =
      failureBody?.ok === false && failureBody.error
        ? failureBody.error
        : { message: "Finalize failed." };
    return handleModularApiFailure(res, { ok: false, error }, hooks);
  } catch (error) {
    console.error("Frontend Fetch Error:", error);
    if (isListingGenerationClientTimeout(error, timeoutAbort)) {
      return {
        ok: false,
        status: 503,
        aborted: true,
        error: {
          code: "service_unavailable",
          message: LISTING_GENERATION_TIMEOUT_MESSAGE,
        },
      };
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        aborted: true,
        error: {
          code: "request_aborted",
          message: "Finalize was cancelled.",
        },
      };
    }
    return {
      ok: false,
      status: 0,
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : "Network request failed.",
      },
    };
  } finally {
    releaseListingGenerationAbort(timeoutAbort);
  }
}

/** @deprecated Use modular steps; kept for regenerate-all tone variants. */
export async function generateFullListingMonolithic(
  input: ModularGenerateBaseInput,
) {
  return postModularStep<"full", ListingGenerationOutput>(input, "full");
}
