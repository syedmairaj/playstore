# Auto-Retry Middleware Integration Guide

## Overview

The retry middleware provides exponential backoff + jitter for `Runware` and `Gemini` API calls. This prevents cascading failures and improves reliability when dealing with transient errors.

**Strategy:**
- Initial delay: 600ms
- Backoff: 2x exponential (600ms → 1.2s → 2.4s)
- Jitter: ±20% random variance (prevents thundering herd)
- Max retries: 3 (4 attempts total)
- Timeout: 30s per attempt
- Total worst-case: ~5.4s

---

## File Structure

```
lib/retry/
├── retry-engine.ts          # Core retry logic (generic)
├── error-classifier.ts      # Error type detection (Runware + Gemini)
├── runware-retry.ts         # Runware API wrapper
├── gemini-retry.ts          # Gemini API wrapper
└── __tests__/
    ├── retry-engine.test.ts
    └── error-classifier.test.ts
```

---

## Integration Patterns

### Pattern 1: Runware API Calls (Most Common)

**Before:**
```typescript
// app/api/screenshot-studio/generate/route.ts
const response = await callRunware({
  prompt: "...",
  model: "FLUX.1-dev",
  steps: 20,
});
```

**After:**
```typescript
import { callRunwareWithRetry } from "@/lib/retry/runware-retry";

const result = await callRunwareWithRetry(
  () => callRunware({
    prompt: "...",
    model: "FLUX.1-dev",
    steps: 20,
  })
);

if (result.success) {
  const response = result.data;
  // Process response...
} else {
  // Log error classification
  const errorMsg = getRunwareErrorMessage(result);
  console.error(`Runware failed: ${errorMsg}`);
  
  // Refund credits if needed
  await refundWorkspaceAiCredits(workspaceId, 20);
  
  // Return error to client
  return NextResponse.json(
    { error: errorMsg },
    { status: 500 }
  );
}
```

---

### Pattern 2: Gemini API Calls

**Before:**
```typescript
// lib/gemini/generate-screenshot-pack.ts
const response = await model.generateContent(prompt);
```

**After:**
```typescript
import { callGeminiWithRetry, getGeminiErrorMessage } from "@/lib/retry/gemini-retry";

const result = await callGeminiWithRetry(
  () => model.generateContent(prompt)
);

if (result.success) {
  const response = result.data;
  const text = response.response.text();
  // Parse and process text...
} else {
  const errorMsg = getGeminiErrorMessage(result);
  console.error(`Gemini failed: ${errorMsg}`);
  throw new Error(`Gemini generation failed: ${errorMsg}`);
}
```

---

### Pattern 3: Custom Retry Config

```typescript
import { callGeminiWithRetry } from "@/lib/retry/gemini-retry";

// Use fewer retries for fast-fail scenarios
const result = await callGeminiWithRetry(
  () => model.generateContent(prompt),
  {
    maxRetries: 1,           // Only 1 retry (2 attempts total)
    initialDelayMs: 300,     // Start with 300ms
    debug: true,             // Log retry attempts
  }
);
```

---

## Specific Integration Points

### 1. Screenshot Generation (`app/api/screenshot-studio/generate/route.ts`)

**Current Code (Line ~122):**
```typescript
const backgroundResponse = await callRunware({
  prompt: backgroundPrompt,
  model: "FLUX.1-dev",
  steps: 20,
  ...
});
```

**Updated Code:**
```typescript
import { callRunwareWithRetry, getRunwareErrorMessage } from "@/lib/retry/runware-retry";

// Wrap the entire Runware call
const retryResult = await callRunwareWithRetry(
  () => callRunware({
    prompt: backgroundPrompt,
    model: "FLUX.1-dev",
    steps: 20,
    ...
  })
);

if (!retryResult.success) {
  console.error(`Runware failed: ${getRunwareErrorMessage(retryResult)}`);
  await refundWorkspaceAiCredits(workspaceId, 20);
  throw new Error("Screenshot generation failed - credits refunded");
}

const backgroundResponse = retryResult.data;
```

---

### 2. Screenshot Layout Generation (`lib/gemini/generate-screenshot-layout.ts`)

**Current Code (Line ~Line 200+):**
```typescript
const response = await model.generateContent({
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  generationConfig: { maxOutputTokens: 2000 },
});

const layoutText = response.response.text();
```

**Updated Code:**
```typescript
import { callGeminiWithRetry, getGeminiErrorMessage } from "@/lib/retry/gemini-retry";

const retryResult = await callGeminiWithRetry(
  () => model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 2000 },
  }),
  { debug: true } // Enable debug logging
);

if (!retryResult.success) {
  const errorMsg = getGeminiErrorMessage(retryResult);
  console.error(`Layout generation failed: ${errorMsg}`);
  throw new Error(`Failed to generate layout: ${errorMsg}`);
}

const layoutText = retryResult.data.response.text();
```

---

### 3. App Icon Generation (`app/api/brand-assets/icon-generate/route.ts`)

**Pattern:**
```typescript
import { callRunwareWithRetry } from "@/lib/retry/runware-retry";

// Loop through 4 icon variants
const iconPromises = variantPrompts.map((prompt) =>
  callRunwareWithRetry(() => callRunware({ prompt, model: "FLUX.1-dev", ... }))
);

const results = await Promise.all(iconPromises);

// Check for failures
const failures = results.filter((r) => !r.success);
if (failures.length > 0) {
  await refundWorkspaceAiCredits(workspaceId, 15);
  throw new Error(`Icon generation failed on ${failures.length} variant(s)`);
}

// Extract data from successful results
const iconBuffers = results.map((r) => r.data);
```

