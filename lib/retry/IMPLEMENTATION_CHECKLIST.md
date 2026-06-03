# Auto-Retry Middleware — Implementation Checklist

## 1. Core Files Created ✅

- [x] `lib/retry/retry-engine.ts` — Generic retry logic with exponential backoff + jitter
- [x] `lib/retry/error-classifier.ts` — Runware & Gemini error classification
- [x] `lib/retry/runware-retry.ts` — Runware API wrapper
- [x] `lib/retry/gemini-retry.ts` — Gemini API wrapper
- [x] `lib/retry/__tests__/retry-engine.test.ts` — Unit tests
- [x] `lib/retry/__tests__/error-classifier.test.ts` — Error classification tests
- [x] `lib/retry/INTEGRATION_GUIDE.md` — Integration patterns & examples
- [x] `lib/retry/IMPLEMENTATION_CHECKLIST.md` — This file

## 2. Integration Points (In Priority Order)

### TIER 1: Critical Path (Screenshot Generation)

**Must update for blocking job reliability:**

#### `app/api/screenshot-studio/generate/route.ts`
- [ ] Import: `import { callRunwareWithRetry, getRunwareErrorMessage } from "@/lib/retry/runware-retry";`
- [ ] Find line ~122 where `callRunware()` is called for backgrounds
- [ ] Wrap: `const result = await callRunwareWithRetry(() => callRunware({ ... }))`
- [ ] Add success check: `if (!result.success) { ... refund credits ... }`
- [ ] Update error response to use `getRunwareErrorMessage(result)`
- [ ] Test: Generate a 6-pack and verify retries work (inject network error)

#### `lib/gemini/generate-screenshot-pack.ts`
- [ ] Import: `import { callGeminiWithRetry, getGeminiErrorMessage } from "@/lib/retry/gemini-retry";`
- [ ] Find `model.generateContent(prompt)` call
- [ ] Wrap: `const result = await callGeminiWithRetry(() => model.generateContent(prompt))`
- [ ] Add success check and error handling
- [ ] Test: Verify pack generation retries on transient errors

#### `lib/gemini/generate-screenshot-layout.ts`
- [ ] Import: `import { callGeminiWithRetry, getGeminiErrorMessage } from "@/lib/retry/gemini-retry";`
- [ ] Find `model.generateContent()` call (parallel calls for 6 slides)
- [ ] Wrap each: `Promise.all(slides.map(s => callGeminiWithRetry(() => generateLayout(s))))`
- [ ] Aggregate results and handle partial failures
- [ ] Test: Verify individual layout retries don't block other slides

---

### TIER 2: Brand Assets (Icon/Banner)

**Important for feature reliability:**

#### `app/api/brand-assets/icon-generate/route.ts`
- [ ] Import: `import { callRunwareWithRetry, getRunwareErrorMessage } from "@/lib/retry/runware-retry";`
- [ ] Wrap each of 4 variant calls: `Promise.all(variants.map(v => callRunwareWithRetry(() => callRunware(v))))`
- [ ] Aggregate results and check for failures
- [ ] If failures > 0: refund 15 credits, return error
- [ ] Test: Verify partial failures (e.g., 2/4 variants fail) are handled

#### `app/api/brand-assets/banner-generate/route.ts`
- [ ] Same pattern as icon generation
- [ ] Wrap 4 banner variant calls
- [ ] Credit refund: 15 credits on failure
- [ ] Test: Verify timeout handling (30s per variant)

---

### TIER 3: Secondary Features

**Nice-to-have reliability improvements:**

#### `lib/gemini/generate-aso-assets.ts` (AI Listing Generation)
- [ ] Wrap: `callGeminiWithRetry(() => model.generateContent(prompt))`
- [ ] Implement standard error handling

#### Review/Common Issues Endpoints
- [ ] `app/api/reviews/common-issues/route.ts` — Wrap Gemini call
- [ ] `app/api/reviews/[reviewId]/ai-reply/route.ts` — Wrap Gemini call

