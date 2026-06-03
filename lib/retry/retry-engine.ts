/**
 * Core Retry Engine with Exponential Backoff + Jitter
 * Prevents 'thundering herd' issues against provider APIs
 *
 * Strategy:
 * - Initial delay: 600ms
 * - Backoff multiplier: 2x per retry
 * - Jitter: ±20% random variance to spread retry load
 * - Max retries: 3 (configurable per call)
 * - Total worst-case time: ~5.4s (600ms + 1.2s + 2.4s + jitter)
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (not including the initial attempt) */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelayMs?: number;
  /** Backoff multiplier (2 = exponential doubling) */
  backoffMultiplier?: number;
  /** Jitter amount as a fraction of delay (0.2 = ±20%) */
  jitterFraction?: number;
  /** Optional timeout per attempt in milliseconds */
  timeoutMs?: number;
  /** Classifier function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
  totalDurationMs: number;
  lastError?: string;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 600,
  backoffMultiplier: 2,
  jitterFraction: 0.2, // ±20%
  timeoutMs: 30000,
  isRetryable: () => true, // Retry all errors by default
};

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt - Attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const exponentialDelay = cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt);
  const jitterAmount = exponentialDelay * cfg.jitterFraction;
  const jitter = (Math.random() - 0.5) * 2 * jitterAmount; // ±jitterAmount
  return Math.max(0, exponentialDelay + jitter);
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core retry engine
 * Wraps an async function with exponential backoff retry logic
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => callRunware(request),
 *   {
 *     maxRetries: 3,
 *     initialDelayMs: 600,
 *     isRetryable: (error) => error.code === 'ECONNRESET' || error.status === 429
 *   }
 * );
 *
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(`Failed after ${result.attempts} attempts:`, result.lastError);
 * }
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<RetryResult<T>> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: unknown;
  let lastErrorMessage: string = "";

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      // Apply timeout if configured
      if (cfg.timeoutMs && cfg.timeoutMs > 0) {
        const data = await Promise.race([
          fn(),
          new Promise<T>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Operation timed out after ${cfg.timeoutMs}ms`)),
              cfg.timeoutMs
            )
          ),
        ]);
        return {
          success: true,
          data,
          attempts: attempt + 1,
          totalDurationMs: Date.now() - startTime,
        };
      }

      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt + 1,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error;
      lastErrorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if error is retryable
      if (!cfg.isRetryable(error)) {
        return {
          success: false,
          error,
          attempts: attempt + 1,
          totalDurationMs: Date.now() - startTime,
          lastError: lastErrorMessage,
        };
      }

      // If this was the last attempt, return failure
      if (attempt === cfg.maxRetries) {
        return {
          success: false,
          error,
          attempts: attempt + 1,
          totalDurationMs: Date.now() - startTime,
          lastError: lastErrorMessage,
        };
      }

      // Calculate delay and retry
      const delayMs = calculateBackoffDelay(attempt, cfg);
      await sleep(delayMs);
    }
  }

  // Fallback (should not reach here, but satisfies TypeScript)
  return {
    success: false,
    error: lastError,
    attempts: cfg.maxRetries + 1,
    totalDurationMs: Date.now() - startTime,
    lastError: lastErrorMessage,
  };
}

/**
 * Utility to create a retry-wrapped function
 * Useful for one-off wrapping of provider API calls
 *
 * @example
 * ```typescript
 * const callRunwareWithRetry = createRetryWrapper(
 *   (req) => callRunware(req),
 *   { maxRetries: 3, isRetryable: isRunwareRetryable }
 * );
 *
 * const result = await callRunwareWithRetry(request);
 * ```
 */
export function createRetryWrapper<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  config?: RetryConfig
): (...args: Args) => Promise<RetryResult<T>> {
  return (...args: Args) =>
    retryWithBackoff(() => fn(...args), config);
}
