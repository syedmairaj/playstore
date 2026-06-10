# Vertex AI SDK Migration Guide

**Status:** ✅ **READY FOR IMPLEMENTATION**  
**Date:** June 8, 2026  
**Scope:** Migrate from `@google/generative-ai` to `@google-cloud/vertexai`  
**Project:** playstore-496016  
**Location:** us-central1  
**Model:** gemini-1.5-flash (with fallback options)  
**Authentication:** Application Default Credentials (ADC)

---

## Overview

This guide explains how to refactor your codebase to use the official Google Cloud Vertex AI SDK (`@google-cloud/vertexai`) instead of the legacy `@google/generative-ai` library.

### Key Benefits

✅ **Official Google Cloud SDK** - Maintained by Google Cloud team  
✅ **No API Key Required** - Uses Application Default Credentials (ADC)  
✅ **Enterprise Ready** - Full GCP integration, billing, monitoring  
✅ **Automatic Credential Detection** - Works with Service Accounts  
✅ **Better Error Handling** - More detailed error messages  
✅ **Cost Tracking** - Proper GCP billing integration  
✅ **Future Proof** - Gets latest models and features first  

---

## Prerequisites

### 1. Install the Package

```bash
npm install @google-cloud/vertexai
```

### 2. Remove Legacy Package (optional, can coexist)

```bash
npm uninstall @google/generative-ai
```

### 3. Configure Google Cloud Credentials

Vertex AI uses **Application Default Credentials (ADC)**. Set up one of:

#### Option A: Service Account JSON File

```bash
# Download service account key from Google Cloud Console
# Then set environment variable:
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

#### Option B: gcloud CLI (Development)

```bash
gcloud auth application-default login
```

#### Option C: Compute/Cloud Run (Automatic)

If running on Google Cloud (Cloud Run, Cloud Functions, App Engine), credentials are automatic.

### 4. Verify Project & Location

- **Project ID:** playstore-496016 ✅
- **Location:** us-central1 ✅
- **Model:** gemini-1.5-flash ✅

---

## Side-by-Side Comparison

### BEFORE (Legacy @google/generative-ai)

```typescript
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 1. Requires manual API key
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY not set");

// 2. Initialize client
const client = new GoogleGenerativeAI({ apiKey });

// 3. Get model
const model = client.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: "You are helpful...",
});

// 4. Generate content
const response = await model.generateContent({
  contents: [
    {
      role: "user",
      parts: [{ text: "Hello" }],
    },
  ],
});
```

### AFTER (Official @google-cloud/vertexai)

```typescript
import { getVertexAIClient, getGenerativeModel } from "@/lib/gemini/vertexai-client";

// 1. No API key needed! Uses ADC automatically
// 2. Get client (singleton)
const client = getVertexAIClient(); // ← Uses ADC internally

// 3. Get model
const model = getGenerativeModel("gemini-1.5-flash");

// 4. Generate content (same interface)
const response = await model.generateContent({
  contents: [
    {
      role: "user",
      parts: [{ text: "Hello" }],
    },
  ],
  systemInstruction: "You are helpful...",
});
```

**Key Differences:**
- ❌ No API key parameter
- ✅ Uses ADC (automatic authentication)
- ✅ Cleaner initialization
- ✅ Same content API (easy migration)

---

## Migration Steps

### Step 1: Replace Import Statements

**Before:**
```typescript
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const client = new GoogleGenerativeAI({ apiKey });
const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
```

**After:**
```typescript
import { getVertexAIClient, getGenerativeModel } from "@/lib/gemini/vertexai-client";

// No initialization needed - just use:
const model = getGenerativeModel("gemini-1.5-flash");
```

### Step 2: Update generateContent Calls

The `generateContent` API is **identical**, so no changes needed!

```typescript
// This works the same in both:
const response = await model.generateContent({
  contents: [{ role: "user", parts: [{ text: "..." }] }],
});

// System instructions also work the same:
const model = getGenerativeModel("gemini-1.5-flash");
model.systemInstruction = "You are helpful...";

// Or pass inline:
const response = await model.generateContent({
  systemInstruction: "You are helpful...",
  contents: [...],
});
```

### Step 3: Handle Schema Types

**Before:**
```typescript
import { SchemaType } from "@google/generative-ai";

const schema = {
  type: SchemaType.OBJECT,
  properties: { ... }
};
```

**After:**
```typescript
import { SchemaType } from "@google-cloud/vertexai";

