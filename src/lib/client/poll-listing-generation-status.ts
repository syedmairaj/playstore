import type { ListingGenerationJobResult } from "@/lib/listing/listing-generation-job.types";
import type { ModularListingGenerationStep } from "@/lib/listing/modular-listing.types";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";

type StatusResponse = {
  ok: true;
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | "failed_permanently" | null;
  currentPhase: string | null;
  error: string | null;
  result: ListingGenerationJobResult | null;
};

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MAX_WAIT_MS = 300_000;

type PollSuccess<TStep extends ModularListingGenerationStep, TData> = {
  ok: true;
  generationStep: TStep;
  modularData?: TData;
  data?: unknown;
  warnings?: ListingGenerationWarningsPayload;
  meta?: Record<string, unknown>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollListingGenerationJob<TStep extends ModularListingGenerationStep, TData>(
  jobId: string,
  step: TStep,
  options?: {
    intervalMs?: number;
    maxWaitMs?: number;
    signal?: AbortSignal;
  },
): Promise<
  PollSuccess<TStep, TData> | { ok: false; status: number; error: { code: string; message: string } }
> {
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    if (options?.signal?.aborted) {
      return {
        ok: false,
        status: 499,
        error: { code: "aborted", message: "Listing generation was cancelled." },
      };
    }

    const res = await fetch(
      `/api/listings/status?jobId=${encodeURIComponent(jobId)}`,
      { credentials: "same-origin", ...(options?.signal ? { signal: options.signal } : {}) },
    );
    const json = (await res.json()) as StatusResponse & {
      ok: false;
      error?: { code: string; message: string };
    };

    if (!res.ok || !json.ok) {
      return {
        ok: false,
        status: res.status,
        error: json.error ?? { code: "status_error", message: "Failed to load job status" },
      };
    }

    // ── Terminal failure statuses ───────────────────────────────────────────
    if (json.status === "failed" || json.status === "failed_permanently") {
      return {
        ok: false,
        status: 500,
        error: {
          code: "generation_failed",
          message: json.error ?? "Listing generation failed. Please try again.",
        },
      };
    }

    // ── Completed — always terminal regardless of result presence ──────────
    //
    // Do NOT loop when status is "completed" but result is null.  This was the
    // root cause of the "infinite 2-second polling" bug: null result + completed
    // failed the truthiness check and fell through to `sleep`, turning what
    // should be a one-shot read into a 5-minute busy-wait.
    if (json.status === "completed") {
      if (json.result) {
        const result = json.result;
        const generationStep = (result.generationStep ?? step) as TStep;
        const modularData = (result.modularData ?? result.data) as TData | undefined;
        return {
          ok: true,
          generationStep,
          ...(modularData !== undefined ? { modularData } : {}),
          ...(result.warnings
            ? { warnings: result.warnings as ListingGenerationWarningsPayload }
            : {}),
          ...(result.meta ? { meta: result.meta } : {}),
        };
      }
      // Completed but no result written — treat as a write-verification failure.
      return {
        ok: false,
        status: 500,
        error: {
          code: "generation_result_missing",
          message:
            "Generation finished but the result was not saved. Please try again.",
        },
      };
    }

    // ── Unknown terminal-looking statuses — don't loop forever ─────────────
    // Any status that is not "pending" or "processing" is unexpected here.
    // Return an error immediately rather than burning through the maxWaitMs
    // budget with pointless polls.
    if (json.status !== "pending" && json.status !== "processing") {
      return {
        ok: false,
        status: 500,
        error: {
          code: "generation_failed",
          message: `Unexpected job status: ${String(json.status)}. Please try again.`,
        },
      };
    }

    await sleep(intervalMs);
  }

  return {
    ok: false,
    status: 504,
    error: {
      code: "generation_timeout",
      message: "Listing generation is taking longer than expected. Check back shortly.",
    },
  };
}
