import { LISTING_GENERATION_TIMEOUT_MS } from "@/lib/listing/listing-fast-draft";

export const LISTING_GENERATION_ABORT_REASON = "listing_generation_client_timeout";

export type ListingGenerationAbortHandle = {
  signal: AbortSignal;
  dispose: () => void;
  didTimeout: () => boolean;
};

/** Abort signal with a fixed budget for listing generation HTTP calls. */
export function createListingGenerationAbortSignal(): ListingGenerationAbortHandle {
  let disposed = false;
  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    if (disposed) return;
    timedOut = true;
    controller.abort(
      new DOMException(LISTING_GENERATION_ABORT_REASON, "TimeoutError"),
    );
  }, LISTING_GENERATION_TIMEOUT_MS);

  return {
    signal: controller.signal,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
    },
    didTimeout: () => timedOut,
  };
}

/** Stop the client timeout as soon as the HTTP response is available. */
export function releaseListingGenerationAbort(
  handle: ListingGenerationAbortHandle | null | undefined,
): void {
  handle?.dispose();
}

export function isListingGenerationClientTimeout(
  error: unknown,
  handle?: ListingGenerationAbortHandle | null,
): boolean {
  if (handle?.didTimeout()) return true;
  if (error instanceof DOMException) {
    if (error.name === "TimeoutError") return true;
    if (error.message === LISTING_GENERATION_ABORT_REASON) return true;
  }
  return false;
}
