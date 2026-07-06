import "server-only";

/**
 * Kill-Switch & Graceful Degradation
 * ════════════════════════════════════
 * Provides three independently togglable "kill-switches" that allow an operator
 * to disable fragile third-party integrations without a code deployment:
 *
 *   1. ASYNC_PIPELINE_DISABLED   — Forces the listing producer to return a
 *      service-unavailable error rather than enqueuing to QStash. Used when
 *      QStash is unresponsive, quota-exceeded, or mis-configured.
 *
 *   2. REDIS_LOCK_DISABLED       — Bypasses the Redis queue-hash SET NX lock
 *      and the lock heartbeat. Use when Upstash Redis is down; duplicates
 *      are mitigated by the in-memory idempotency lock instead.
 *
 *   3. VAULT_VALIDATION_DISABLED — Skips the worker-side vault-hash staleness
 *      check. Use as a last resort when the Staging Vault is returning errors
 *      at a rate that causes all jobs to fail with 409.
 *
 * Activation (no deployment needed):
 *   Set the corresponding environment variable to "1" or "true" on Vercel /
 *   your hosting provider, then trigger a function reload (e.g. new deployment
 *   or edge-config push):
 *
 *     KILL_SWITCH_ASYNC_PIPELINE=1
 *     KILL_SWITCH_REDIS_LOCK=1
 *     KILL_SWITCH_VAULT_VALIDATION=1
 *
 * Design constraints:
 *   - Read-only on import (no side-effects).
 *   - No network calls — values are resolved from process.env at request time.
 *   - Each switch degrades a specific integration; the rest of the pipeline
 *     continues to function normally.
 *   - All activation events are logged via logPipelineEvent so the monitoring
 *     dashboard shows when a kill-switch is active.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

function envBool(key: string): boolean {
  const val = process.env[key]?.trim().toLowerCase();
  return val === "1" || val === "true" || val === "yes";
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export type KillSwitchId =
  | "ASYNC_PIPELINE_DISABLED"
  | "REDIS_LOCK_DISABLED"
  | "VAULT_VALIDATION_DISABLED";

export type KillSwitchState = {
  asyncPipelineDisabled: boolean;
  redisLockDisabled: boolean;
  vaultValidationDisabled: boolean;
};

/**
 * Reads all kill-switch states from the environment.
 * Call once per request (no caching — allows instant activation without restart).
 */
export function resolveKillSwitches(): KillSwitchState {
  return {
    asyncPipelineDisabled: envBool("KILL_SWITCH_ASYNC_PIPELINE"),
    redisLockDisabled: envBool("KILL_SWITCH_REDIS_LOCK"),
    vaultValidationDisabled: envBool("KILL_SWITCH_VAULT_VALIDATION"),
  };
}

/**
 * Check a single kill-switch and log its activation.
 *
 * Returns `true` when the switch is active (i.e. the integration is disabled).
 * Pass the associated `workspaceId` and optional `jobId` for traceability.
 */
export function checkKillSwitch(
  id: KillSwitchId,
  context: { workspaceId?: string; jobId?: string },
): boolean {
  const switches = resolveKillSwitches();
  const active =
    id === "ASYNC_PIPELINE_DISABLED"
      ? switches.asyncPipelineDisabled
      : id === "REDIS_LOCK_DISABLED"
        ? switches.redisLockDisabled
        : switches.vaultValidationDisabled;

  if (active) {
    // Lazy import avoids circular deps between pipeline-health and kill-switch
    void import("@/lib/observability/pipeline-health").then(({ logPipelineEvent }) => {
      logPipelineEvent("worker_failed", {
        workspaceId: context.workspaceId ?? "unknown",
        jobId: context.jobId,
        message: `Kill-switch active: ${id}`,
        meta: { killSwitch: id },
      });
    });
  }

  return active;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dependency health probes
// ──────────────────────────────────────────────────────────────────────────────

export type DependencyProbeResult = {
  dependency: string;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

/**
 * Lightweight probe that checks if Upstash Redis accepts a PING command.
 * Use in a health-check route or monitoring script — not on every request.
 */
export async function probeRedis(): Promise<DependencyProbeResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return { dependency: "redis", ok: false, latencyMs: null, error: "UPSTASH_REDIS_REST_URL / TOKEN not configured" };
  }

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["PING"]),
      signal: AbortSignal.timeout(5_000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { dependency: "redis", ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { result?: string };
    return {
      dependency: "redis",
      ok: json.result === "PONG",
      latencyMs,
      error: json.result !== "PONG" ? `Unexpected PING response: ${json.result}` : undefined,
    };
  } catch (err) {
    return {
      dependency: "redis",
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Checks if the QStash endpoint is reachable by sending a GET to the
 * Upstash QStash v2 queues list endpoint (read-only, no side-effects).
 */
export async function probeQStash(): Promise<DependencyProbeResult> {
  const token = process.env.QSTASH_TOKEN?.trim();

  if (!token) {
    return { dependency: "qstash", ok: false, latencyMs: null, error: "QSTASH_TOKEN not configured" };
  }

  const start = Date.now();
  try {
    const res = await fetch("https://qstash.upstash.io/v2/queues", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    const latencyMs = Date.now() - start;
    return {
      dependency: "qstash",
      ok: res.ok,
      latencyMs,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      dependency: "qstash",
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Probes Supabase DB connectivity by running a lightweight table count query.
 * Pass the Supabase admin client to avoid creating a new one.
 */
export async function probeSupabase(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<DependencyProbeResult> {
  const start = Date.now();
  try {
    const { error } = await supabase
      .from("feature_flags")
      .select("key", { count: "exact", head: true });
    const latencyMs = Date.now() - start;
    return {
      dependency: "supabase",
      ok: !error,
      latencyMs,
      error: error?.message,
    };
  } catch (err) {
    return {
      dependency: "supabase",
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run all three dependency probes in parallel.
 * Suitable for a `/api/health` endpoint or a monitoring cron job.
 */
export async function probeAllDependencies(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<DependencyProbeResult[]> {
  const [redisResult, qstashResult, supabaseResult] = await Promise.allSettled([
    probeRedis(),
    probeQStash(),
    probeSupabase(supabase),
  ]);

  return [redisResult, qstashResult, supabaseResult].map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          dependency: "unknown",
          ok: false,
          latencyMs: null,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Client-facing degradation messages
// These strings align with the optimizer.modular.errors keys in en.json / ar.json.
// ──────────────────────────────────────────────────────────────────────────────

export const DEGRADATION_MESSAGES = {
  /**
   * Returned to the client as a 503 when KILL_SWITCH_ASYNC_PIPELINE is active.
   * Matches optimizer.modular.errors.staleContext in the i18n files.
   */
  asyncPipelineDown: {
    code: "service_unavailable" as const,
    message:
      "AI Listing generation is temporarily paused for maintenance. Please try again shortly.",
  },
  /**
   * Returned when the Vault validation is bypassed (KILL_SWITCH_VAULT_VALIDATION).
   * The worker will proceed without staleness checks; generation may use
   * slightly outdated context.
   */
  vaultValidationBypassed: {
    code: "vault_validation_bypassed" as const,
    message: "Generating with cached context — live vault sync temporarily unavailable.",
  },
} as const;
