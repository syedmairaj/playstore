/**
 * Drift Detection — Zombie Job Scanner
 * ══════════════════════════════════════
 * Detects `workspace_listing_drafts` rows whose `generation_status` is "pending"
 * or "processing" but whose `updated_at` has not changed in ≥ ZOMBIE_JOB_TIMEOUT_MINUTES.
 *
 * A "zombie job" is defined as:
 *   - status IN ('pending', 'processing')  (never reached terminal state)
 *   - updated_at < now() - ZOMBIE_JOB_TIMEOUT_MINUTES  (stale heartbeat)
 *
 * This covers two failure modes:
 *   1. QStash delivery silently dropped — job stays "pending" forever.
 *   2. Worker crashed mid-execution — job stays "processing" forever.
 *
 * Timeout resolution order (highest → lowest precedence):
 *   1. --threshold-minutes=N  CLI flag   (per-run override)
 *   2. ZOMBIE_JOB_TIMEOUT_MINUTES env variable  (persistent operator config)
 *   3. 30 minutes             (hardcoded fallback)
 *
 * Usage (requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/detect-zombie-jobs.mjs
 *   node scripts/detect-zombie-jobs.mjs --threshold-minutes=60 --fix
 *
 * Flags:
 *   --threshold-minutes=N   Per-run override (takes precedence over env var).
 *   --fix                   Mark zombie jobs as "failed" in the database.
 *   --locale=en|ar          Scope to a single vault locale branch (default: all).
 *   --dry-run               Print candidates without writing (default when --fix absent).
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

/** Absolute minimum allowed; prevents accidental near-zero timeouts. */
const ZOMBIE_THRESHOLD_FLOOR_MINUTES = 5;
/** Used when neither ZOMBIE_JOB_TIMEOUT_MINUTES nor --threshold-minutes is set. */
const ZOMBIE_THRESHOLD_FALLBACK_MINUTES = 30;

function loadEnv(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length && !key.startsWith("#")) {
      process.env[key.trim()] ??= rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

// Load .env.local first (highest priority), then .env (shared defaults).
// ZOMBIE_JOB_TIMEOUT_MINUTES set in the environment before script invocation
// always takes precedence over these files.
loadEnv(".env.local");
loadEnv(".env");

const args = process.argv.slice(2);
function flag(name, defaultValue) {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=").slice(1).join("=") : defaultValue;
}
const hasBoolFlag = (name) => args.includes(`--${name}`);

// Resolution order:
//   1. --threshold-minutes=N  CLI flag  (allows per-run override without touching .env)
//   2. ZOMBIE_JOB_TIMEOUT_MINUTES       (persistent operator config — set in .env or Vercel)
//   3. ZOMBIE_THRESHOLD_FALLBACK_MINUTES (30 — hardcoded last resort)
const ENV_TIMEOUT = parseInt(process.env.ZOMBIE_JOB_TIMEOUT_MINUTES, 10) || ZOMBIE_THRESHOLD_FALLBACK_MINUTES;
const THRESHOLD_MINUTES = Math.max(
  ZOMBIE_THRESHOLD_FLOOR_MINUTES,
  parseInt(flag("threshold-minutes", String(ENV_TIMEOUT)), 10) || ENV_TIMEOUT,
);

const FIX = hasBoolFlag("fix");
const DRY_RUN = !FIX || hasBoolFlag("dry-run");
const LOCALE_FILTER = flag("locale", null); // "en", "ar", or null (all)

// ──────────────────────────────────────────────────────────────────────────────
// Supabase client
// ──────────────────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  console.error(
    JSON.stringify({
      event: "zombie_scan_config_error",
      message: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    }),
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false },
});

// ──────────────────────────────────────────────────────────────────────────────
// Detection
// ──────────────────────────────────────────────────────────────────────────────

const cutoff = new Date(Date.now() - THRESHOLD_MINUTES * 60 * 1000).toISOString();

// Determine which config source resolved the final threshold (for audit logs).
const cliOverride = args.some((a) => a.startsWith("--threshold-minutes="));
const thresholdSource = cliOverride
  ? "cli-flag"
  : process.env.ZOMBIE_JOB_TIMEOUT_MINUTES
    ? "ZOMBIE_JOB_TIMEOUT_MINUTES"
    : "default";

console.log(
  JSON.stringify({
    event: "zombie_scan_started",
    thresholdMinutes: THRESHOLD_MINUTES,
    thresholdSource,
    cutoff,
    locale: LOCALE_FILTER ?? "all",
    mode: DRY_RUN ? "dry-run" : "fix",
    timestamp: new Date().toISOString(),
  }),
);

let query = supabase
  .from("workspace_listing_drafts")
  .select("id, workspace_id, vault_locale, job_id, generation_status, updated_at, generation_error")
  .in("generation_status", ["pending", "processing"])
  .lt("updated_at", cutoff)
  .order("updated_at", { ascending: true })
  .limit(500);

if (LOCALE_FILTER) {
  query = query.eq("vault_locale", LOCALE_FILTER);
}

const { data: zombies, error } = await query;

if (error) {
  console.error(
    JSON.stringify({
      event: "zombie_scan_query_failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
}

if (!zombies || zombies.length === 0) {
  console.log(
    JSON.stringify({
      event: "zombie_scan_clean",
      message: "No zombie jobs found.",
      thresholdMinutes: THRESHOLD_MINUTES,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Report
// ──────────────────────────────────────────────────────────────────────────────

const pendingCount   = zombies.filter((r) => r.generation_status === "pending").length;
const processingCount = zombies.filter((r) => r.generation_status === "processing").length;

console.warn(
  JSON.stringify({
    event: "zombie_jobs_detected",
    totalCount: zombies.length,
    pendingCount,
    processingCount,
    thresholdMinutes: THRESHOLD_MINUTES,
    cutoff,
    locale: LOCALE_FILTER ?? "all",
    timestamp: new Date().toISOString(),
    // Emit individual records for easy log parsing / alerting
    zombies: zombies.map((r) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      vault_locale: r.vault_locale,
      job_id: r.job_id,
      generation_status: r.generation_status,
      updated_at: r.updated_at,
      stale_minutes: Math.round((Date.now() - new Date(r.updated_at).getTime()) / 60_000),
      last_error: r.generation_error ?? null,
    })),
  }),
);

// ──────────────────────────────────────────────────────────────────────────────
// Auto-fix (--fix flag only)
// ──────────────────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log(
    JSON.stringify({
      event: "zombie_scan_dry_run",
      message: `${zombies.length} zombie job(s) found. Re-run with --fix to mark them failed.`,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(0);
}

const ids = zombies.map((r) => r.id);

const { error: updateError } = await supabase
  .from("workspace_listing_drafts")
  .update({
    generation_status: "failed",
    generation_error: `Zombie detected: job did not progress for >${THRESHOLD_MINUTES} minutes. Marked failed by detect-zombie-jobs script.`,
  })
  .in("id", ids)
  // Extra safety guard — only touch rows that are still in the stuck states
  .in("generation_status", ["pending", "processing"]);

if (updateError) {
  console.error(
    JSON.stringify({
      event: "zombie_fix_failed",
      message: updateError.message,
      candidateCount: ids.length,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    event: "zombie_fix_applied",
    fixedCount: ids.length,
    message: `${ids.length} zombie job(s) marked as "failed".`,
    timestamp: new Date().toISOString(),
  }),
);

process.exit(0);
