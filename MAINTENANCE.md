# Maintenance & Operations Manual

**System:** ASO Platform — Async Listing Pipeline (QStash / Staging Vault / Supabase)
**Scope:** EN and AR vault branches; `workspace_listing_drafts`, `listing_generation_costs`, Redis locks, QStash worker
**Audience:** Site Reliability Engineers, on-call operators
**Last Updated:** June 2026 (Session 6 — configurable zombie timeout)

---

## How to Apply a Timeout Change

> **Read this section first** whenever you change `ZOMBIE_JOB_TIMEOUT_MINUTES`.

The zombie-job timeout is stored in **two places** that must always be kept in sync:

| Location | Used by | How to update |
|---|---|---|
| `ZOMBIE_JOB_TIMEOUT_MINUTES` env variable | `scripts/detect-zombie-jobs.mjs` (Node.js) | Set in `.env.local` / Vercel → redeploy |
| `ops_config` DB row (`zombie_job_timeout_minutes`) | All pg_cron SQL jobs, `public.zombie_job_timeout_minutes()` | `UPDATE public.ops_config SET value = 'N' WHERE key = 'zombie_job_timeout_minutes';` |

### Step-by-step procedure

**Step 1 — Update the environment variable.**

_Local development:_
```bash
# .env.local
ZOMBIE_JOB_TIMEOUT_MINUTES=60
```

_Production (Vercel):_
1. Go to Vercel → Project → Settings → Environment Variables.
2. Add or update `ZOMBIE_JOB_TIMEOUT_MINUTES` with the new integer value.
3. **Trigger a redeploy** (click _Redeploy_ or push a commit). Vercel serverless
   functions only pick up new env variables after a fresh deployment.

**Step 2 — Sync the `ops_config` table** (required for pg_cron jobs).

Run the following in the Supabase SQL Editor or via `psql`:
```sql
UPDATE public.ops_config
SET    value      = '60',    -- replace with your chosen value
       updated_at = now()
WHERE  key = 'zombie_job_timeout_minutes';

-- Verify
SELECT key, value, updated_at FROM public.ops_config WHERE key = 'zombie_job_timeout_minutes';
```

After this UPDATE, **all pg_cron jobs and SQL queries that call
`public.zombie_job_timeout_minutes()`** immediately use the new value — no
pg_cron schedule changes or restarts required.

**Step 3 — Verify the script picks up the new value.**
```bash
node scripts/detect-zombie-jobs.mjs
# Look for: "thresholdSource":"ZOMBIE_JOB_TIMEOUT_MINUTES","thresholdMinutes":60
```

The `thresholdSource` field in the startup log tells you exactly which config
layer resolved the final value (`cli-flag`, `ZOMBIE_JOB_TIMEOUT_MINUTES`, or `default`).

> **Why two places?** pg_cron jobs are plain SQL functions that run inside the
> Postgres process and have no access to application environment variables or
> `.env` files. The `ops_config` table is the database-native equivalent of the
> env variable, bridging the two execution contexts.

---

## Architecture Quick Reference

```
Client
  │
  ├─ POST /api/listings/generate   (Producer)
  │     ├─ Context Gateway: stampAndCompileListingContext (EN | AR)
  │     ├─ Phase Guard read-check (ModularPhaseOrderGuard)
  │     ├─ Redis SET NX lock  (listing-gen:processing:v1:{wsId}:{hash})
  │     ├─ Upsert workspace_listing_drafts → status: "pending"
  │     └─ QStash publish → POST /api/listings/worker
  │
  ├─ POST /api/listings/worker     (QStash Consumer)
  │     ├─ QStash signature verification
  │     ├─ Load job from workspace_listing_drafts
  │     ├─ Vault Hash Check: validateActiveContextQueueHash (EN | AR)
  │     ├─ Redis lock heartbeat (expires lock every 60 s)
  │     ├─ runListingGenerationWorkerJob → Gemini phases
  │     └─ Update workspace_listing_drafts → status: "completed" | "failed"
  │
  └─ GET  /api/listings/status     (Polling endpoint)
        └─ Returns job status for client useListingPipeline hook
```

**Key tables:**
| Table | Purpose |
|---|---|
| `workspace_listing_drafts` | Job lifecycle; draft content; status: pending → processing → completed \| failed |
| `listing_generation_costs` | Per-phase token + credit telemetry (EN & AR) |
| `feature_flags` | Boolean product toggles; kill-switch fallback |

**Key Redis key pattern:**
```
listing-gen:processing:v1:{workspaceId}:{queueHash}
TTL: 300 s  (refreshed every 60 s by heartbeat while worker runs)
```