---

### 4. Banner Generation (`app/api/brand-assets/banner-generate/route.ts`)

Same pattern as icons — wrap each Runware call.

---

## Error Handling Best Practices

### 1. Classify Errors at Decision Points

```typescript
import { classifyRunwareError, classifyGeminiError } from "@/lib/retry/error-classifier";

// After retry exhaustion, check why it failed
const classification = classifyRunwareError(result.error);

if (classification.statusCode === 429) {
  // Rate limited — backoff needed client-side
  return NextResponse.json(
    { error: "Rate limited. Please retry in 60 seconds.", retryAfter: 60 },
    { status: 429, headers: { "Retry-After": "60" } }
  );
} else if (classification.code === "ECONNRESET") {
  // Network issue — likely transient
  return NextResponse.json(
    { error: "Network error. Please try again.", retryable: true },
    { status: 503 }
  );
} else {
  // Unknown or permanent error
  return NextResponse.json(
    { error: classification.reason },
    { status: 500 }
  );
}
```

### 2. Log Retry Metadata

```typescript
import { callGeminiWithRetry, getGeminiErrorMessage } from "@/lib/retry/gemini-retry";

const result = await callGeminiWithRetry(
  () => model.generateContent(prompt),
  { debug: true } // Logs each attempt
);

// Additional logging for monitoring
if (!result.success) {
  console.error({
    event: "gemini_api_failure",
    workspaceId,
    appId,
    attempts: result.attempts,
    totalDurationMs: result.totalDurationMs,
    lastError: result.lastError,
  });
}
```

### 3. Credit Refunds

Always refund credits if a retryable operation fails after exhaustion:

```typescript
if (!result.success) {
  const classification = classifyRunwareError(result.error);
  
  if (classification.isRetryable) {
    // Transient error — refund credits
    await refundWorkspaceAiCredits(workspaceId, creditsCost);
  } else {
    // Permanent error — don't refund (user may have triggered it)
  }
}
```

---

## Testing the Middleware

### Run Unit Tests

```bash
npm test lib/retry/__tests__/retry-engine.test.ts
npm test lib/retry/__tests__/error-classifier.test.ts
```

### Manual Integration Test

Create a test endpoint:

```typescript
// app/api/test-retry/route.ts
import { callGeminiWithRetry } from "@/lib/retry/gemini-retry";

export async function GET(req: Request) {
  const { maxRetries = 3, shouldFail = false } = Object.fromEntries(new URL(req.url).searchParams);

  const result = await callGeminiWithRetry(
    async () => {
      if (shouldFail === "true") {
        const error = new Error("Test failure");
        (error as any).status = "INTERNAL";
        throw error;
      }
      return { success: true, message: "Test succeeded" };
    },
    { maxRetries: parseInt(maxRetries as string), debug: true }
  );

  return Response.json(result);
}
```

Test:
```bash
# Success case
curl http://localhost:3000/api/test-retry

# Failure case (should retry 3 times and fail)
curl http://localhost:3000/api/test-retry?shouldFail=true&maxRetries=3
```

---

## Performance Characteristics

| Scenario | Duration | Attempts |
|----------|----------|----------|
| Succeeds on 1st attempt | ~50ms | 1 |
| Fails once, succeeds on 2nd | ~650ms | 2 |
| Fails twice, succeeds on 3rd | ~1850ms | 3 |
| Exhausts all retries (3) | ~5400ms | 4 |
| Hits 30s timeout | ~30000ms | 1 |

**Jitter adds ±20% variance**, so real timings will fluctuate around these values.

---

## Checklist for Integration

- [ ] Import retry wrappers in API route
- [ ] Wrap Runware calls with `callRunwareWithRetry()`
- [ ] Wrap Gemini calls with `callGeminiWithRetry()`
- [ ] Add error handling for non-retryable errors
- [ ] Implement credit refunds on retry exhaustion
- [ ] Add debug logging for monitoring
- [ ] Test with manual failure injection
- [ ] Deploy and monitor error rates

---

## Migration Summary

**High Priority (Blocking Jobs):**
- [ ] `app/api/screenshot-studio/generate/route.ts` — Runware FLUX calls
- [ ] `lib/gemini/generate-screenshot-pack.ts` — Gemini pack generation
- [ ] `lib/gemini/generate-screenshot-layout.ts` — Gemini layout generation

**Medium Priority (Brand Assets):**
- [ ] `app/api/brand-assets/icon-generate/route.ts`
- [ ] `app/api/brand-assets/banner-generate/route.ts`

**Low Priority (Secondary Features):**
- [ ] `lib/gemini/generate-aso-assets.ts` (listing generation)
- [ ] Review/Common Issues endpoints

---

## Troubleshooting

### Issue: "Why did it retry 4 times when I set maxRetries: 3?"

**Answer:** `maxRetries` means "retry 3 times AFTER the initial attempt", so total attempts = 1 + 3 = 4.

### Issue: "Jitter makes timing unpredictable for tests"

**Solution:** Set `jitterFraction: 0` in test config for deterministic delays.

### Issue: "My timeout is being ignored"

**Check:** Ensure the function you pass to `callRunwareWithRetry()` doesn't have its own timeout. The middleware applies its own timeout wrapper.

---

## Next Steps

1. **Update screenshot generation** (`generate/route.ts`) to use `callRunwareWithRetry()`
2. **Update layout generation** (`generate-screenshot-layout.ts`) to use `callGeminiWithRetry()`
3. **Run full integration tests** against staging environment
4. **Monitor error rates** and retry success metrics post-deployment
5. **Then proceed to Theme-Store Architecture**
