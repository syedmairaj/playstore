export async function register() {
  // Temporarily disabled: Sentry instrumentation causing OpenTelemetry dependency conflicts
  // Re-enable when SENTRY_DSN is properly configured with all required dependencies
  /*
  if (process.env.SENTRY_DSN && process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.SENTRY_DSN && process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
  */
}