---

## Kill-Switch Reference

Activate by setting the env variable to `1` on Vercel (or your hosting provider),
then triggering a function reload.  **No code deploy required.**

| Env Variable | What it disables | Degradation behaviour |
|---|---|---|
| `KILL_SWITCH_ASYNC_PIPELINE=1` | QStash enqueue | Producer returns `503 service_unavailable` immediately |
| `KILL_SWITCH_REDIS_LOCK=1` | Redis SET NX + heartbeat | Falls back to in-process idempotency lock only; duplicate risk ↑ slightly |
| `KILL_SWITCH_VAULT_VALIDATION=1` | Worker vault-hash staleness check | Jobs proceed with potentially stale context (no 409); use sparingly |

> All three switches are monitored by `logPipelineEvent` — their activation appears in structured logs as `"event": "worker_failed"` with `"meta.killSwitch": <id>`.

---

## Weekly Tasks

### W-1 · Review Cleanup Task Logs
**When:** Every Monday morning
**Where:** Vercel → Functions → Logs (search `cleanup_drafts`)

```bash
# Manual trigger (requires SUPABASE_SERVICE_ROLE_KEY in env)
node scripts/detect-zombie-jobs.mjs
```

Expected output:
```json
{"event":"cleanup_drafts_completed","deletedCount":N,"cutoff":"..."}
```

Alert if `deletedCount` is consistently above 100 per run — indicates high failed/abandoned job rate.

---

### W-2 · Zombie Job Scan
**When:** Every Monday (or triggered by alert)
**Script:** `scripts/detect-zombie-jobs.mjs`

**Timeout resolution order** (highest → lowest precedence):
1. `--threshold-minutes=N` CLI flag — one-off override for a single run
2. `ZOMBIE_JOB_TIMEOUT_MINUTES` env variable — persistent operator config (set in `.env.local` or Vercel)
3. `30` minutes — hardcoded fallback when neither of the above is set

The `thresholdSource` field in the startup log shows which layer was used:
```json
{"event":"zombie_scan_started","thresholdMinutes":30,"thresholdSource":"ZOMBIE_JOB_TIMEOUT_MINUTES",...}
```

```bash
# Dry-run using env-var timeout (recommended — no manual --threshold flag needed)
node scripts/detect-zombie-jobs.mjs

# One-off override: use 60-minute threshold for this run only
node scripts/detect-zombie-jobs.mjs --threshold-minutes=60

# Fix: mark zombie jobs as "failed" (uses ZOMBIE_JOB_TIMEOUT_MINUTES from env)
node scripts/detect-zombie-jobs.mjs --fix

# Scope to AR vault branch only
node scripts/detect-zombie-jobs.mjs --locale=ar --fix
```

| Exit code | `thresholdSource` | Meaning |
|---|---|---|
| `0` + `zombie_scan_clean` | any | No zombies — system healthy |
| `0` + `zombie_jobs_detected` (dry-run) | any | Review log; decide if `--fix` is safe |
| `0` + `zombie_fix_applied` | any | Zombies marked failed; users can re-generate |
| `1` | — | DB error — check `SUPABASE_SERVICE_ROLE_KEY` and connectivity |

> To change the timeout permanently, see **"How to Apply a Timeout Change"** at the top
> of this document. Do not use `--threshold-minutes` as a permanent substitute — it only
> affects the Node.js script, not the pg_cron SQL jobs.

**Equivalent pure-SQL** (for a pg_cron job — reads timeout from `ops_config`):
```sql
-- Timeout is driven by public.zombie_job_timeout_minutes() which reads ops_config.
-- No manual interval edits needed after running the "How to Apply" procedure.
SELECT
  id, workspace_id, vault_locale, job_id, generation_status,
  EXTRACT(EPOCH FROM (now() - updated_at)) / 60     AS stale_minutes,
  public.zombie_job_timeout_minutes()               AS configured_timeout_minutes
FROM   public.workspace_listing_drafts
WHERE  generation_status IN ('pending', 'processing')
  AND  updated_at < now() - (public.zombie_job_timeout_minutes() || ' minutes')::interval
ORDER  BY updated_at ASC;
```

---

### W-3 · Review Pipeline Health Snapshot
Run in Supabase SQL Editor (from `scripts/pipeline-p90-baseline.sql`, query 3):

```sql
SELECT vault_locale, generation_status AS status, COUNT(*) AS count
FROM   public.workspace_listing_drafts
WHERE  created_at >= now() - INTERVAL '7 days'
  AND  generation_status IS NOT NULL
GROUP  BY vault_locale, generation_status
ORDER  BY vault_locale, status;
```

