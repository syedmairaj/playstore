type FetchWithRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** HTTP status codes that should trigger a retry (defaults to 500, 502, 503, 504). */
  retryStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryResponse(
  response: Response,
  retryStatuses: number[],
): boolean {
  return retryStatuses.includes(response.status);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * fetch with exponential backoff for transient provider / gateway failures.
 * When `init.signal` is set, retries are disabled and abort propagates immediately.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchWithRetryOptions,
): Promise<Response> {
  const hasAbortSignal = Boolean(init?.signal);
  const maxAttempts = hasAbortSignal
    ? 1
    : Math.max(1, options?.maxAttempts ?? 3);
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const retryStatuses = options?.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    try {
      const response = await fetch(input, init);
      lastResponse = response;

      if (attempt < maxAttempts && shouldRetryResponse(response, retryStatuses)) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }

      return response;
    } catch (error) {
      if (isAbortError(error) || init?.signal?.aborted) {
        throw error;
      }
      lastError = error;
      if (attempt >= maxAttempts) break;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("Network request failed.");
}
