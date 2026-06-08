/**
 * Error Classification for Runware and Gemini API Calls
 *
 * Determines which errors are transient (retryable) vs permanent (fail fast)
 * Prevents retry loops on client errors, auth failures, or rate limits with backoff
 */

export interface ClassifiedError {
  isRetryable: boolean;
  reason: string;
  code?: string;
  statusCode?: number;
}

/**
 * Classify Runware API errors
 *
 * Retryable:
 * - Network errors (ECONNRESET, ECONNREFUSED, ETIMEDOUT, socket hang up)
 * - 5xx server errors (500, 502, 503, 504)
 * - 429 Rate Limit (always retry with backoff)
 *
 * Not retryable:
 * - 400/401/403 (client/auth errors)
 * - 404 Not Found
 */
export function classifyRunwareError(error: unknown): ClassifiedError {
  // Network-level errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const code = (error as NodeJS.ErrnoException).code;

    // Connection errors
    if (
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "EHOSTUNREACH" ||
      code === "ENETUNREACH"
    ) {
      return {
        isRetryable: true,
        reason: `Network error: ${code}`,
        code,
      };
    }

    // Socket/timeout errors
    if (
      message.includes("socket hang up") ||
      message.includes("timed out") ||
      message.includes("econnreset")
    ) {
      return {
        isRetryable: true,
        reason: `Connection error: ${message}`,
      };
    }
  }

  // HTTP status code errors
  if (error instanceof Error && "status" in error) {
    const status = (error as any).status as number | undefined;

    if (!status) {
      return {
        isRetryable: true,
        reason: "Unknown error, attempting retry",
      };
    }

    // 5xx errors are retryable
    if (status >= 500 && status < 600) {
      return {
        isRetryable: true,
        reason: `Server error (${status}), retrying`,
        statusCode: status,
      };
    }

    // 429 Rate Limit is retryable
    if (status === 429) {
      return {
        isRetryable: true,
        reason: "Rate limited (429), backing off",
        statusCode: status,
      };
    }

    // 408 Request Timeout is retryable
    if (status === 408) {
      return {
        isRetryable: true,
        reason: "Request timeout (408), retrying",
        statusCode: status,
      };
    }

    // 4xx client errors are NOT retryable (except 408/429)
    if (status >= 400 && status < 500) {
      return {
        isRetryable: false,
        reason: `Client error (${status}), not retrying`,
        statusCode: status,
      };
    }

    // 3xx redirects are NOT retryable (should be followed by HTTP client)
    if (status >= 300 && status < 400) {
      return {
        isRetryable: false,
        reason: `Redirect (${status}), not retrying`,
        statusCode: status,
      };
    }
  }

  // If we can't determine, don't retry
  return {
    isRetryable: false,
    reason: "Unknown error type, not retrying",
  };
}

/**
 * Classify Gemini API errors
 *
 * Retryable:
 * - Network errors (same as Runware)
 * - 500/502/503/504 (server errors)
 * - 429 Rate Limit
 * - "INTERNAL" error from Gemini SDK
 * - "TIMEOUT" from Gemini SDK
 *
 * Not retryable:
 * - 400 Bad Request (malformed prompt)
 * - 401/403 Auth errors
 * - 404 Model not found
 * - "INVALID_ARGUMENT" from Gemini SDK
 * - "PERMISSION_DENIED" from Gemini SDK
 */
export function classifyGeminiError(error: unknown): ClassifiedError {
  // Network-level errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const code = (error as NodeJS.ErrnoException).code;

    // Connection errors
    if (
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "EHOSTUNREACH"
    ) {
      return {
        isRetryable: true,
        reason: `Network error: ${code}`,
        code,
      };
    }

    // Socket/timeout errors
    if (message.includes("socket hang up") || message.includes("timed out")) {
      return {
        isRetryable: true,
        reason: `Connection error: ${message}`,
      };
    }

    // Gemini SDK-specific error codes (documented in google-generativeai package)
    if ("status" in error) {
      const status = (error as any).status as string | undefined;

      // INTERNAL errors are server-side transients
      if (status === "INTERNAL") {
        return {
          isRetryable: true,
          reason: "Gemini internal error, retrying",
          code: "INTERNAL",
        };
      }

      // UNAVAILABLE = service temporarily down
      if (status === "UNAVAILABLE") {
        return {
          isRetryable: true,
          reason: "Gemini service unavailable, retrying",
          code: "UNAVAILABLE",
        };
      }

      // DEADLINE_EXCEEDED = timeout on provider side
      if (status === "DEADLINE_EXCEEDED") {
        return {
          isRetryable: true,
          reason: "Gemini deadline exceeded, retrying",
          code: "DEADLINE_EXCEEDED",
        };
      }

      // RESOURCE_EXHAUSTED = usually rate limit
      if (status === "RESOURCE_EXHAUSTED") {
        return {
          isRetryable: true,
          reason: "Gemini resource exhausted (rate limit), backing off",
          code: "RESOURCE_EXHAUSTED",
        };
      }

      // INVALID_ARGUMENT = malformed request (don't retry)
      if (status === "INVALID_ARGUMENT") {
        return {
          isRetryable: false,
          reason: "Invalid argument to Gemini API, not retrying",
          code: "INVALID_ARGUMENT",
        };
      }

      // PERMISSION_DENIED = auth/quota (don't retry)
      if (status === "PERMISSION_DENIED") {
        return {
          isRetryable: false,
          reason: "Permission denied by Gemini API, not retrying",
          code: "PERMISSION_DENIED",
        };
      }

      // NOT_FOUND = model doesn't exist
      if (status === "NOT_FOUND") {
        return {
          isRetryable: false,
          reason: "Gemini model not found, not retrying",
          code: "NOT_FOUND",
        };
      }
    }
  }

  // HTTP-level status codes (if error has a statusCode property)
  if (error instanceof Error && "statusCode" in error) {
    const statusCode = (error as any).statusCode as number | undefined;

    if (statusCode && statusCode >= 500) {
      return {
        isRetryable: true,
        reason: `Server error (${statusCode}), retrying`,
        statusCode,
      };
    }

    if (statusCode === 429) {
      return {
        isRetryable: true,
        reason: "Rate limited (429), backing off",
        statusCode: 429,
      };
    }

    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return {
        isRetryable: false,
        reason: `Client error (${statusCode}), not retrying`,
        statusCode,
      };
    }
  }

  // Default: don't retry unknown errors
  return {
    isRetryable: false,
    reason: "Unknown error type, not retrying",
  };
}

/**
 * Determine if a Runware error should be retried
 * Compatible with RetryConfig.isRetryable callback
 */
export function isRunwareRetryable(error: unknown): boolean {
  return classifyRunwareError(error).isRetryable;
}

/**
 * Determine if a Gemini error should be retried
 * Compatible with RetryConfig.isRetryable callback
 */
export function isGeminiRetryable(error: unknown): boolean {
  return classifyGeminiError(error).isRetryable;
}