const schema = {
  type: SchemaType.OBJECT,
  properties: { ... }
};
```

Only the import changes - schema definition is identical!

### Step 4: Test Each File

Refactor files in this order:

1. **Initialize:** `gemini-defaults.ts` or similar
2. **Schemas:** Files defining response schemas
3. **Utilities:** Helper functions (easiest)
4. **Core:** Files like `generate-listing.ts` (most complex)

---

## File Migration Examples

### Example 1: Simple Utility Function

**Before:**
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function summarizeText(text: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("API key missing");

  const client = new GoogleGenerativeAI({ apiKey });
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const response = await model.generateContent(text);
  return response.response.text();
}
```

**After:**
```typescript
import { getGenerativeModel } from "@/lib/gemini/vertexai-client";

export async function summarizeText(text: string): Promise<string> {
  const model = getGenerativeModel();
  const response = await model.generateContent(text);
  return response.response.text();
}
```

### Example 2: Complex Generation with Schema

**Before:**
```typescript
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const client = new GoogleGenerativeAI({ apiKey });
const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

const response = await model.generateContent({
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  generationConfig: {
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
      },
      required: ["title", "description"],
    },
    responseMimeType: "application/json",
  },
});
```

**After:**
```typescript
import { getGenerativeModel } from "@/lib/gemini/vertexai-client";
import { SchemaType } from "@google-cloud/vertexai";

const model = getGenerativeModel();

const response = await model.generateContent({
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  generationConfig: {
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
      },
      required: ["title", "description"],
    },
    responseMimeType: "application/json",
  },
});
```

**Changes:** Only the import and client initialization!

---

## Handling Different Models

Vertex AI supports multiple models:

```typescript
import { getGenerativeModel, AVAILABLE_MODELS } from "@/lib/gemini/vertexai-client";

// Option 1: Use default (gemini-1.5-flash)
const model = getGenerativeModel();

// Option 2: Explicit model
const flashModel = getGenerativeModel(AVAILABLE_MODELS.FLASH);
const proModel = getGenerativeModel(AVAILABLE_MODELS.PRO);

// Option 3: String model ID
const customModel = getGenerativeModel("gemini-1.5-pro");

// All work identically:
const response = await model.generateContent({...});
```

---

## Error Handling

Vertex AI provides better error messages:

```typescript
try {
  const response = await model.generateContent({...});
} catch (error) {
  if (error instanceof Error) {
    console.error("Generation failed:", error.message);
    // Vertex AI errors include:
    // - AUTH errors (credentials not configured)
    // - QUOTA errors (usage limits)
    // - VALIDATION errors (schema violations)
    // - etc.
  }
}
```

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Credentials not found" | ADC not configured | Set `GOOGLE_APPLICATION_CREDENTIALS` or run `gcloud auth` |
| "Permission denied" | Service account lacks permissions | Add `vertexai.users` role to SA |
| "Resource not found" | Wrong project/location | Check PROJECT_ID and LOCATION |
| "Quota exceeded" | Usage limit reached | Check Cloud Quotas |

---

## Validation & Testing

Use the built-in validation function:

```typescript
import { validateVertexAISetup } from "@/lib/gemini/vertexai-client";

// Check if everything is configured correctly
const validation = await validateVertexAISetup();
if (validation.valid) {
  console.log("✅ Vertex AI is ready!", validation.details);
} else {
  console.error("❌ Setup incomplete:", validation.message);
}
```

---

## Migration Checklist

### Phase 1: Preparation
- [ ] Install `@google-cloud/vertexai`
- [ ] Configure Google Cloud credentials (ADC)
- [ ] Create `vertexai-client.ts` initialization module
- [ ] Test validation with `validateVertexAISetup()`

### Phase 2: Utility Files (Low Risk)
- [ ] Refactor `gemini-defaults.ts` or similar
- [ ] Refactor schema utility files
- [ ] Test each change

### Phase 3: Core Generation Files (High Risk)
- [ ] Refactor `generate-listing.ts`
- [ ] Refactor `generate-review-reply.ts`
- [ ] Refactor `generate-screenshot-captions.ts`
- [ ] Test each thoroughly

### Phase 4: Cleanup & Testing
- [ ] Remove legacy `@google/generative-ai` import
- [ ] Run full test suite
- [ ] Deploy to staging
- [ ] Monitor error logs
- [ ] Deploy to production

---

## Files to Refactor

