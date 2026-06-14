/**
 * Gemini API Retry Wrapper
 *
 * Wraps Gemini API calls with exponential backoff + jitter retry logic.
 * Automatically classifies Gemini SDK errors and retries transient failures.
 *
 * Usage:
 * ```typescript
 * const result = await callGeminiWithRetry(
 *   () => model.generateContent(prompt)
 * );
 * if (result.success) {
 *   console.log(result.data.text);
 * } else {
 *   console.error(`Gemini call failed: ${result.lastError}`);
 * }
 * ```
 */

import {
  retryWithBackoff,
  type RetryConfig,
  type RetryResult,
} from "./retry-engine";
import {
  classifyGeminiError,
  isGeminiRetryable,
} from "./error-classifier";

/**
 * Configuration for Gemini retry behavior
 * Defaults:
 * - 3 retries (4 attempts total)
 * - Initial 600ms delay, exponential backoff (2x)
 * - 30s timeout per attempt
 * - ±20% jitter on delays
 */
export interface GeminiRetryConfig extends RetryConfig {
  /** Enable debug logging of retry attempts */
  debug?: boolean;
}

/**
 * Call Gemini API with automatic retry and backoff
 *
 * @param fn - Async function that calls Gemini API
 * @param config - Retry configuration (optional)
 * @returns Retry result with success/failure status and metadata
 *
 * @example
 * ```typescript
 * // Basic usage - generate content
 * const result = await callGeminiWithRetry(
 *   () => model.generateContent("Write a short poem")
 * );
 *
 * if (result.success) {
 *   const text = result.data.text;
 *   console.log(text);
 * }
 *
 * // Generate with streaming
 * const result = await callGeminiWithRetry(
 *   () => model.generateContentStream(prompt)
 * );
 *
 * // With custom retry config
 * const result = await callGeminiWithRetry(
 *   () => model.generateContent(prompt),
 *   {
 *     maxRetries: 2,
 *     initialDelayMs: 500,
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
 * }
 * ```
 */
export async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  config?: GeminiRetryConfig
): Promise<RetryResult<T>> {
  const { debug, ...retryConfig } = config || {};

  const result = await retryWithBackoff(fn, {
    maxRetries: 3,
    initialDelayMs: 600,
    backoffMultiplier: 2,
    jitterFraction: 0.2,
    timeoutMs: 30000,
    isRetryable: isGeminiRetryable,
    ...retryConfig,
  });

  if (debug) {
    if (result.success) {
      console.log(
        `[Gemini] Success after ${result.attempts} attempt(s) in ${result.totalDurationMs}ms`
      );
    } else {
      const classification = classifyGeminiError(result.error);
      console.error(
        `[Gemini] Failed after ${result.attempts} attempt(s): ${classification.reason}`
      );
    }
  }

  return result;
}

/**
 * Get human-readable error message from Gemini retry result
 * Useful for error responses to clients
 */
export function getGeminiErrorMessage(result: RetryResult<unknown>): string {
  if (result.success) return "Success";

  const classification = classifyGeminiError(result.error);
  return `${classification.reason} (${result.attempts} attempt${result.attempts !== 1 ? "s" : ""})`;
}

/**
 * Utility: Determine if a Gemini call should be retried
 * Useful for custom retry logic in specific handlers
 */
export function shouldRetryGemini(error: unknown): boolean {
  return classifyGeminiError(error).isRetryable;
}
