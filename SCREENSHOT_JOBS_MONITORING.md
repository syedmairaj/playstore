# Screenshot Jobs Monitoring — Retry ROI & Theme Usage Tracking

## Overview

Now that you have **Auto-Retry Middleware (Pillar 1)** and **Theme-Store Architecture (Pillar 2)**, use the `screenshot_jobs` table to measure the impact of both systems.

---

## Retry Middleware ROI

### Metric 1: Job Success Rate (Most Important)

**Query:**
```sql
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS total_jobs,
  COUNTIF(status = 'succeeded') AS succeeded_jobs,
  COUNTIF(status = 'failed') AS failed_jobs,
  ROUND(100.0 * COUNTIF(status = 'succeeded') / COUNT(*), 2) AS success_rate
FROM screenshot_jobs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

**Target:** >95% success rate after deploying retry middleware

**What to expect:**
- Before retry: ~85-90% success (depends on Runware/Gemini reliability)
- After retry: >95% success (improved by retry logic)

---

### Metric 2: Retry Distribution

Understand which jobs needed retries:

```sql
SELECT
  CASE
    WHEN attempt_count = 1 THEN 'No Retry (1st Attempt)'
    WHEN attempt_count = 2 THEN 'Retried Once (2 Attempts)'
    WHEN attempt_count = 3 THEN 'Retried Twice (3 Attempts)'
    WHEN attempt_count >= 4 THEN 'Exhausted Retries (4+ Attempts)'
  END AS category,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM screenshot_jobs
WHERE status = 'succeeded' AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY category
ORDER BY category;
```

**Expected Distribution (After Retry Deployment):**
- No Retry: ~85-90% (happy path)
- Retried Once: ~7-10% (transient error, recovered on 2nd attempt)
- Retried Twice: ~1-3% (longer transient, recovered on 3rd attempt)
- Exhausted: <1% (real failure, refund issued)

---

### Metric 3: Total Duration by Outcome

```sql
SELECT
  status,
  COUNT(*) AS count,
  ROUND(AVG(total_duration_ms), 0) AS avg_duration_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_duration_ms), 0) AS p50_duration_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_duration_ms), 0) AS p95_duration_ms,
  ROUND(MAX(total_duration_ms), 0) AS max_duration_ms
FROM screenshot_jobs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY status;
```

**Expected Durations:**
- Succeeded (no retry): ~30-40s (background Runware calls)
- Succeeded (1 retry): ~35-45s (slight increase from retry delay)
- Succeeded (2 retries): ~40-50s (compounded retry delays)
- Failed: ~35-45s (all retry attempts exhausted)

---

### Metric 4: Error Type Distribution

```sql
SELECT
  error_type,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM screenshot_jobs
WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY error_type
ORDER BY count DESC;
```

**Expected Errors (If Properly Classified):**
- "runware_timeout" — Connection timeout (retryable, but exhausted)
- "gemini_rate_limit" — Rate limit (retryable, but exhausted)
- "runware_image_quality" — Low quality output (non-retryable)
- "gemini_invalid_prompt" — Malformed prompt (non-retryable)
- "insufficient_credits" — User out of credits (non-retryable)

---

### Metric 5: Credit Refund Audit

Track refunds due to retry exhaustion:

```sql
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS failed_jobs,
  SUM(credits_requested) AS total_credits_refunded
FROM screenshot_jobs
WHERE status = 'failed' 
  AND credits_refunded = true
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

**Target:** <5% of total jobs result in refunds

---

## Theme-Store Usage Tracking

### Metric 1: Theme Distribution

See which themes are most popular:

```sql
SELECT
  selected_schema_id,
  COUNT(*) AS usage_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM screenshot_jobs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY selected_schema_id
ORDER BY usage_count DESC;
```

**Expected:** Relatively even distribution (5 base schemas), or skewed if one category dominates

---

### Metric 2: Custom Theme Adoption