**Healthy baseline targets:**
| Metric | Target |
|---|---|
| `failed` / (`completed` + `failed`) ratio | < 5 % |
| stale_vault_context failures | < 3 % of all failures |
| `processing` rows older than 10 min | 0 |

---

### W-4 · Redis Lock Audit
Verify no orphaned lock keys are accumulating.  If Upstash Redis is configured:

```bash
# List all lock keys (requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
curl -s "$UPSTASH_REDIS_REST_URL" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  -d '["KEYS","listing-gen:processing:v1:*"]'
```

A healthy system shows 0–3 active lock keys.  More than 10 outstanding locks
is a signal that workers are not completing or the heartbeat is not calling `EXPIRE`.

---

## Monthly Tasks

### M-1 · P90 Latency Trend Analysis
**Script:** `scripts/pipeline-p90-baseline.sql` (query 1b)

Run the weekly P90 trend query against the last 12 weeks.  Paste results into a
spreadsheet or export to your observability platform.

**Alert thresholds:**
| Metric | Warning | Critical |
|---|---|---|
| P90 end-to-end duration | > 120 s | > 240 s |
| P99 end-to-end duration | > 180 s | > 300 s |

A rising P90 over consecutive weeks indicates Gemini API degradation, context
package size growth, or Redis lock contention.

---

### M-2 · STALE_VAULT_CONTEXT Trend Analysis
Run query 4 from `scripts/pipeline-p90-baseline.sql` over a 30-day window (change
`INTERVAL '24 hours'` to `INTERVAL '30 days'`):

```sql
SELECT vault_locale, failure_type, cnt,
       ROUND(100.0 * cnt / NULLIF(SUM(cnt) OVER (PARTITION BY vault_locale), 0), 1) AS pct
FROM (
  SELECT vault_locale,
    CASE WHEN generation_error ILIKE '%stale%' OR generation_error ILIKE '%vault%context%'
         THEN 'stale_vault_context' ELSE 'other_failure' END AS failure_type,
    COUNT(*) AS cnt
  FROM public.workspace_listing_drafts
  WHERE generation_status = 'failed'
    AND created_at >= now() - INTERVAL '30 days'
  GROUP BY vault_locale, failure_type
) c;
```

Rising stale-context rate (> 10 %) means users are frequently editing their
optimization queue mid-generation.  Consider adding a UI warning before
generation starts, or increasing the debounce window in the client hook.

---

### M-3 · Per-Phase Token Baseline Review
Run query 2 from `scripts/pipeline-p90-baseline.sql`.

A month-over-month increase in `avg_prompt_tokens` for the `long` phase signals
context package growth — review `src/lib/listing/signal-compressor.ts` compression
settings and consider tightening `MAX_SIGNAL_TOKENS` if costs are rising.

---

