/**
 * Tests for Error Classification
 * Validates Runware and Gemini error categorization
 */

import {
  classifyRunwareError,
  classifyGeminiError,
  isRunwareRetryable,
  isGeminiRetryable,
} from "../error-classifier";

describe("Error Classifier", () => {
  describe("Runware Error Classification", () => {
    describe("retryable errors", () => {
      it("classifies ECONNRESET as retryable", () => {
        const error = new Error("Connection reset by peer");
        (error as NodeJS.ErrnoException).code = "ECONNRESET";

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.reason).toContain("ECONNRESET");
      });

      it("classifies ETIMEDOUT as retryable", () => {
        const error = new Error("Connection timed out");
        (error as NodeJS.ErrnoException).code = "ETIMEDOUT";

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.reason).toContain("ETIMEDOUT");
      });

      it("classifies socket hang up as retryable", () => {
        const error = new Error("socket hang up");
        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
      });

      it("classifies 5xx errors as retryable", () => {
        const error = new Error("Internal server error");
        (error as any).status = 500;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.statusCode).toBe(500);
      });

      it("classifies 502 Bad Gateway as retryable", () => {
        const error = new Error("Bad Gateway");
        (error as any).status = 502;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
      });

      it("classifies 503 Service Unavailable as retryable", () => {
        const error = new Error("Service Unavailable");
        (error as any).status = 503;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
      });

      it("classifies 429 Rate Limit as retryable", () => {
        const error = new Error("Too Many Requests");
        (error as any).status = 429;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.statusCode).toBe(429);
      });

      it("classifies 408 Request Timeout as retryable", () => {
        const error = new Error("Request Timeout");
        (error as any).status = 408;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(true);
      });
    });

    describe("non-retryable errors", () => {
      it("classifies 400 Bad Request as non-retryable", () => {
        const error = new Error("Bad Request");
        (error as any).status = 400;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(false);
        expect(result.statusCode).toBe(400);
      });

      it("classifies 401 Unauthorized as non-retryable", () => {
        const error = new Error("Unauthorized");
        (error as any).status = 401;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(false);
      });

      it("classifies 403 Forbidden as non-retryable", () => {
        const error = new Error("Forbidden");
        (error as any).status = 403;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(false);
      });

      it("classifies 404 Not Found as non-retryable", () => {
        const error = new Error("Not Found");
        (error as any).status = 404;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(false);
      });

      it("classifies 3xx redirects as non-retryable", () => {
        const error = new Error("Moved Permanently");
        (error as any).status = 301;

        const result = classifyRunwareError(error);
        expect(result.isRetryable).toBe(false);
      });
    });
  });

  describe("Gemini Error Classification", () => {
    describe("retryable errors", () => {
      it("classifies INTERNAL as retryable", () => {
        const error = new Error("Internal error");
        (error as any).status = "INTERNAL";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.code).toBe("INTERNAL");
      });

      it("classifies UNAVAILABLE as retryable", () => {
        const error = new Error("Service unavailable");
        (error as any).status = "UNAVAILABLE";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.code).toBe("UNAVAILABLE");
      });

      it("classifies DEADLINE_EXCEEDED as retryable", () => {
        const error = new Error("Deadline exceeded");
        (error as any).status = "DEADLINE_EXCEEDED";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.code).toBe("DEADLINE_EXCEEDED");
      });

      it("classifies RESOURCE_EXHAUSTED as retryable", () => {
        const error = new Error("Resource exhausted");
        (error as any).status = "RESOURCE_EXHAUSTED";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.code).toBe("RESOURCE_EXHAUSTED");
      });

      it("classifies connection errors as retryable", () => {
        const error = new Error("Connection refused");
        (error as NodeJS.ErrnoException).code = "ECONNREFUSED";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.code).toBe("ECONNREFUSED");
      });

      it("classifies 5xx HTTP errors as retryable", () => {
        const error = new Error("Server error");
        (error as any).statusCode = 500;

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.statusCode).toBe(500);
      });

      it("classifies 429 HTTP Rate Limit as retryable", () => {
        const error = new Error("Rate limited");
        (error as any).statusCode = 429;

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(true);
        expect(result.statusCode).toBe(429);
      });
    });

    describe("non-retryable errors", () => {
      it("classifies INVALID_ARGUMENT as non-retryable", () => {
        const error = new Error("Invalid argument");
        (error as any).status = "INVALID_ARGUMENT";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(false);
        expect(result.code).toBe("INVALID_ARGUMENT");
      });

      it("classifies PERMISSION_DENIED as non-retryable", () => {
        const error = new Error("Permission denied");
        (error as any).status = "PERMISSION_DENIED";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(false);
        expect(result.code).toBe("PERMISSION_DENIED");
      });

      it("classifies NOT_FOUND as non-retryable", () => {
        const error = new Error("Model not found");
        (error as any).status = "NOT_FOUND";

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(false);
        expect(result.code).toBe("NOT_FOUND");
      });

      it("classifies 4xx HTTP errors as non-retryable", () => {
        const error = new Error("Bad request");
        (error as any).statusCode = 400;

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(false);
        expect(result.statusCode).toBe(400);
      });

      it("classifies 401 Unauthorized as non-retryable", () => {
        const error = new Error("Unauthorized");
        (error as any).statusCode = 401;

        const result = classifyGeminiError(error);
        expect(result.isRetryable).toBe(false);
      });
    });
  });

  describe("Helper Functions", () => {
    it("isRunwareRetryable returns boolean", () => {
      const retryableError = new Error("Connection reset");
      (retryableError as NodeJS.ErrnoException).code = "ECONNRESET";

      expect(isRunwareRetryable(retryableError)).toBe(true);

      const nonRetryableError = new Error("Bad request");
      (nonRetryableError as any).status = 400;

      expect(isRunwareRetryable(nonRetryableError)).toBe(false);
    });

    it("isGeminiRetryable returns boolean", () => {
      const retryableError = new Error("Internal error");
      (retryableError as any).status = "INTERNAL";

      expect(isGeminiRetryable(retryableError)).toBe(true);

      const nonRetryableError = new Error("Invalid argument");
      (nonRetryableError as any).status = "INVALID_ARGUMENT";

      expect(isGeminiRetryable(nonRetryableError)).toBe(false);
    });
  });
});
