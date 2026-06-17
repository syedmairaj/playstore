/**
 * React Query retry helpers for transient network failures (ERR_NETWORK_CHANGED, ECONNRESET, etc.).
 */

const NETWORK_ERROR_PATTERN =
  /ERR_NETWORK_CHANGED|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network changed|fetch failed|failed to fetch|load failed|network error|network request failed|socket hang up|aborted/i;

export function isRetryableNetworkError(error: unknown): boolean {
  if (error == null) return false;

  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message, error.name);
    const cause = error.cause;
    if (cause instanceof Error) {
      parts.push(cause.message, cause.name);
    } else if (cause != null) {
      parts.push(String(cause));
    }
  } else {
    parts.push(String(error));
  }

  return NETWORK_ERROR_PATTERN.test(parts.join(" "));
}

/** Exponential backoff: 1s → 2s → 4s (cap 8s). */
export function networkRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8000);
}

const MAX_NETWORK_RETRIES = 3;

export function shouldRetryNetworkQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_NETWORK_RETRIES) return false;
  return isRetryableNetworkError(error);
}

export const networkQueryRetryOptions = {
  retry: shouldRetryNetworkQuery,
  retryDelay: networkRetryDelay,
} as const;

export function isActiveContextReconnecting(options: {
  isFetching: boolean;
  isError: boolean;
  failureCount: number;
  error: unknown;
  hasCachedData: boolean;
}): boolean {
  const { isFetching, isError, failureCount, error, hasCachedData } = options;
  if (!isRetryableNetworkError(error) && failureCount === 0) return false;

  if (isFetching && failureCount > 0) return true;
  if (isError && isRetryableNetworkError(error) && !hasCachedData) return true;
  return false;
}
