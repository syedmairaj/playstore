/**
 * Tests for Retry Engine
 * Validates exponential backoff, jitter distribution, and error handling
 */

import {
  retryWithBackoff,
  calculateBackoffDelay,
  type RetryConfig,
} from "../retry-engine";

describe("Retry Engine", () => {
  describe("calculateBackoffDelay", () => {
    it("calculates exponential backoff without jitter for deterministic testing", () => {
      const config: RetryConfig = {
        initialDelayMs: 600,
        backoffMultiplier: 2,
        jitterFraction: 0, // No jitter for determinism
      };

      expect(calculateBackoffDelay(0, config)).toBe(600); // 600
      expect(calculateBackoffDelay(1, config)).toBe(1200); // 600 * 2
      expect(calculateBackoffDelay(2, config)).toBe(2400); // 600 * 4
    });

    it("applies jitter as ±20% variance", () => {
      const config: RetryConfig = {
        initialDelayMs: 1000,
        backoffMultiplier: 1, // No exponential growth for this test
        jitterFraction: 0.2, // ±20%
      };

      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        delays.push(calculateBackoffDelay(0, config));
      }

      const avgDelay = delays.reduce((a, b) => a + b) / delays.length;
      const expectedMin = 1000 * 0.8; // 800
      const expectedMax = 1000 * 1.2; // 1200

      // Average should be close to base (1000)
      expect(avgDelay).toBeGreaterThan(900);
      expect(avgDelay).toBeLessThan(1100);

      // All delays should be within ±20%
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(expectedMin);
        expect(delay).toBeLessThanOrEqual(expectedMax);
      });
    });

    it("prevents negative delays", () => {
      const config: RetryConfig = {
        initialDelayMs: 1,
        backoffMultiplier: 2,
        jitterFraction: 0.5, // Large jitter
      };

      for (let i = 0; i < 10; i++) {
        const delay = calculateBackoffDelay(i, config);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("retryWithBackoff", () => {
    it("succeeds on first attempt if function succeeds", async () => {
      const fn = jest.fn().mockResolvedValue("success");

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 0, // Fast test
        jitterFraction: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe("success");
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries failed attempts and eventually succeeds", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("First fail"))
        .mockRejectedValueOnce(new Error("Second fail"))
        .mockResolvedValueOnce("success");

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 0,
        isRetryable: () => true,
        jitterFraction: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe("success");
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("stops retrying after maxRetries exhausted", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("Always fails"));

      const result = await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 0,
        isRetryable: () => true,
        jitterFraction: 0,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // Initial + 2 retries
      expect(result.lastError).toBe("Always fails");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("respects isRetryable classifier and stops on non-retryable error", async () => {
      const error = new Error("Permanent error");
      const fn = jest.fn().mockRejectedValue(error);

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 0,
        isRetryable: () => false, // This error is not retryable
        jitterFraction: 0,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Only one attempt, no retries
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("applies timeout to each attempt", async () => {
      const fn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve("slow"), 500)
            )
        );

      const startTime = Date.now();
      const result = await retryWithBackoff(fn, {
        maxRetries: 0,
        timeoutMs: 100, // 100ms timeout
        isRetryable: () => true,
        jitterFraction: 0,
      });

      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.lastError).toContain("timed out");
      expect(elapsed).toBeLessThan(300); // Should timeout quickly, not wait 500ms
    });

    it("tracks total duration including retries", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockResolvedValueOnce("success");

      const startTime = Date.now();
      const result = await retryWithBackoff(fn, {
        maxRetries: 1,
        initialDelayMs: 50,
        backoffMultiplier: 1,
        jitterFraction: 0,
      });

      expect(result.success).toBe(true);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(50);
      expect(result.totalDurationMs).toBeLessThan(200); // Should be ~50ms + overhead
    });

    it("returns correct error information on final failure", async () => {
      const testError = new Error("Test error message");
      const fn = jest.fn().mockRejectedValue(testError);

      const result = await retryWithBackoff(fn, {
        maxRetries: 1,
        initialDelayMs: 0,
        isRetryable: () => true,
        jitterFraction: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(testError);
      expect(result.lastError).toBe("Test error message");
      expect(result.attempts).toBe(2);
    });
  });

  describe("realistic scenario: transient then success", () => {
    it("recovers from transient Runware-like errors", async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error("Connection reset");
          (error as any).code = "ECONNRESET";
          throw error;
        }
        if (attemptCount === 2) {
          const error = new Error("Socket hang up");
          throw error;
        }
        return Promise.resolve({ status: "success", taskId: "12345" });
      });

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        isRetryable: (error) => {
          if (error instanceof Error) {
            const code = (error as NodeJS.ErrnoException).code;
            const msg = error.message.toLowerCase();
            return (
              code === "ECONNRESET" ||
              msg.includes("socket hang up") ||
              msg.includes("timeout")
            );
          }
          return false;
        },
        jitterFraction: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ status: "success", taskId: "12345" });
      expect(result.attempts).toBe(3);
    });
  });
});
