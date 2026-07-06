import "server-only";

/**
 * Structured pipeline logger.
 *
 * Bakes a `correlationId` (mapped from `queueHash`) into every log entry so
 * all events for a single generation run can be retrieved from a log aggregator
 * with a single query:
 *
 *   { correlationId: "<queueHash>" }
 *
 * Also injects `jobId` and `workspaceId` when supplied, giving operators three
 * independent axes to query across EN and AR environments.
 *
 * Usage:
 *   const log = createPipelineLogger({ correlationId: queueHash, jobId, workspaceId });
 *   log.info("worker_job_init", { step, vaultLocale });
 *   log.error("worker_completion_write_unverified", { actualStatus });
 */

export type PipelineLogContext = {
  /** Maps 1:1 to queueHash — the canonical correlation key across the pipeline. */
  correlationId: string;
  jobId?: string;
  workspaceId?: string;
};

export type PipelineLogger = ReturnType<typeof createPipelineLogger>;

/**
 * Creates a structured logger bound to a specific pipeline execution context.
 *
 * All methods accept an event name (string) and an optional extra-fields map.
 * The `correlationId`, `jobId`, and `workspaceId` are merged into every entry
 * so the full log is queryable by any of those three keys.
 */
export function createPipelineLogger(ctx: PipelineLogContext) {
  const base: Record<string, unknown> = {
    correlationId: ctx.correlationId,
    ...(ctx.jobId ? { jobId: ctx.jobId } : {}),
    ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
  };

  return {
    info(event: string, extra?: Record<string, unknown>): void {
      console.log(JSON.stringify({ ...base, event, ...extra }));
    },
    warn(event: string, extra?: Record<string, unknown>): void {
      console.warn(JSON.stringify({ ...base, event, ...extra }));
    },
    error(event: string, extra?: Record<string, unknown>): void {
      console.error(JSON.stringify({ ...base, event, ...extra }));
    },
  };
}