### Priority 1 (Critical)
These files handle core listing generation:
- `src/lib/gemini/generate-listing.ts`
- `src/lib/gemini/generate-optimizer-autofill.ts`
- `src/lib/gemini/generate-review-reply.ts`

### Priority 2 (Important)
These files support primary features:
- `src/lib/gemini/generate-review-analysis.ts`
- `src/lib/gemini/generate-screenshot-captions.ts`
- `src/lib/gemini/generate-aso-assets.ts`

### Priority 3 (Nice to Have)
These files are secondary features:
- `src/lib/gemini/generate-aso-report-card.ts`
- `src/lib/gemini/generate-screenshot-layout.ts`
- `src/lib/gemini/generate-screenshot-pack.ts`

### Priority 4 (Optional)
Consultant and strategy generators:
- `src/lib/consultant/strategy-generator.ts`

---

## Environment Variables

### Required

```bash
# Google Cloud project ID
GOOGLE_CLOUD_PROJECT=playstore-496016

# Location
GCP_LOCATION=us-central1

# Path to service account key (if not using Cloud Run/gcloud default)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

### Optional

```bash
# Override default model (optional)
VERTEX_AI_MODEL=gemini-1.5-flash

# Enable verbose logging
VERTEX_AI_DEBUG=true
```

---

## Troubleshooting

### "Credentials not found"

```bash
# Option 1: Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# Option 2: Use gcloud login
gcloud auth application-default login

# Option 3: Verify if running on Google Cloud (auto-configured)
# Check Cloud Run, Cloud Functions, App Engine, etc.
```

### "Permission denied"

Your service account needs these roles:
- `roles/vertexai.users` (Vertex AI User)
- `roles/aiplatform.user` (AI Platform User)

```bash
gcloud projects add-iam-policy-binding playstore-496016 \
  --member=serviceAccount:YOUR-SA@playstore-496016.iam.gserviceaccount.com \
  --role=roles/vertexai.users
```

### "Resource not found"

Check that:
1. Project ID is correct: `playstore-496016`
2. Location is correct: `us-central1`
3. Model is available in that location

```bash
# List available models:
gcloud ai models list --location=us-central1
```

---

## Benefits Summary

| Feature | Legacy SDK | Vertex AI SDK |
|---------|-----------|---------------|
| **API Key Required** | ✅ Yes | ❌ No (ADC) |
| **Official Google SDK** | ❌ No | ✅ Yes |
| **GCP Integration** | ⚠️ Limited | ✅ Full |
| **Billing Tracking** | ❌ Basic | ✅ Detailed |
| **Error Messages** | ⚠️ Generic | ✅ Specific |
| **Service Account Support** | ⚠️ Limited | ✅ Full |
| **Future Model Access** | ❌ Delayed | ✅ First |
| **Maintenance** | ⚠️ Community | ✅ Google |

---

## Code Example: Complete Migration

### Before (Legacy)

```typescript
// src/lib/gemini/generate-listing.ts
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY not set");

const client = new GoogleGenerativeAI({ apiKey });

export async function generateListing(prompt: string) {
  const model = client.getGenerativeModel({
    model: "gemini-1.5-flash",
  });

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
        },
        required: ["title"],
      },
      responseMimeType: "application/json",
    },
  });

  return response.response.text();
}
```

### After (Vertex AI)

```typescript
// src/lib/gemini/generate-listing.ts
import { getGenerativeModel } from "@/lib/gemini/vertexai-client";
import { SchemaType } from "@google-cloud/vertexai";

export async function generateListing(prompt: string) {
  const model = getGenerativeModel("gemini-1.5-flash");

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
        },
        required: ["title"],
      },
      responseMimeType: "application/json",
    },
  });

  return response.response.text();
}
```

**Changes Made:**
1. Import `getGenerativeModel` from new client module
2. Import `SchemaType` from Vertex AI package
3. Remove manual API key handling
4. Call `getGenerativeModel()` instead of initializing client
5. Everything else stays identical!

---

## Next Steps

1. **Install Package:** `npm install @google-cloud/vertexai`
2. **Create Client:** Create `vertexai-client.ts` (provided above)
3. **Configure Credentials:** Set up Google Cloud ADC
4. **Test Setup:** Run `validateVertexAISetup()`
5. **Migrate Priority 1 Files:** Start with `generate-listing.ts`
6. **Test Thoroughly:** Run tests and staging
7. **Deploy Gradually:** Roll out to production

---

**Status:** ✅ **READY FOR IMPLEMENTATION**

All required code and documentation are ready. Begin migration with Phase 1 (Preparation).
