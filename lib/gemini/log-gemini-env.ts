import "server-only";

/**
 * Dev/test: verbose Gemini diagnostics enabled. Production: only when
 * `DEBUG_GEMINI_ENV=1`.
 */
export function shouldLogGeminiDebug(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.DEBUG_GEMINI_ENV === "1"
  );
}

/**
 * Dev/test: always logs. Production: only when DEBUG_GEMINI_ENV=1.
 * Never logs the key value.
 */
export function logGeminiApiKeyDiagnostics(): void {
  if (!shouldLogGeminiDebug()) return;

  console.log(
    "GEMINI_API_KEY loaded:",
    process.env.GEMINI_API_KEY ? "YES (present)" : "MISSING",
  );
  console.log("Key length:", process.env.GEMINI_API_KEY?.length || 0);
}

/**
 * Server-only verbose logs for listing optimizer autofill Gemini failures.
 * Gated the same way as {@link logGeminiApiKeyDiagnostics}.
 */
export function logGeminiOptimizerAutofillDebugError(error: unknown): void {
  if (!shouldLogGeminiDebug()) return;

  console.error("Gemini Autofill Error:", error);
  console.error(
    "Error message:",
    (error as { message?: unknown } | null | undefined)?.message,
  );
  console.error(
    "Error stack:",
    (error as { stack?: unknown } | null | undefined)?.stack,
  );
  console.error("String(error):", String(error));
}