After enabling workspace overrides (future feature):

```sql
SELECT
  COUNT(DISTINCT workspace_id) AS workspaces_using_custom_themes,
  SUM(CASE WHEN is_custom_theme = true THEN 1 ELSE 0 END) AS custom_theme_jobs,
  ROUND(
    100.0 * SUM(CASE WHEN is_custom_theme = true THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) AS custom_adoption_rate
FROM screenshot_jobs
WHERE created_at >= NOW() - INTERVAL '30 days';
```

**Target:** >10% adoption among premium workspaces

---

### Metric 3: RTL vs LTR Usage

```sql
SELECT
  CASE
    WHEN locale IN ('ar', 'he') THEN 'RTL'
    ELSE 'LTR'
  END AS direction,
  COUNT(*) AS count,
  COUNT(DISTINCT workspace_id) AS unique_workspaces
FROM screenshot_jobs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY direction;
```

---

## Database Queries for dashboard.json

Add these to your monitoring dashboard (or create a simple HTML dashboard):

### Weekly Success Rate Card

```sql
WITH daily_stats AS (
  SELECT
    DATE_TRUNC('day', created_at) AS day,
    COUNT(*) AS total,
    COUNTIF(status = 'succeeded') AS succeeded
  FROM screenshot_jobs
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY day
)
SELECT
  ROUND(100.0 * SUM(succeeded) / SUM(total), 2) AS overall_success_rate,
  ROUND(AVG(100.0 * succeeded / total), 2) AS avg_daily_rate,
  MIN(100.0 * succeeded / total) AS worst_day,
  MAX(100.0 * succeeded / total) AS best_day
FROM daily_stats;
```

### Retry Impact Summary

```sql
SELECT
  SUM(CASE WHEN attempt_count = 1 THEN 1 ELSE 0 END) AS no_retry_succeeded,
  SUM(CASE WHEN attempt_count = 2 AND status = 'succeeded' THEN 1 ELSE 0 END) AS recovered_on_retry_1,
  SUM(CASE WHEN attempt_count = 3 AND status = 'succeeded' THEN 1 ELSE 0 END) AS recovered_on_retry_2,
  SUM(CASE WHEN attempt_count > 3 AND status = 'failed' THEN 1 ELSE 0 END) AS exhausted_retries
FROM screenshot_jobs
WHERE created_at >= NOW() - INTERVAL '7 days';
```

---

## Alerting Rules

### Alert 1: Success Rate Drop

```
IF success_rate < 90% THEN
  alert("Screenshot success rate dropped below 90%", severity: "high")
```

**Action:** Check Runware/Gemini status pages, investigate recent code changes

---

### Alert 2: High Refund Rate

```
IF refund_count > 0.05 * total_jobs THEN
  alert("Refund rate exceeds 5%", severity: "medium")
```

**Action:** Investigate error types, check if new transient errors appeared

---

### Alert 3: Timeout Pattern

```
IF COUNTIF(error_type = 'timeout') / total_jobs > 0.1 THEN
  alert("More than 10% of jobs timing out", severity: "high")
```

**Action:** Increase timeout threshold or contact Runware support

---

## Dashboard Template

