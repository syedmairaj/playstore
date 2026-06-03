# Production Verification & Polish Guide

**Status**: ✅ **COMPLETE**  
**Date**: June 3, 2026  
**Purpose**: Comprehensive system validation before production deployment

---

## Overview

Four production-grade verification systems have been implemented:

1. **Asset Validation Diagnostics** — Comprehensive asset health reporting
2. **Hard-Clamp Prompt Verification** — Debug logging for dangerous keyword stripping
3. **Scrim & RTL Polish** — Enhanced composeBanner() with detailed logging
4. **Automated Test Route** — `/api/test-verification` for integration testing

---

## 1. Asset Validation Diagnostics

### What It Does
Validates all composition assets (schema frames, fonts, badges) and returns a detailed health report.

### Function Signature
```typescript
export async function validateCompositionAssets(): Promise<AssetValidationReport>
```

### Return Type
```typescript
interface AssetValidationReport {
  health: "healthy" | "degraded" | "critical";
  timestamp: string;
  summary: string;
  schemas: Record<MoodSchemaType, {
    frame: boolean;
    badge: boolean;
    path: string;
  }>;
  fonts: Record<"bold" | "elegant" | "clean", {
    exists: boolean;
    path: string;
  }>;
  missing: string[];
  warnings: string[];
}
```

### Usage

#### Call during server startup:
```typescript
// server.ts or middleware.ts
import { validateCompositionAssets } from "@/lib/screenshot/compose-screenshot";

const report = await validateCompositionAssets();

if (report.health !== "healthy") {
  console.error("Asset validation failed:", report.warnings);
  // Decide: continue with degraded mode, or fail startup?
}
```

#### Check specific schema:
```typescript
const report = await validateCompositionAssets();
const energyTechFrame = report.schemas["energetic-tech"].frame;
// true = frame.svg exists | false = will use built-in fallback
```

### Console Logging

The function automatically logs validation results:

```
[asset-validation] Starting composition asset validation...
[asset-validation] ✓ Schema 'minimalist-professional' fully equipped
[asset-validation] ⚠️  Schema 'energetic-tech' has frame but missing badge
[asset-validation] ⚠️  Missing font file 'elegant' at /path/to/PlayfairDisplay-Bold.ttf
[asset-validation] Health: degraded | Missing: 1 | Warnings: 2
```

### Health Status Meanings

- **healthy** (0 missing): All assets present, system fully equipped
- **degraded** (1-2 missing): Non-critical assets missing, system functional with fallbacks
- **critical** (3+ missing or frame missing): Critical assets missing, system may fail

---

## 2. Hard-Clamp Prompt Verification

### What It Does
Verifies that dangerous keywords are stripped from prompts before sending to Gemini/Runware.

### Functions Added

#### `stripDangerousKeywords(text: string): string`
Removes dangerous keywords:
```typescript
"Finance App" → "Finance"
"Mobile Phone Screenshot" → ""  // all removed
"Photo editing tool" → "Photo editing tool"  // safe words preserved
```

**Keywords stripped**:
- `app`, `application`
- `screenshot`, `screenshots`
- `mobile`, `phone`, `smartphone`
- `device`, `tablet`
- `hardware`

#### `verifyPromptCleanliness(text: string, textType: string)`
Checks if dangerous keywords are present:
```typescript
const result = verifyPromptCleanliness(prompt, "Background Prompt");
// Returns: { clean: true/false, found: string[], report: string }

if (!result.clean) {
  console.error(`Prompt contaminated with: ${result.found.join(", ")}`);
}
```

### Console Logging in generateASOAsset()

The main generator function logs detailed verification:

```
[generateASOAsset] Starting generation: type=banner, category=finance, locale=en
[generateASOAsset] Selected schema: minimalist-professional (Minimalist Professional)
[generateASOAsset] Verifying prompt cleanliness before Gemini call...
[generateASOAsset] ✓ Gemini Prompt: CLEAN (no dangerous keywords found)
[generateASOAsset] Calling Gemini API...
[generateASOAsset] Asset generated successfully: type=banner, schema=minimalist-professional, textEnabled=true
[generateASOAsset] ✓ Background Prompt (Runware-ready): CLEAN (no dangerous keywords found)
[generateASOAsset] ✓ Generation complete. Ready for Runware composition.
```

### Debug Mode: Viewing Final Prompts

To inspect the actual prompt being sent to Runware:

```typescript
// In generateASOAsset(), check console output
const asset = await generateASOAsset({
  appName: "Finance App",
  category: "finance",
  generatorType: "screenshot",
  ...
});

// Console will log:
// [generateASOAsset] Prompt preview (first 200 chars): You are crafting a 'Brand Mirror' SCREENSHOT...
// [generateASOAsset] ✓ Background Prompt (Runware-ready): CLEAN
```

### What to Monitor

✅ **Should see**:
- `✓ CLEAN` messages for all prompts
- No `❌ CONTAMINATED` warnings
- `Dangerous keywords found: 0`