### M-4 · QStash Delivery Retry Audit
Log into the [Upstash QStash Console](https://console.upstash.com/qstash) and review:

1. **Failed message count** for the `POST /api/listings/worker` destination in the last 30 days.
2. **Retry backlog** — messages in `retrying` state indicate worker 5xx rates.
3. **DLQ** (Dead-Letter Queue) — any messages here were exhausted after 3 retries.  Retrieve the `jobId` from the DLQ message body and manually mark the job failed:

```sql
UPDATE public.workspace_listing_drafts
SET generation_status = 'failed',
    generation_error  = 'QStash DLQ: exhausted 3 retries — manual intervention'
WHERE job_id = '<job-id-from-dlq>';
```

---

### M-5 · Dependency Probe Baseline
Add a `/api/health` route (if not present) that calls `probeAllDependencies` from
`src/lib/monitoring/kill-switch.ts` and compare latencies month-over-month.

```typescript
import { probeAllDependencies } from "@/lib/monitoring/kill-switch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const results = await probeAllDependencies(getSupabaseAdmin());
  const allOk = results.every((r) => r.ok);
  return Response.json({ ok: allOk, probes: results }, { status: allOk ? 200 : 503 });
}
```

---

## Emergency Procedures

### E-1 · Manually Clear a Stuck Redis Lock

Use when a job is permanently stuck in "processing" because the worker crashed
before releasing the Redis queue-hash lock, and the heartbeat kept extending TTL.

**Step 1 — Identify the lock key.**
Get `workspaceId` and `queue_hash` from the stuck job:
```sql
SELECT workspace_id, queue_hash, job_id, generation_status, updated_at
FROM   public.workspace_listing_drafts
WHERE  job_id = '<stuck-job-id>';
```

**Step 2 — Delete the Redis key.**
```bash
curl -X POST "$UPSTASH_REDIS_REST_URL" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '["DEL","listing-gen:processing:v1:<workspaceId>:<queueHash>"]'
```

**Step 3 — Mark the job failed.**
```sql
UPDATE public.workspace_listing_drafts
SET generation_status = 'failed',
    generation_error  = 'Manual SRE intervention: lock cleared, job marked failed'
WHERE job_id = '<stuck-job-id>'
  AND generation_status = 'processing';
```

**Step 4 — Confirm.**
Verify both the lock key is gone and the job row shows `generation_status = 'failed'`.
The user can now re-trigger generation from the UI.

---

### E-2 · QStash Unresponsive (Upstream Outage)

1. **Activate the async pipeline kill-switch** (immediate, no deploy):
   ```
   KILL_SWITCH_ASYNC_PIPELINE=1
   ```
   Set on Vercel → Project → Environment Variables.  Trigger a new deployment or
   use edge-config push.

2. **Verify kill-switch is active.** The next generation attempt from any user
   will receive a `503 service_unavailable` with the message:
   > "AI Listing generation is temporarily paused for maintenance. Please try again shortly."

3. **Monitor for recovery.** Poll the QStash health endpoint:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -H "Authorization: Bearer $QSTASH_TOKEN" \
     https://qstash.upstash.io/v2/queues
   ```

4. **Once QStash recovers**, remove `KILL_SWITCH_ASYNC_PIPELINE` from env and redeploy.
   Jobs that were rejected during the outage must be re-triggered by users manually.

5. **Do not re-queue rejected jobs programmatically.** There is no stored intent to
   re-publish — the producer only enqueues on an explicit client request.  Notify
   affected users via a status page banner.

---

### E-3 · Vault Hash Mismatch Storm (>20% 409 Rate)

Indicates widespread STALE_VAULT_CONTEXT errors, possibly caused by a bulk
vault migration, a schema change to `workspace_keywords`, or a bug in `syncQueueHash`.

1. **Check the 409 rate** in structured logs:
   ```
   event:STALE_VAULT_CONTEXT
   ```
   If rate > 20% over 15 minutes, activate the vault validation kill-switch:
   ```
   KILL_SWITCH_VAULT_VALIDATION=1
   ```
   Workers will now skip the staleness check and proceed with whatever context
   the job payload contains.

2. **Diagnose the root cause** using `scripts/diagnose-context.mjs`:
   ```bash
   node scripts/diagnose-context.mjs
   ```
   Compare `compileContext` output vs raw `workspace_keywords` rows for an affected workspace.

3. **Fix the vault** (run the appropriate migration or RPC to re-sync queue hashes).

4. **Deactivate the kill-switch** once the 409 rate returns to < 3%.

---

### E-4 · Upstash Redis Outage (Lock Service Down)

The Redis queue-hash lock uses `SET NX` to prevent duplicate in-flight pipelines.
If Redis is completely unavailable, `setNx` throws and the producer returns 500.

1. **Activate the Redis lock kill-switch:**
   ```
   KILL_SWITCH_REDIS_LOCK=1
   ```
   The producer will skip the distributed lock and rely on the in-process
   idempotency lock only.  Duplicate pipeline risk is minimal in practice
   because each workspace typically has one active user session.

2. **Monitor for duplicate jobs.** Query for pairs:
   ```sql
   SELECT workspace_id, queue_hash, COUNT(*) AS job_count
   FROM   public.workspace_listing_drafts
   WHERE  generation_status IN ('pending', 'processing')
     AND  created_at >= now() - INTERVAL '1 hour'
   GROUP  BY workspace_id, queue_hash
   HAVING COUNT(*) > 1;
   ```
   If duplicates appear, mark the older job failed:
   ```sql
   UPDATE public.workspace_listing_drafts
   SET generation_status = 'failed',
       generation_error  = 'Duplicate job: Redis lock unavailable during Redis outage'
   WHERE (workspace_id, queue_hash) IN (
     SELECT workspace_id, queue_hash
     FROM   public.workspace_listing_drafts
     WHERE  generation_status IN ('pending', 'processing')
     GROUP  BY workspace_id, queue_hash
     HAVING COUNT(*) > 1
   )
   -- Keep the newest job; mark older ones failed
   AND ctid NOT IN (
     SELECT MAX(ctid)
     FROM   public.workspace_listing_drafts
     WHERE  generation_status IN ('pending', 'processing')
     GROUP  BY workspace_id, queue_hash
   );
   ```

3. **Deactivate kill-switch** once Upstash Redis is healthy (confirm with `probeRedis()`).

---

### E-5 · Mass Job Failure After Deployment

Symptom: sudden spike in `generation_status = 'failed'` immediately after a code
deploy — often a schema change, env-var rotation, or module import error.

1. **Check Vercel function logs** for unhandled exceptions in `/api/listings/worker`.
2. **Rollback the deployment** via Vercel → Deployments → Promote previous deployment.
3. **Identify affected jobs:**
   ```sql
   SELECT id, job_id, workspace_id, vault_locale, generation_error, updated_at
   FROM   public.workspace_listing_drafts
   WHERE  generation_status = 'failed'
     AND  updated_at >= now() - INTERVAL '2 hours'
   ORDER  BY updated_at DESC
   LIMIT  50;
   ```
4. **Do not auto-retry.** Workers are QStash-delivered; retries are managed by QStash
   (3 attempts with backoff).  For jobs already at `failed`, users re-trigger from the UI.
5. **Post-mortem:** review `generation_error` text to identify the root cause before
   re-deploying the fix.

---

## Environment Variable Reference

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Admin DB access (server-only) |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `QSTASH_TOKEN` | ✅ prod | Upstash QStash publish token |
| `QSTASH_CURRENT_SIGNING_KEY` | ✅ prod | QStash request signature verification |
| `QSTASH_NEXT_SIGNING_KEY` | ✅ prod | QStash key rotation |
| `QSTASH_CALLBACK_URL` | optional | Explicit worker URL override |
| `UPSTASH_REDIS_REST_URL` | ✅ prod | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ prod | Upstash Redis REST token |
| `INTERNAL_WORKER_SECRET` | dev only | Local worker invocation bypass |
| `KILL_SWITCH_ASYNC_PIPELINE` | emergency | Disable QStash enqueue |
| `KILL_SWITCH_REDIS_LOCK` | emergency | Disable Redis distributed lock |
| `KILL_SWITCH_VAULT_VALIDATION` | emergency | Disable worker vault-hash check |
| `ZOMBIE_JOB_TIMEOUT_MINUTES` | optional (default: 30) | Stale-job threshold for `detect-zombie-jobs.mjs`; must be synced with `ops_config` DB row — see "How to Apply a Timeout Change" |

---

## Observability Checklist

All structured log events emitted by `logPipelineEvent` (from `src/lib/observability/pipeline-health.ts`):

| `event` | Severity | Trigger | Action |
|---|---|---|---|
| `STALE_VAULT_CONTEXT` | warn | Worker vault check fails (409) | Check stale rate; escalate if > 5% |
| `modular_phase_order_conflict` | error | Phase order violated in executor | Investigate phase sequencing logic |
| `WAITING_FOR_PHASES` | info | Prerequisite phases not yet persisted | Normal; client polls until resolved |
| `worker_failed` | error | Worker catch block; kill-switch activation | Check Gemini errors + Vercel logs |
| `job_not_found` | error | Worker receives unknown jobId | Possible QStash replay of deleted job |
| `generation_timeout` | warn | Client polling exceeded max wait | Check P90 trend; may need worker timeout increase |
| `queue_publish_failed` | error | QStash publish throws | Check QSTASH_TOKEN + QStash status |

**Log search patterns (Vercel / Datadog):**
```
# All pipeline events in the last hour
event:(STALE_VAULT_CONTEXT OR worker_failed OR queue_publish_failed)

# AR vault branch only
event:* vaultLocale:ar

# Specific workspace
event:* workspaceId:<uuid>
```

---

## Fragility Register

The following integrations are the highest-risk failure points, ranked by impact:

| Rank | Dependency | Failure mode | MTTR estimate | Kill-switch available |
|---|---|---|---|---|
| 1 | **Gemini API** | Rate limit / degraded latency | Minutes–hours | No (retry logic in worker) |
| 2 | **Upstash QStash** | Message delivery failure / quota | Minutes | ✅ `KILL_SWITCH_ASYNC_PIPELINE` |
| 3 | **Supabase DB** | Connection pool exhaustion | Minutes | No |
| 4 | **Upstash Redis** | Lock service unavailable | Minutes | ✅ `KILL_SWITCH_REDIS_LOCK` |
| 5 | **Staging Vault hash** | Corrupt/stale queue_hash | Minutes | ✅ `KILL_SWITCH_VAULT_VALIDATION` |

---

*This document should be reviewed and updated after every major architectural change.
For Session 5 specifics, see `STAGING_VAULT_INTEGRATION_SUMMARY.md` and `PROJECT_STATUS.md`.
Session 6 added the configurable zombie timeout (`ZOMBIE_JOB_TIMEOUT_MINUTES` / `ops_config`)
and the "How to Apply" propagation procedure.*
