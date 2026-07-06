import type { OptimizationQueueSynthesisPayload } from "@/lib/optimization-queue";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { logClientContextAudit } from "@/lib/client/context-audit-log-client";
import { fetchWithRetry } from "@/lib/client/fetch-with-retry";
import { pollListingGenerationJob } from "@/lib/client/poll-listing-generation-status";
import { createListingGenerationAbortSignal, isListingGenerationClientTimeout, releaseListingGenerationAbort } from "@/lib/client/listing-generation-abort";
import {
  LISTING_GENERATION_TIMEOUT_MESSAGE,
} from "@/lib/listing/listing-fast-draft";
import {
  sanitizeActiveContextForGenerate,
  sanitizeTrackedKeywordSignalsForGenerate,
} from "@/lib/listing/sanitize-listing-generate-payload";
import { capLockedKeywords } from "@/lib/validation/listing-modular-generate-body";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";
import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import { sanitizeModularListingForApiIngress } from "@/lib/listing/sanitize-modular-listing-for-api";

export type GenerateOptimizedListingSuccess = {
  ok: true;
  data: ListingGenerationOutput;
  warnings?: ListingGenerationWarningsPayload;
  modularDraftShort?: {
    variations: Array<{ type: string; text: string }>;
  };
  meta?: {
    model?: string;
    promptVersion?: string;
    persisted?: boolean;
    generationId?: string;
    savedAt?: string;
    asoScorePartial?: boolean;
    retried?: boolean;
    shortDescriptionClamped?: boolean;
    creditsCharged?: number;
    creditsRemaining?: number;
    quality_status?: "All signals active. Synthesis mode: Maximum.";
    quality_warning?: "Listing generated using partial data. Add Review, Market, or Competitor signals for a more comprehensive strategy.";
  };
};

export type GenerateOptimizedListingError = {
  ok: false;
  status: number;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    remaining?: number;
    required?: number;
  };
};

export type GenerateOptimizedListingResult =
  | GenerateOptimizedListingSuccess
  | GenerateOptimizedListingError;

export type GenerateOptimizedListingInput = {
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
  /** Vault row count at synthesis time — for Context Audit only. */
  queueItemCount?: number;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
  /** Instant-draft modular UI state — syncs persisted_phases before full generation. */
  modularListing?: ModularListingState;
};

/**
 * Client service — POST /api/listings/generate.
 * Validation/guardrails run before this is called.
 */
export async function generateOptimizedListing(
  input: GenerateOptimizedListingInput,
): Promise<GenerateOptimizedListingResult> {
  const { queueSynthesis } = input;
  const effectiveInstruction = input.userInstruction?.trim();
  const activeContext = sanitizeActiveContextForGenerate(queueSynthesis.activeContext);
  const trackedKeywordSignals = sanitizeTrackedKeywordSignalsForGenerate(
    queueSynthesis.trackedKeywordSignals,
  );

  logClientContextAudit({
    workspaceId: input.workspaceId,
    appId: input.appId,
    queueItemCount: input.queueItemCount ?? 0,
    queueHash: input.queueHash,
    vaultLocale: input.vaultLocale,
    synthesis: { ...queueSynthesis, activeContext, trackedKeywordSignals },
  });

  const timeoutAbort = createListingGenerationAbortSignal();

  try {
    const res = await fetchWithRetry("/api/listings/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workspace-Id": input.workspaceId,
      },
      credentials: "same-origin",
      body: JSON.stringify({
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
        generationStep: "full" as const,
        includeOptimizerContext: true,
        lockedKeywords: capLockedKeywords(
          input.targetKeywords.split(/[,;\n]+/),
        ),
        ...(effectiveInstruction ? { userInstruction: effectiveInstruction } : {}),
        activeContext,
        ...(trackedKeywordSignals.length > 0 ? { trackedKeywordSignals } : {}),
        strategyMode: queueSynthesis.strategyMode,
        ...(queueSynthesis.topStagedIssues.length > 0
          ? { topStagedIssues: queueSynthesis.topStagedIssues }
          : {}),
        activeSignalTypes: queueSynthesis.activeSignalTypes,
        ...(input.modularListing
          ? {
              modularListing: sanitizeModularListingForApiIngress(
                input.modularListing,
              ),
            }
          : {}),
      }),
      signal: timeoutAbort.signal,
    });
    releaseListingGenerationAbort(timeoutAbort);

    let json: unknown;
    try {
      json = await res.json();
    } catch (error) {
      console.error("Frontend Fetch Error:", error);
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
        code?: string;
        missingPhases?: string[];
        message?: string;
      };
      if (accepted.code === "WAITING_FOR_PHASES") {
        return {
          ok: false,
          status: 202,
          error: {
            code: "WAITING_FOR_PHASES",
            message:
              accepted.message ?? "Pipeline phases are still processing. Try again shortly.",
            details: { missingPhases: accepted.missingPhases },
          },
        };
      }
      if (accepted.jobId) {
        const polled = await pollListingGenerationJob<"full", ListingGenerationOutput>(
          accepted.jobId,
          "full",
        );
        if (polled.ok) {
          const data =
            (polled as { data?: ListingGenerationOutput }).data ??
            polled.modularData;
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
          ...(body.modularDraftShort
            ? {
                modularDraftShort: body.modularDraftShort as GenerateOptimizedListingSuccess["modularDraftShort"],
              }
            : {}),
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
        ? (json as { ok?: boolean; error?: GenerateOptimizedListingError["error"] })
        : null;

    return {
      ok: false,
      status: res.status,
      error:
        failureBody?.ok === false && failureBody.error
          ? failureBody.error
          : { message: "Generation failed." },
    };
  } catch (error) {
    console.error("Frontend Fetch Error:", error);
    if (isListingGenerationClientTimeout(error, timeoutAbort)) {
      return {
        ok: false,
        status: 503,
        error: {
          code: "service_unavailable",
          message: LISTING_GENERATION_TIMEOUT_MESSAGE,
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