❌ **Indicates a problem**:
- `⚠️  WARNING: Prompt contains dangerous keywords`
- `❌ CONTAMINATED with keywords: app, phone`
- `Consider reviewing input sanitization`

---

## 3. Scrim & RTL Polish

### composeBanner() Enhancements

The `composeBanner()` function now includes:

#### Detailed Documentation
Full RTL flow explanation in JSDoc:
```
RTL Flow (Arabic):
  1. Scale background to 1024×500
  2. Flop background (content mirrors right)
  3. Create scrim in LEFT third (text zone for flipped layout)
  4. Composite scrim + background
  5. FLOP ENTIRE COMPOSITION BACK (critical for visual balance)
  6. Result: Device on left, text zone on left = RTL-correct
```

#### Console Logging
```
[composeBanner] Composing banner: locale=ar, rtl=true, schema=minimalist-professional
[composeBanner] RTL detected: Flopping background for right-to-left layout
[composeBanner] Background scaled to 1024×500
[composeBanner] Scrim zone: left=0, width=341, opacity=40%
[composeBanner] Scrim composited: position=left, opacity=40%
[composeBanner] Applying flop-back to entire composition (critical RTL step)
[composeBanner] ✓ Flop-composite-flop complete: Visual balance maintained for RTL
[composeBanner] ✓ Banner composition complete: 1024×500, lossless PNG
```

### Scrim Verification Checklist

When testing banners, verify:

- [ ] **LTR (English)**: Scrim on RIGHT third (text zone)
- [ ] **RTL (Arabic)**: Scrim on LEFT third (after flop-back)
- [ ] **Scrim opacity**: 40% (visible but not overwhelming)
- [ ] **Scrim color**: Dark grey (#1a1a1a)
- [ ] **RTL visual balance**: Content and scrim aligned correctly

### RTL Critical Step

The most important part is the final flop-back:
```typescript
if (rtl) {
  // This flips the ENTIRE composition back
  // Not just the frame, not just the background
  // Everything: scrim + background + all overlays
  composed = await sharp(composed).flop().png().toBuffer();
}
```

**Why this matters**: Without the final flop-back, the scrim would be on the wrong side in RTL, creating visual asymmetry.

---

## 4. Automated Test Route: `/api/test-verification`

### Purpose
Comprehensive system validation in a single endpoint.

### Endpoint
```
GET /api/test-verification?token=YOUR_TEST_SECRET
POST /api/test-verification (with authorization header)
```

### Security
- Development mode: Available without token
- Production: Requires `TEST_VERIFICATION_TOKEN` environment variable
- Token can be passed as:
  - Query param: `?token=YOUR_TOKEN`
  - Authorization header: `Authorization: Bearer YOUR_TOKEN`

### GET Response Format

```json
{
  "status": "success",
  "summary": {
    "total": 4,
    "passed": 4,
    "failed": 0
  },
  "tests": [
    {
      "name": "Asset Validation",
      "status": "pass",
      "message": "All assets healthy: 5 schemas, 3 fonts"
    },
    {
      "name": "Crash Fallback (Undefined schemaId)",
      "status": "pass",
      "message": "Generated asset with schema: minimalist-professional"
    },
    {
      "name": "Hard-Clamp Prompt Verification",
      "status": "pass",
      "message": "Background prompt is clean (no dangerous keywords)"
    },
    {
      "name": "RTL Scrim Composition (Arabic)",
      "status": "pass",
      "message": "RTL banner ready: aspectRatio=2:1, textZone=left"
    }
  ],
  "logs": [
    "[test-verification] Starting comprehensive system validation...",
    "[test-verification] TEST 1: Validating composition assets...",
    "[test-verification] ✓ Assets healthy: All composition assets validated successfully ✓",
    ...
  ],
  "timestamp": "2026-06-03T15:30:45.123Z"
}
```

### Test Cases

#### Test 1: Asset Validation
Checks all schema frames, badges, and fonts:
```
Status: pass if all healthy or only non-critical items missing
Status: fail if critical items (frames) missing
```

#### Test 2: Crash Fallback
Generates screenshot with undefined schemaId to verify safe fallback:
```
Status: pass if no crash and schema is set to valid default
Status: fail if TypeError or schemaId is undefined
```

#### Test 3: Hard-Clamp Prompt Verification
Generates banner with potentially problematic app name:
```
Input: appName="Finance App Pro", headline="Screenshot your mobile phone app"
Expected: No dangerous keywords in backgroundPrompt
Status: pass if "app", "screenshot", "mobile", "phone" removed
Status: fail if any dangerous keywords remain
```

#### Test 4: RTL Scrim Composition
Generates Arabic banner to verify RTL handling:
```
Input: locale="ar", appName="تطبيق تمويل"
Expected: bannerMetadata.textZonePosition = "left"
Status: pass if RTL banner generated with correct text zone
Status: fail if asset type is wrong or metadata missing
```

### Using the Test Route

#### From curl:
```bash
# Development
curl "http://localhost:3000/api/test-verification"

# Production with token
curl "http://api.example.com/api/test-verification?token=YOUR_SECRET"
```

#### From TypeScript:
```typescript
const response = await fetch("/api/test-verification");
const result = await response.json();

console.log(`Tests passed: ${result.summary.passed}/${result.summary.total}`);
console.log("Logs:", result.logs);

if (result.status !== "success") {
  console.error("Verification failed:", result.tests.filter(t => t.status === "fail"));
}
```

#### Integration test before deployment:
```typescript
// ci-tests.ts
export async function runProductionTests() {
  const response = await fetch(
    `${process.env.API_URL}/api/test-verification?token=${process.env.TEST_TOKEN}`
  );

  if (!response.ok) {
    throw new Error(`Test verification failed: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.status !== "success") {
    throw new Error(`Tests failed: ${result.summary.failed} failures`);
  }

  console.log(`✓ All tests passed: ${result.summary.passed}/${result.summary.total}`);
  return true;
}
```

### POST Usage (Manual Test Trigger)

```typescript
const response = await fetch("/api/test-verification", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_TOKEN",
  },
  body: JSON.stringify({ test: "assets" }),
});