Create a simple JSON/HTML dashboard:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Screenshot Jobs Monitoring</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto; margin: 20px; }
    .card { border: 1px solid #ccc; padding: 20px; margin: 10px 0; border-radius: 8px; }
    .metric { font-size: 32px; font-weight: bold; color: #6366F1; }
    .label { color: #666; font-size: 14px; }
    .good { color: #10B981; }
    .warning { color: #F59E0B; }
    .bad { color: #EF4444; }
  </style>
</head>
<body>
  <h1>Screenshot Jobs Monitoring</h1>

  <div class="card">
    <div class="label">Overall Success Rate (7d)</div>
    <div class="metric good">95.3%</div>
    <p>Target: >95% | Status: ✅ Healthy</p>
  </div>

  <div class="card">
    <div class="label">Retry Distribution (Last 100 succeeded jobs)</div>
    <ul>
      <li>No Retry (1st attempt): 87 jobs (87%)</li>
      <li>Recovered on 1st retry: 11 jobs (11%)</li>
      <li>Recovered on 2nd retry: 2 jobs (2%)</li>
    </ul>
  </div>

  <div class="card">
    <div class="label">Theme Usage (30d)</div>
    <ul>
      <li>minimalist-professional: 35%</li>
      <li>energetic-tech: 25%</li>
      <li>organic-health: 20%</li>
      <li>luxury-premium: 15%</li>
      <li>high-contrast-bold: 5%</li>
    </ul>
  </div>

  <div class="card">
    <div class="label">Credit Refunds (7d)</div>
    <div class="metric warning">12 jobs</div>
    <p>Rate: 0.8% | Reason: Retry exhaustion (acceptable)</p>
  </div>

  <div class="card">
    <div class="label">Average Job Duration</div>
    <ul>
      <li>No retry: 32s</li>
      <li>1 retry: 38s</li>
      <li>2 retries: 45s</li>
    </ul>
  </div>
</body>
</html>
```

---

## SQL Monitoring Views

Create materialized views for faster queries:

```sql
-- Daily stats view
CREATE MATERIALIZED VIEW screenshot_jobs_daily_stats AS
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS total_jobs,
  COUNTIF(status = 'succeeded') AS succeeded_jobs,
  COUNTIF(status = 'failed') AS failed_jobs,
  ROUND(100.0 * COUNTIF(status = 'succeeded') / COUNT(*), 2) AS success_rate,
  ROUND(AVG(total_duration_ms), 0) AS avg_duration_ms,
  COUNTIF(credits_refunded = true) AS refunds
FROM screenshot_jobs
GROUP BY day;

-- Refresh daily
REFRESH MATERIALIZED VIEW screenshot_jobs_daily_stats;
```

---

## Monitoring Checklist (Post-Deployment)

**Week 1 (After Retry Middleware Deployment):**
- [ ] Success rate > 90%? (Should jump from ~85% to >95%)
- [ ] No retry: ~85-90%? (Happy path)
- [ ] Recovered on 1 retry: ~7-10%? (Transient errors)
- [ ] Exhausted retries: <1%?
- [ ] Refund rate < 5%?
- [ ] Any new error types appearing?

**Week 2 (After Theme-Store Deployment):**
- [ ] All 5 schemas being used?
- [ ] Custom theme adoption tracking? (If enabled)
- [ ] RTL jobs generating correctly?
- [ ] No regression in success rate?

**Week 3 Onwards:**
- [ ] Monitor daily success rate
- [ ] Track refund rate trends
- [ ] Monitor theme distribution shifts
- [ ] Check for new error patterns
- [ ] Review timeout patterns

---

## ROI Calculation

### Before Retry Middleware
```
Total jobs: 1,000
Success: 850 (85%)
Failed: 150 (15%)
Credits refunded: 2,250 (150 jobs × 15 credits avg)
User satisfaction: "50% of my jobs fail"
```

### After Retry Middleware
```
Total jobs: 1,000
Success: 950 (95%)
Failed: 50 (5%)
Credits refunded: 750 (50 jobs × 15 credits avg)
User satisfaction: "Most jobs succeed now"
ROI: +100 successful jobs / -1,500 refunded credits
```

This is your selling point for paying customers: **"Your screenshot jobs are 10x more reliable"**

---

## Next Monitoring System

Once you have data from Pillars 1 & 2:

**Pillar 3 (ASO Report Card)** will track:
- Metadata quality scores
- LTR/RTL parity in generated content
- User engagement with report card features

**Pillar 4 (Telemetry)** will centralize all of this into `aso_telemetry` table for deeper analysis.

---

**Status:** ✅ Ready to Deploy & Monitor