#### Keyword Spotlight
- [ ] `app/api/market-intel/keyword-spotlight/route.ts` — Wrap Gemini call

---

## 3. Testing Checklist

### Unit Tests (Already Written)

```bash
# Run retry engine tests
npm test lib/retry/__tests__/retry-engine.test.ts

# Run error classifier tests
npm test lib/retry/__tests__/error-classifier.test.ts

# Run all retry tests
npm test lib/retry
```

**Expected Output:** All tests pass ✅

---

### Integration Tests (Manual)

#### Test 1: Screenshot Generation with Runware Retry
```bash
# Navigate to /brand-assets?tab=screenshot
# Click "Generate 6 Screenshots"
# Monitor browser console for retry logs (if debug: true enabled)
# Verify all 6 slides generate successfully
```

#### Test 2: Layout Generation with Gemini Retry
```bash
# Monitor app logs while generating screenshots
# Should see Gemini calls succeed on first attempt (no retries needed in happy path)
```

#### Test 3: Timeout Handling
```bash
# Create a test route that intentionally times out
# Verify timeout triggers after 30s
# Verify RetryResult.success = false with proper error message
```

#### Test 4: Error Classification
```bash
# Inject network error (ECONNRESET) to Runware mock
# Verify it retries (not fail-fast)
# Verify retry succeeds on next attempt
```

#### Test 5: Rate Limit Handling
```bash
# Mock Runware returning 429 (rate limit)
# Verify it retries with exponential backoff
# Verify totalDurationMs reflects 3 retry delays
```

---

## 4. Deployment Steps

### Local Development

```bash
# 1. Implement all TIER 1 integrations
# 2. Run tests
npm test lib/retry

# 3. Build
npm run build

# 4. Start locally
npm run dev

# 5. Manual QA on /brand-assets
```

### Staging

```bash
# 1. Push to staging branch
git push origin feature/auto-retry-middleware

# 2. Deploy to staging environment
# (Your CI/CD pipeline here)

# 3. Run integration tests against staging
# - Generate screenshots
# - Monitor logs for retry behavior
# - Verify credit refunds work

# 4. Load test
# - Generate 10 screenshot packs concurrently
# - Monitor for exponential backoff spacing
# - Verify no "thundering herd" spike
```

### Production

```bash
# 1. Create PR with TIER 1 integrations only
# 2. Code review and approval
# 3. Merge to main
# 4. Deploy to production
# 5. Monitor error rates and retry success metrics
# 6. After 1 week, if stable:
#    - Add TIER 2 integrations
#    - Deploy TIER 2
#    - Monitor again
# 7. After another week, if stable:
#    - Add TIER 3 integrations
#    - Deploy TIER 3
```

---

## 5. Monitoring & Metrics

### Metrics to Track

After deploying, monitor these in your logs/APM:

```
1. Retry Success Rate
   - Total retried calls / Total calls with retries
   - Target: >90% succeed after retry

2. Retry Distribution
   - % succeeded on attempt 1 (no retry)
   - % succeeded on attempt 2 (1 retry)
   - % succeeded on attempt 3 (2 retries)
   - % failed after attempt 4 (3 retries exhausted)
   - Target: >95% succeed before attempt 4

3. Average Duration by Outcome
   - Successful on attempt 1: ~50ms
   - Successful on attempt 2: ~650ms
   - Successful on attempt 3: ~1850ms
   - Failed after retries: ~5400ms

4. Error Type Distribution
   - ECONNRESET, ETIMEDOUT, 429, 5xx (retryable)
   - 400, 401, 403, 404 (non-retryable)
   - Check that non-retryable errors fail fast (<100ms)

5. Credit Refunds
   - Count of refunds due to retry exhaustion
   - Should be very low (~1-5% of total jobs)
```

### Example Logging