const assetReport = await response.json();
console.log("Asset validation report:", assetReport.data);
```

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] Run `/api/test-verification` and verify all 4 tests pass
- [ ] Check console logs for any `⚠️` or `❌` warnings
- [ ] Verify asset health is "healthy" or "degraded" (not "critical")
- [ ] Test with sample app names containing keywords (app, phone, screenshot)
- [ ] Generate 10 banners in Arabic (ar) and verify scrim + RTL correct
- [ ] Confirm no TypeScript errors: `npx tsc --noEmit`

### Environment Variables

```bash
# Required for test verification in production
TEST_VERIFICATION_TOKEN=your_secret_token_here

# Optional: Change in production
NODE_ENV=production
```

### Remove Test Route Before Production

The test route should be removed or disabled before production:

```typescript
// Option 1: Delete app/api/test-verification/route.ts

// Option 2: Disable route with environment check
if (process.env.NODE_ENV !== "development") {
  return NextResponse.json({ status: "forbidden" }, { status: 403 });
}
```

---

## Troubleshooting

### Asset Validation Shows "critical" Health

**Problem**: `health: "critical"` with missing frames

**Solution**:
```bash
# Create schema asset directories
mkdir -p /public/assets/{minimalist-professional,energetic-tech,organic-health,high-contrast-bold,luxury-premium}

# Add frame.svg files to each directory
# (Use built-in Pixel 9 Pro SVG or custom designs)
```

### Prompt Verification Shows Contaminated

**Problem**: `❌ CONTAMINATED with keywords: app, phone`

**Solution**:
1. Check input validation in route handler
2. Ensure `stripDangerousKeywords()` is called on all user inputs
3. Review Gemini prompt builder for accidental keyword inclusion
4. Check build/compilation — sometimes comments can interfere

### RTL Banner Scrim on Wrong Side

**Problem**: Scrim appears on right instead of left in Arabic

**Solution**:
1. Verify `isRTLLocale("ar")` returns `true`
2. Check `textZoneLeft = rtl ? 0 : BANNER_W - textZoneWidth`
3. Confirm final flop-back is being called: `if (rtl) { composed = composed.flop() }`
4. Test with explicit locale: "ar-SA" or "ar-AE"

### Test Route Returns "forbidden"

**Problem**: `status: 403` when calling `/api/test-verification`

**Solution**:
1. In development: Should work without token
2. In production: Provide token in query param or Authorization header
3. Check environment: `process.env.NODE_ENV === "development"`
4. Check token: Verify `TEST_VERIFICATION_TOKEN` environment variable is set

---

## Monitoring in Production

### What to Monitor

```typescript
// Log asset validation periodically
setInterval(async () => {
  const report = await validateCompositionAssets();
  if (report.health !== "healthy") {
    sendAlert("Asset validation degraded", report.warnings);
  }
}, 1000 * 60 * 60); // Every hour
```

### Expected Metrics

- Asset validation: "healthy" (95%+ of the time)
- Prompt verification: "CLEAN" (100% of generations)
- RTL tests: All Arabic banners with correct scrim positioning
- Crash fallback: 0 crashes on undefined schemaId

### Alerts to Set Up

- Asset validation changes from "healthy" to "critical"
- Prompt verification detects dangerous keywords
- RTL banner generation failures
- Test route responses with status !== "success"

---

## Summary

**4 Production-Grade Systems Implemented:**

✅ **Asset Validation** — Comprehensive diagnostics with health reporting  
✅ **Prompt Verification** — Debug logging for keyword stripping validation  
✅ **Scrim & RTL Polish** — Enhanced composition with detailed logging  
✅ **Test Route** — Automated integration testing endpoint  

**All systems include**:
- Detailed console logging
- Error tracking and warnings
- Production-safe security
- Comprehensive documentation
- Ready for CI/CD integration

**Next steps**:
1. Run `/api/test-verification` 
2. Review console logs
3. Verify all 4 tests pass
4. Deploy with confidence

---
