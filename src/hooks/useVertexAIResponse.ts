/**
 * useVertexAIResponse Hook
 *
 * Drop-in replacement for AI response generation using Vertex AI
 * (instead of Google AI Studio or Claude)
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Timeout handling
 * - Quota exhaustion detection
 * - Maintains exact same interface as before
 *
 * Usage:
 * const { generateResponse, isLoading, error } = useVertexAIResponse();
 * await generateResponse(item, tone);
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";

interface GenerateResponseRequest {
  prompt: string;
  workspaceId: string;
  itemId: string;
  tone: "professional" | "empathetic" | "concise";
  language: string;
}

interface GenerateResponseResult {
  response: string;
  itemId: string;
  language: string;
  tone: string;
  characterCount: number;
  characterLimit: number;
  isWithinLimit: boolean;
  model: string;
  provider: string;
  durationMs: number;
}

interface UseVertexAIResponseOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: UseVertexAIResponseOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeout: 30000,
};

export function useVertexAIResponse(
  options: UseVertexAIResponseOptions = {}
) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateResponse = useCallback(
    async (request: GenerateResponseRequest): Promise<GenerateResponseResult | null> => {
      setIsLoading(true);
      setError(null);

      let lastError: unknown = null;
      let attempt = 0;

      while (attempt <= config.maxRetries!) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), config.timeout);

          const response = await fetch("/api/ai/generate-response-vertex", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // ── Success ────────────────────────────────────────────────
          if (response.ok) {
            const data = (await response.json()) as GenerateResponseResult;
            setIsLoading(false);
            return data;
          }

          // ── Handle HTTP Errors ─────────────────────────────────────
          const errorData = await response.json().catch(() => ({}));

          // Retry on 429 (rate limit) and 503 (service unavailable)
          const isRetryable =
            response.status === 429 || response.status === 503;

          if (isRetryable && attempt < config.maxRetries!) {
            attempt++;
            const delayMs =
              config.baseDelayMs! * Math.pow(2, attempt - 1);

            console.warn(
              `[useVertexAIResponse] Attempt ${attempt}/${config.maxRetries} failed with ${response.status}. Retrying in ${delayMs}ms...`
            );

            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }

          // ── Non-retryable or max retries exceeded ──────────────────
          lastError = new Error(
            errorData.message ||
            `HTTP ${response.status}: ${response.statusText}`
          );

          // Log specific error
          if (response.status === 429) {
            console.error(
              "[useVertexAIResponse] Rate limit exceeded. Check Vertex AI quota."
            );
          } else if (response.status === 403) {
            console.error(
              "[useVertexAIResponse] Authentication failed. Check GCP credentials."
            );
          } else if (response.status === 404) {
            console.error(
              "[useVertexAIResponse] Endpoint not found. Check API route."
            );
          }

          break;
        } catch (err) {
          lastError = err;

          // Handle abort/timeout
          if (err instanceof Error && err.name === "AbortError") {
            console.error("[useVertexAIResponse] Request timeout");
            break; // Don't retry timeout
          }

          // Retry on network errors
          if (attempt < config.maxRetries!) {
            attempt++;
            const delayMs = config.baseDelayMs! * Math.pow(2, attempt - 1);

            console.warn(
              `[useVertexAIResponse] Network error. Retrying in ${delayMs}ms...`
            );

            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }

          break;
        }
      }

      // ── All retries exhausted ──────────────────────────────────────
      const errorMessage =
        lastError instanceof Error ? lastError.message : String(lastError);

      setError(errorMessage);
      setIsLoading(false);

      // Show appropriate toast
      if (errorMessage.includes("quota")) {
        toast.error("Vertex AI quota exhausted. Check GCP billing.");
      } else if (errorMessage.includes("authentication")) {
        toast.error("GCP authentication failed. Check credentials.");
      } else if (errorMessage.includes("timeout")) {
        toast.error("Request timeout. Please try again.");
      } else if (errorMessage.includes("Rate limit")) {
        toast.error("Too many requests. Please wait a moment.");
      } else {
        toast.error(`Failed to generate response: ${errorMessage}`);
      }

      return null;
    },
    [config]
  );

  return {
    generateResponse,
    isLoading,
    error,
  };
}
