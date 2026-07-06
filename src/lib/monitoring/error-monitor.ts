import "server-only";

export type ErrorMonitorContext = {
  route: string;
  workspaceId?: string;
  userId?: string;
  step?: string;
  pipeline?: "optimized" | "legacy" | "draft";
  code?: string;
  meta?: Record<string, unknown>;
};

/**
 * Central error monitor for generation pipeline failures.
 * Logs structured JSON; forwards to Sentry when configured.
 */
export function logGenerationPipelineError(
  error: unknown,
  context: ErrorMonitorContext,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const payload = {
    event: "generation_pipeline_error",
    message,
    stack,
    ...context,
    timestamp: new Date().toISOString(),
  };

  console.error(JSON.stringify(payload));

  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(error instanceof Error ? error : new Error(message), {
        tags: {
          route: context.route,
          pipeline: context.pipeline ?? "unknown",
          step: context.step ?? "unknown",
        },
        extra: context.meta,
      });
    })
    .catch(() => {
      /* Sentry optional in local dev */
    });
}
