"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ListingGenerationJobStatus,
  ListingGenerationPhase,
  ListingGenerationJobResult,
} from "@/lib/listing/listing-generation-job.types";
import {
  EMPTY_PARTIAL_CONTENT,
  computeDetailedProgress,
  type PartialListingContent,
} from "@/lib/listing/pipeline-progress.types";

// ──────────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Every state the pipeline UI can be in, including the two new production
 * states introduced in Session 5:
 *
 *  • `waiting`  — the producer returned 202 WAITING_FOR_PHASES (prerequisites
 *                 still processing); poll will retry automatically.
 *  • `stale`    — the worker returned 409 stale_vault_context; the user must
 *                 update their queue and re-submit.
 */
export type PipelineStatus =
  | "idle"
  | "queued"
  | "waiting"
  | "processing"
  | "completed"
  | "stale"
  | "error";

export type PipelinePhaseProgress = {
  title: boolean;
  short: boolean;
  long: boolean;
  full: boolean;
};

export type PipelineError = {
  code: string;
  message: string;
};

export type PipelineState =
  | { status: "idle" }
  | {
      status: "queued";
      jobId: string;
      queueHash: string;
      progress: PipelinePhaseProgress;
      /** Partial text content available so far — all null while queued. */
      partialContent: PartialListingContent;
    }
  | { status: "waiting"; jobId?: string; queueHash: string; missingPhases?: string[] }
  | {
      status: "processing";
      jobId: string;
      queueHash: string;
      currentPhase: ListingGenerationPhase | null;
      progress: PipelinePhaseProgress;
      /** Partial text content streaming in as phases complete. */
      partialContent: PartialListingContent;
    }
  | { status: "completed"; jobId: string; queueHash: string; result: ListingGenerationJobResult; progress: PipelinePhaseProgress }
  | { status: "stale"; jobId?: string; queueHash: string; serverQueueHash?: string }
  | { status: "error"; jobId?: string; queueHash?: string; error: PipelineError };

// ──────────────────────────────────────────────────────────────────────────────
// Polling config
// ──────────────────────────────────────────────────────────────────────────────

/** Starting interval for the exponential backoff. */
const BACKOFF_BASE_MS = 1_500;
/** Each interval is multiplied by this factor after a non-terminal response. */
const BACKOFF_MULTIPLIER = 1.4;
/** Cap on the backoff interval. */
const BACKOFF_MAX_MS = 15_000;
/** Maximum total polling duration before the hook gives up. */
const MAX_POLL_DURATION_MS = 300_000; // 5 minutes

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nextInterval(current: number): number {
  return clamp(Math.round(current * BACKOFF_MULTIPLIER), BACKOFF_BASE_MS, BACKOFF_MAX_MS);
}

// ──────────────────────────────────────────────────────────────────────────────
// Status endpoint shape
// ──────────────────────────────────────────────────────────────────────────────

type StatusApiResponse = {
  ok: true;
  jobId: string;
  workspaceId: string;
  queueHash: string;
  status: ListingGenerationJobStatus | null;
  currentPhase: ListingGenerationPhase | null;
  phases: PipelinePhaseProgress;
  error: string | null;
  result: ListingGenerationJobResult | null;
  /** Partial text content extracted incrementally during processing. */
  partialContent?: PartialListingContent;
  /**
   * The DB row's updated_at timestamp — included so the client debug log can
   * verify that each poll is fetching a fresher row than the previous one.
   */
  draftUpdatedAt?: string | null;
};

type StatusApiError = {
  ok: false;
  error?: { code?: string; message?: string; serverQueueHash?: string };
};

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export type UseListingPipelineOptions = {
  /** QStash job id returned by POST /api/listings/generate. */
  jobId: string | null;
  /** Active optimization queue hash — used to detect stale-context responses. */
  queueHash: string;
  /**
   * Expected generation step label for display ("title" | "short" | "long" |
   * "pipeline" | …).  Drives the status string shown to the user and helps
   * identify which phase is actively processing.
   */
  phase: ListingGenerationPhase | "pipeline";
  /** Override maximum polling duration in milliseconds. */
  maxPollMs?: number;
};

