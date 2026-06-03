/**
 * Runware API Retry Wrapper
 *
 * Wraps Runware API calls with exponential backoff + jitter retry logic.
 * Automatically classifies errors and retries transient failures.
 *
 * Usage:
 * ```typescript
 * const result = await callRunwareWithRetry(request);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(`Runware call failed: ${result.lastError}`);
 * }
 * ```
 */

import {
  retryWithBackoff,
  type RetryConfig,
  type RetryResult,
} from "./retry-engine";
import {
  classifyRunwareError,
  isRunwareRetryable,
} from "./error-classifier";

/**
 * Configuration for Runware retry behavior
 * Defaults:
 * - 3 retries (4 attempts total)
 * - Initial 600ms delay, exponential backoff (2x)
 * - 30s timeout per attempt
 * - ±20% jitter on delays
 */
export interface RunwareRetryConfig extends RetryConfig {
  /** Enable debug logging of retry attempts */
  debug?: boolean;
}

/**
 * Call Runware API with automatic retry and backoff
 *
 * @param fn - Async function that calls Runware API
 * @param config - Retry configuration (optional)
 * @returns Retry result with success/failure status and metadata
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await callRunwareWithRetry(
 *   () => runware.requestImages({
 *     prompt: "...",
 *     model: "FLUX.1-dev",
 *     steps: 20,
 *   })
 * );
 *
 * // With custom config
 * const result = await callRunwareWithRetry(
 *   () => runware.requestImages(request),
 *   {
 *     maxRetries: 5,
 *     initialDelayMs: 800,
 *     debug: true,
 *   }
 * );
 *
 * // Check result
 * if (result.success) {
 *   console.log(`Succeeded in ${result.attempts} attempts`);
 *   return result.data;
 * } else {
 *   console.error(`Failed after ${result.attempts} attempts: ${result.lastError}`);
 *   // Optionally refund credits here
 * }
 * ```
 */
export async function callRunwareWithRetry<T>(
  fn: () => Promise<T>,
  config?: RunwareRetryConfig
): Promise<RetryResult<T>> {
  const { debug, ...retryConfig } = config || {};

  const result = await retryWithBackoff(fn, {
    maxRetries: 3,
    initialDelayMs: 600,
    backoffMultiplier: 2,
    jitterFraction: 0.2,
    timeoutMs: 30000,
    isRetryable: isRunwareRetryable,
    ...retryConfig,
  });

  if (debug) {
    if (result.success) {
      console.log(
        `[Runware] Success after ${result.attempts} attempt(s) in ${result.totalDurationMs}ms`
      );
    } else {
      const classification = classifyRunwareError(result.error);
      console.error(
        `[Runware] Failed after ${result.attempts} attempt(s): ${classification.reason}`
      );
    }
  }

  return result;
}

/**
 * Get human-readable error message from Runware retry result
 * Useful for error responses to clients
 */
export function getRunwareErrorMessage(result: RetryResult<unknown>): string {
  if (result.success) return "Success";

  const classification = classifyRunwareError(result.error);
  return `${classification.reason} (${result.attempts} attempt${result.attempts !== 1 ? "s" : ""})`;
}

/**
 * Utility: Determine if a Runware call should be retried
 * Useful for custom retry logic in specific handlers
 */
export function shouldRetryRunware(error: unknown): boolean {
  return classifyRunwareError(error).isRetryable;
}