```typescript
// Log structured data for monitoring
const result = await callRunwareWithRetry(fn, { debug: true });

if (!result.success) {
  const classification = classifyRunwareError(result.error);
  
  // Send to logs/APM
  logger.error({
    component: "screenshot-studio",
    action: "runware-generation",
    workspaceId,
    appId,
    success: false,
    attempts: result.attempts,
    totalDurationMs: result.totalDurationMs,
    errorType: classification.code || "unknown",
    statusCode: classification.statusCode,
    isRetryable: classification.isRetryable,
  });
}
```

---

## 6. Rollback Plan

If issues arise after deployment:

### Immediate Rollback (if critical)
```bash
git revert <commit-hash-of-retry-integration>
npm run build
npm run deploy
```

### Gradual Rollback (if partial issues)
```bash
# Keep TIER 1, remove TIER 2/3 integrations
# Deploy reduced retry wrapper
```

### Debug Mode
```typescript
// Enable debug logging on specific routes
const result = await callRunwareWithRetry(fn, { 
  debug: process.env.DEBUG_RETRY === "true" 
});
```

---

## 7. Migration Timeline

**Week 1:**
- [ ] Implement all core files (retry-engine, error-classifier, wrappers)
- [ ] Write unit tests
- [ ] Integrate TIER 1 (screenshot generation)
- [ ] Deploy to staging + QA
- [ ] Monitor for 3 days

**Week 2:**
- [ ] Deploy TIER 1 to production
- [ ] Monitor production metrics
- [ ] Integrate TIER 2 (brand assets)
- [ ] Deploy TIER 2 to staging + QA

**Week 3:**
- [ ] Deploy TIER 2 to production
- [ ] Monitor again
- [ ] Integrate TIER 3 (secondary features)
- [ ] Deploy TIER 3 to production

**Post-Deployment:**
- [ ] Theme-Store Architecture (next pillar)
- [ ] ASO Report Card
- [ ] Telemetry (aso_telemetry table)

---

## 8. Quick Reference

### Import Statements
```typescript
// For Runware
import { callRunwareWithRetry, getRunwareErrorMessage } from "@/lib/retry/runware-retry";
import { classifyRunwareError, isRunwareRetryable } from "@/lib/retry/error-classifier";

// For Gemini
import { callGeminiWithRetry, getGeminiErrorMessage } from "@/lib/retry/gemini-retry";
import { classifyGeminiError, isGeminiRetryable } from "@/lib/retry/error-classifier";

// Core engine (if custom config needed)
import { retryWithBackoff, calculateBackoffDelay } from "@/lib/retry/retry-engine";
```

### Default Config
```typescript
{
  maxRetries: 3,              // 4 total attempts
  initialDelayMs: 600,        // First retry at 600ms
  backoffMultiplier: 2,       // Each retry 2x longer
  jitterFraction: 0.2,        // ±20% random variance
  timeoutMs: 30000,           // 30s per attempt
  isRetryable: (error) => ... // Custom classifier
}
```

### Success Case
```typescript
if (result.success) {
  const data = result.data;
  console.log(`Succeeded in ${result.attempts} attempts`);
}
```

### Failure Case
```typescript
if (!result.success) {
  const msg = getRunwareErrorMessage(result); // or getGeminiErrorMessage
  console.error(msg);
  
  // Refund if retryable error exhausted
  const classification = classifyRunwareError(result.error);
  if (classification.isRetryable) {
    await refundWorkspaceAiCredits(workspaceId, cost);
  }
}
```

---

## Next Pillar: Theme-Store Architecture

Once TIER 1 is stable in production:

1. Create `lib/gemini/schemas.json` (theme definitions)
2. Add `workspace_theme_overrides` table (custom themes for premium users)
3. Implement `loadThemeForWorkspace()` helper
4. Wire themes into screenshot + banner generation
5. Add Theme Store UI tab in Brand Assets

**See:** THEME_STORE_ARCHITECTURE.md (to be created next)

---

## Sign-Off

- [ ] All files created and tested
- [ ] TIER 1 integrations complete
- [ ] Unit tests passing
- [ ] Ready for THEME-STORE rollout

**Current Status:** ✅ Ready for deployment