export type UseListingPipelineReturn = {
  /** Current pipeline state — discriminated union; switch on `pipelineState.status`. */
  pipelineState: PipelineState;
  /**
   * 0–100 progress estimate.  Advances as phases complete; 100 when completed.
   * Uses computeDetailedProgress for accurate phase-milestone mapping.
   */
  progressPercent: number;
  /**
   * Partial text content streaming in from the database as each pipeline phase
   * writes its result.  All fields are null while status = "queued" or early
   * "processing".  Components should render skeletons when a field is null.
   */
  partialContent: PartialListingContent;
  /** Manually reset the hook to `idle` (e.g. after the user dismisses an error). */
  reset: () => void;
  /** Start polling for a new jobId (called by parent after successful 202 enqueue). */
  startPolling: (jobId: string, initialStatus?: ListingGenerationJobStatus) => void;
};

function computeProgress(phases: PipelinePhaseProgress, status: PipelineStatus): number {
  if (status === "idle") return 0;
  if (status === "completed") return 100;
  const completed = [phases.title, phases.short, phases.long, phases.full].filter(Boolean).length;
  // Reserve the last 10% for finalize
  return clamp(completed * 22 + 10, 10, 90);
}

export function useListingPipeline({
  jobId: initialJobId,
  queueHash,
  maxPollMs = MAX_POLL_DURATION_MS,
}: UseListingPipelineOptions): UseListingPipelineReturn {
  const [pipelineState, setPipelineState] = useState<PipelineState>({ status: "idle" });
  const activeJobIdRef = useRef<string | null>(initialJobId);
  const pollStartedRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIntervalRef = useRef<number>(BACKOFF_BASE_MS);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearPollTimer = useCallback(() => {
    if (intervalRef.current != null) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearPollTimer();
    activeJobIdRef.current = null;
    pollStartedRef.current = null;
    currentIntervalRef.current = BACKOFF_BASE_MS;
    setPipelineState({ status: "idle" });
  }, [clearPollTimer]);

  const poll = useCallback(async (jobId: string) => {
    if (abortControllerRef.current?.signal.aborted) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let json: StatusApiResponse | StatusApiError;
    try {
      // Append a timestamp to defeat any HTTP-level or browser-level cache that
      // ignores our Cache-Control: no-store response headers.  The _ts param is
      // intentionally NOT encoded so the server can log it for debugging if needed.
      const url = `/api/listings/status?jobId=${encodeURIComponent(jobId)}&_ts=${Date.now()}`;
      const res = await fetch(url, {
        credentials: "same-origin",
        // Instruct the browser Fetch API to bypass its own HTTP cache entirely.
        // This is the client-side counterpart of the server's no-store header.
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as StatusApiError;

        // 409 stale_vault_context — user must restart generation
        if (res.status === 409 || body?.error?.code === "stale_vault_context") {
          setPipelineState({
            status: "stale",
            jobId,
            queueHash,
            serverQueueHash: body?.error?.serverQueueHash,
          });
          clearPollTimer();
          return;
        }

        console.error(
          JSON.stringify({
            event: "pipeline_poll_http_error",
            jobId,
            status: res.status,
            code: body?.error?.code,
          }),
        );
        setPipelineState({
          status: "error",
          jobId,
          queueHash,
          error: {
            code: body?.error?.code ?? "poll_failed",
            message: body?.error?.message ?? "Failed to fetch job status.",
          },
        });
        clearPollTimer();
        return;
      }

      json = (await res.json()) as StatusApiResponse | StatusApiError;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(JSON.stringify({ event: "pipeline_poll_fetch_error", jobId, error: String(err) }));
      setPipelineState({
        status: "error",
        jobId,
        queueHash,
        error: { code: "network_error", message: "Network error while polling job status." },
      });
      clearPollTimer();
      return;
    }

    if (!json.ok) {
      const errorBody = json as StatusApiError;
      const code = errorBody.error?.code ?? "status_error";

      // stale context surfaced via job.error text
      if (code === "stale_vault_context") {
        setPipelineState({
          status: "stale",
          jobId,
          queueHash,
          serverQueueHash: errorBody.error?.serverQueueHash,
        });
        clearPollTimer();
        return;
      }
      setPipelineState({
        status: "error",
        jobId,
        queueHash,
        error: { code, message: errorBody.error?.message ?? "Job status error." },
      });
      clearPollTimer();
      return;
    }

    const statusData = json as StatusApiResponse;
    const jobStatus = statusData.status;
    const phases = statusData.phases ?? { title: false, short: false, long: false, full: false };
    const partialContent: PartialListingContent = statusData.partialContent ?? EMPTY_PARTIAL_CONTENT;

    // Debug: log each poll result so the browser console confirms we are
    // receiving fresh DB rows.  Filter by event="pipeline_poll_tick" to verify
    // draftUpdatedAt advances between polls and partialContent fills in over time.
    if (process.env.NODE_ENV !== "production") {
      console.log(
        JSON.stringify({
          event: "pipeline_poll_tick",
          jobId,
          status: jobStatus,
          currentPhase: statusData.currentPhase,
          phases,
          hasTitle: !!partialContent.title,
          hasShort: !!partialContent.shortDescription,
          hasLong: !!partialContent.longDescription,
          draftUpdatedAt: statusData.draftUpdatedAt ?? null,
          ts: Date.now(),
        }),
      );
    }

    // ── Terminal: completed ───────────────────────────────────────────────────
    if (jobStatus === "completed") {
      if (statusData.result) {
        setPipelineState({
          status: "completed",
          jobId,
          queueHash,
          result: statusData.result,
          progress: phases,
        });
      } else {
        // Job is marked completed but generation_result is null.  This can
        // happen when the executor writes status="completed" but the DLQ or
        // a write-verification failure prevented the result from being stored.
        // We must treat this as a terminal error — NOT reschedule — otherwise
        // the poll loop runs forever because no other exit path handles a
        // completed row without a result.
        console.error(
          JSON.stringify({
            event: "pipeline_poll_completed_no_result",
            jobId,
            queueHash,
          }),
        );
        setPipelineState({
          status: "error",
          jobId,
          queueHash,
          error: {
            code: "generation_result_missing",
            message: "Generation completed but the result was not saved. Please try again.",
          },
        });
      }
      clearPollTimer();
      return;
    }

    // ── Terminal: failed / failed_permanently ─────────────────────────────────
    // failed_permanently means the job entered the DLQ; no automatic retry is
    // possible.  Inspect the error message for stale-context signals.
    if (jobStatus === "failed" || jobStatus === "failed_permanently") {
      const errMsg = statusData.error ?? "";
      const isStale =
        errMsg.includes("stale_vault_context") ||
        errMsg.includes("Vault context is stale") ||
        errMsg.includes("optimization queue was modified");

      if (isStale) {
        setPipelineState({ status: "stale", jobId, queueHash });
      } else {
        setPipelineState({
          status: "error",
          jobId,
          queueHash,
          error: {
            code: jobStatus === "failed_permanently" ? "generation_failed_permanently" : "generation_failed",
            message: errMsg || "Listing generation failed.",
          },
        });
      }
      clearPollTimer();
      return;
    }

    // ── Timeout guard ─────────────────────────────────────────────────────────
    if (pollStartedRef.current != null && Date.now() - pollStartedRef.current > maxPollMs) {
      setPipelineState({
        status: "error",
        jobId,
        queueHash,
        error: { code: "generation_timeout", message: "Generation is taking longer than expected." },
      });
      clearPollTimer();
      return;
    }

    // ── Non-terminal: pending or processing — reschedule with backoff ─────────
    // Defensively guard against unknown terminal-looking statuses falling
    // through here and creating unintended polling loops.
    if (jobStatus !== "pending" && jobStatus !== "processing") {
      console.warn(
        JSON.stringify({
          event: "pipeline_poll_unrecognised_status",
          jobId,
          queueHash,
          jobStatus,
        }),
      );
      setPipelineState({
        status: "error",
        jobId,
        queueHash,
        error: { code: "unknown_status", message: `Unrecognised job status: ${jobStatus ?? "null"}.` },
      });
      clearPollTimer();
      return;
    }

    setPipelineState({
      status: jobStatus === "processing" ? "processing" : "queued",
      jobId,
      queueHash,
      currentPhase: statusData.currentPhase,
      progress: phases,
      partialContent,
    });

    currentIntervalRef.current = nextInterval(currentIntervalRef.current);
    intervalRef.current = setTimeout(() => {
      poll(jobId).catch(console.error);
    }, currentIntervalRef.current);
  }, [queueHash, clearPollTimer, maxPollMs]);

  const startPolling = useCallback(
    (jobId: string, initialStatus?: ListingGenerationJobStatus) => {
      clearPollTimer();

      const isNewJob = activeJobIdRef.current !== jobId;
      activeJobIdRef.current = jobId;

      // Reset the timeout clock only for genuinely new jobs.  When the
      // auto-chain flow calls onJobQueued for each phase (title → short →
      // long → full), every call would otherwise restart the 30-second window,
      // making the effective timeout 30s × (number of phases).  By preserving
      // the original start time for the same polling session, maxPollMs is
      // measured from the very first generate attempt.
      if (isNewJob || pollStartedRef.current === null) {
        pollStartedRef.current = Date.now();
      }

      currentIntervalRef.current = BACKOFF_BASE_MS;

      const emptyProgress: PipelinePhaseProgress = { title: false, short: false, long: false, full: false };
      const status: PipelineStatus =
        initialStatus === "processing" ? "processing" : "queued";

      // ── Explicit partialContent wipe ───────────────────────────────────────
      // Always reset partialContent to EMPTY when starting a new polling session.
      // This prevents stale text from a previous generation run from lingering
      // in the UI for the first render cycle of the new job, which is the root
      // cause of the "Stale Data" symptom: title/short fields flash old content
      // briefly before the first poll overwrites them.
      // This is safe even for the auto-chain case (same job re-polled) because
      // the first poll response will restore the partial content immediately.
      setPipelineState({
        status,
        jobId,
        queueHash,
        currentPhase: null,
        progress: emptyProgress,
        partialContent: EMPTY_PARTIAL_CONTENT,
      } as PipelineState);

      // Start first poll immediately
      poll(jobId).catch(console.error);
    },
    [clearPollTimer, queueHash, poll],
  );

  // Start polling automatically when jobId prop is provided
  useEffect(() => {
    if (initialJobId && initialJobId !== activeJobIdRef.current) {
      startPolling(initialJobId);
    }
  }, [initialJobId, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearPollTimer();
  }, [clearPollTimer]);

  const progressPercent = (() => {
    const s = pipelineState;
    if (s.status === "idle") return 0;
    if (s.status === "completed") return 100;
    if (s.status === "stale" || s.status === "error") return 0;
    if (s.status === "waiting") return 5;
    const phases =
      "progress" in s ? s.progress : { title: false, short: false, long: false, full: false };
    const currentPhase =
      "currentPhase" in s && s.currentPhase ? s.currentPhase : null;
    return computeDetailedProgress(phases, currentPhase, s.status);
  })();

  const partialContent: PartialListingContent =
    "partialContent" in pipelineState
      ? pipelineState.partialContent
      : EMPTY_PARTIAL_CONTENT;

  return { pipelineState, progressPercent, partialContent, reset, startPolling };
}
