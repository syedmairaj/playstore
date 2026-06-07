# Google AI Studio → Vertex AI Migration Guide

**Date:** 2026-06-05  
**Status:** Production Ready  
**Scope:** Complete migration from Google AI Studio to Vertex AI with GCP billing

---

## Overview

This guide walks you through migrating from the `google-generativeai` (AI Studio) SDK to `@google-cloud/aiplatform` (Vertex AI) for unified GCP billing and better production support.

### Why Migrate?

✅ **Unified Billing** - Single GCP project bill instead of separate AI Studio account  
✅ **Better Production Support** - Enterprise-grade SLAs and support  
✅ **Quota Management** - Consistent quota across all GCP services  
✅ **Cost Control** - Detailed billing per project and region  
✅ **Credentials** - Uses Application Default Credentials (ADC) for secure auth  
✅ **Regional Deployment** - Better latency with regional endpoints  

---

## What's Changing

### SDK Change
```typescript
// OLD: Google AI Studio SDK
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(API_KEY);

// NEW: Vertex AI SDK
import { VertexAI } from "@google-cloud/aiplatform";
const vertexAI = new VertexAI({ project, location });
```

### Authentication
```typescript
// OLD: API Key
const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// NEW: Application Default Credentials
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: process.env.GOOGLE_CLOUD_REGION,
  // Credentials auto-loaded from ADC
});
```

### Model Invocation
```typescript
// OLD: AI Studio
const response = await model.generateContent(prompt);

// NEW: Vertex AI
const generativeModel = vertexAI.preview.getGenerativeModel({
  model: "gemini-2.0-flash",
});
const response = await generativeModel.generateContent({
  contents: [{ role: "user", parts: [{ text: prompt }] }],
});
```

---

## Step-by-Step Migration

### Step 1: Install Vertex AI SDK

```bash
# Uninstall old SDK
npm uninstall @google/generative-ai

# Install Vertex AI SDK
npm install @google-cloud/aiplatform
```

### Step 2: Set Up GCP Credentials

Choose one option:

#### Option A: Service Account (Recommended for Cloud Run)

1. Go to [GCP Console](https://console.cloud.google.com)
2. Navigate to **IAM & Admin → Service Accounts**
3. Create a new service account named `app-ai-service`
4. Grant roles:
   - `Vertex AI Compute Admin` (for model access)
   - `Compute Engine Instance Admin v1` (for resource management)
5. Create a key (JSON) and download it
6. Set environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```

#### Option B: Workload Identity (Cloud Run, GKE)

1. Enable Workload Identity on your cluster
2. Create service account
3. Grant permissions
4. Bind Kubernetes service account to GCP service account

**ADC will automatically pick up credentials!**

### Step 3: Update Environment Variables

```env
# New variables
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_REGION=us-central1  # or your preferred region

# Remove old variable
# GOOGLE_API_KEY=...  (delete this)

# ADC will automatically find credentials if:
# 1. GOOGLE_APPLICATION_CREDENTIALS is set, OR
# 2. Running on Cloud Run/Cloud Functions/GKE with Workload Identity
```

### Step 4: Update API Endpoint

Replace your existing `/api/ai/generate-response/route.ts` with the new Vertex AI version:

```bash
# Rename or replace your endpoint
cp app/api/ai/generate-response-vertex/route.ts app/api/ai/generate-response/route.ts
```

### Step 5: Update Frontend Code

If using the new hook (optional):

```typescript
// OLD: Using fetch directly
await fetch("/api/ai/generate-response", { ... });

// NEW: Using hook
import { useVertexAIResponse } from "@/hooks/useVertexAIResponse";
const { generateResponse, isLoading } = useVertexAIResponse();
await generateResponse(request);
```

### Step 6: Test Migration

```bash
# 1. Set environment variables
export GOOGLE_CLOUD_PROJECT_ID=your-project-id
export GOOGLE_CLOUD_REGION=us-central1

# 2. Start dev server
npm run dev

# 3. Test endpoint
curl -X POST http://localhost:3000/api/ai/generate-response \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test prompt",
    "workspaceId": "test-workspace",
    "itemId": "test-item",
    "tone": "professional",
    "language": "en"
  }'

# Should return: { response: "...", characterCount: ..., model: "gemini-2.0-flash", ... }
```

---

## Vertex AI Configuration

### Supported Regions

```
us-central1      (default)
us-east1
us-west1
europe-west1
asia-northeast1
asia-southeast1
```

Use closest region to your app:
```bash
export GOOGLE_CLOUD_REGION=europe-west1  # For EU deployment
```

### Supported Models

```
gemini-2.0-flash          (Latest, fastest)
gemini-1.5-flash
gemini-1.5-pro
```

All support the same API, Vertex AI handles routing.

---

## Application Default Credentials (ADC)

ADC automatically finds credentials in this order:

1. **GOOGLE_APPLICATION_CREDENTIALS** environment variable
2. **Gcloud CLI** credentials (`gcloud auth application-default login`)
3. **Cloud Run** attached service account
4. **Cloud Functions** attached service account
5. **GKE Workload Identity** bound service account
6. **Compute Engine** attached service account

**For local development:**
```bash
gcloud auth application-default login
# Opens browser to authenticate
# Saves credentials to ~/.config/gcloud/application_default_credentials.json
```

**For production (Cloud Run):**
```bash
# No setup needed! Cloud Run automatically uses attached service account
# Just grant the service account Vertex AI permissions
```

---

## Error Handling Comparison

### Rate Limiting (429)

```typescript
// OLD: Google AI Studio
if (error.message.includes("429")) { ... }

// NEW: Vertex AI
if (error.status === 429 || error.code === 429) { ... }
```

### Authentication (403)

```typescript
// OLD
if (error.message.includes("permission")) { ... }

// NEW
function isAuthError(error) {
  return error.status === 403 || 
         error.message?.includes("permission");
}
```

### Quota Exceeded

```typescript
// Handled the same way, but message is clearer:
"Vertex AI quota exceeded. Please check your GCP billing."
```

---

## Billing Comparison

### Before (AI Studio)

```
Google AI Studio Account (separate billing)
├── API Key: sk-xxxxx
├── Prepaid Credits
└── Quota: 15 requests per minute (free tier)

Monthly Bill: AI Studio console
```

### After (Vertex AI)

```
Google Cloud Project: my-project-123
├── Vertex AI → Generative AI API
├── Service Account with permissions
├── Quota: 100+ requests per minute (per region)
└── Automatic billing rollup

Monthly Bill: GCP console (unified with other services)
```

### Cost Example

```
Gemini 2.0 Flash (Vertex AI):
- Input: $0.10 per 1M tokens
- Output: $0.40 per 1M tokens

1000 requests × 500 input tokens × 150 output tokens
= 500M input tokens → $50
= 150M output tokens → $60
Total: ~$110/month

(vs. AI Studio prepaid credits system)
```

---

## Troubleshooting

### Error: "Missing GOOGLE_CLOUD_PROJECT_ID"

**Solution:** Set environment variable
```bash
export GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

### Error: "Failed to authenticate with Vertex AI"

**Checklist:**
1. Is `GOOGLE_APPLICATION_CREDENTIALS` set or using gcloud CLI?
2. Does service account have `Vertex AI Compute Admin` role?
3. Is the project ID correct?
4. Are you in the right GCP project?

```bash
# Verify current project
gcloud config get-value project

# Set correct project
gcloud config set project your-project-id
```

### Error: "Quota Exceeded (429)"

**Solution:**
1. Go to [GCP Console → Quotas](https://console.cloud.google.com/quotas)
2. Search for "Vertex AI"
3. Check regional quotas
4. Request quota increase if needed
5. Check billing account is active

### Error: "Model not found"

**Solution:**
1. Vertex AI models are region-specific
2. Check model availability in your region:
   ```
   us-central1: ✅ gemini-2.0-flash
   europe-west1: ✅ gemini-2.0-flash
   asia-northeast1: ✅ gemini-2.0-flash
   ```
3. If region doesn't support model, use `us-central1`

### Timeout Errors

**Solution:** Increase timeout in environment or code
```typescript
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds
// Increase if needed for slow regions
```

---

## Monitoring & Logging

### GCP Logging

Vertex AI logs to Cloud Logging. View in GCP Console:

```
Cloud Logging → Logs Explorer
Filter: resource.type="api"
Search: "Vertex AI" or "generativelanguage"
```

### Custom Logging

The migration keeps your existing logging:

```typescript
// Your Supabase logging still works
await supabase.from("ai_generation_log").insert({
  model: "vertex-ai/gemini-2.0-flash", // ← Updated model string
  workspace_id: workspaceId,
  item_id: itemId,
  response: cleanedResponse,
  generated_at: new Date().toISOString(),
});
```

### Metrics to Monitor

```typescript
{
  durationMs: 1234,          // Response time
  characterCount: 245,       // Output length
  isWithinLimit: true,       // App store compliance
  provider: "vertex-ai",     // Service tracking
}
```

---

## Rollback Plan

If something goes wrong:

1. **Keep old endpoint working temporarily:**
   ```bash
   # Old endpoint
   app/api/ai/generate-response/route.ts (keep this)
   
   # New endpoint
   app/api/ai/generate-response-vertex/route.ts (test this first)
   ```

2. **Switch gradually:**
   ```typescript
   // Use feature flag
   const useVertexAI = process.env.USE_VERTEX_AI === "true";
   const endpoint = useVertexAI 
     ? "/api/ai/generate-response-vertex" 
     : "/api/ai/generate-response";
   ```

3. **Rollback quickly:**
   ```bash
   # If Vertex AI fails, switch flag to false
   USE_VERTEX_AI=false npm run dev
   ```

---

## Migration Checklist

### Pre-Migration
- [ ] GCP project created with billing enabled
- [ ] Vertex AI API enabled in GCP Console
- [ ] Service account created with Vertex AI permissions
- [ ] Credentials file or Workload Identity configured
- [ ] Environment variables set

### During Migration
- [ ] SDK installed: `npm install @google-cloud/aiplatform`
- [ ] Old SDK uninstalled: `npm uninstall @google/generative-ai`
- [ ] Endpoint copied: `route.ts` updated
- [ ] Environment variables configured
- [ ] Tests run successfully

### Post-Migration
- [ ] Endpoint tested with curl
- [ ] App tested end-to-end
- [ ] Logging verified in GCP Console
- [ ] Quota monitoring enabled
- [ ] Billing alerts configured
- [ ] Old API key deleted from GCP Console

### Monitoring (First Week)
- [ ] Error rates normal (<1%)
- [ ] Response times acceptable (<5s)
- [ ] Quota usage tracking
- [ ] Cost per request reasonable

---

## FAQ

### Q: Do I need to change my prompts?
**A:** No. The logic is identical. Only the transport layer changes.

### Q: Will response quality change?
**A:** No. `gemini-2.0-flash` in Vertex AI is the same model as AI Studio.

### Q: Can I use both endpoints during migration?
**A:** Yes! Use feature flags to gradually migrate traffic:
```typescript
const useVertexAI = Math.random() < 0.1; // 10% traffic
```

### Q: How do I monitor costs?
**A:** GCP Console → Billing → Line Items
Filter by: `Vertex AI → Generative AI API`

### Q: What's the SLA?
**A:** Vertex AI: 99.5% uptime SLA (production)

### Q: Can I use different regions?
**A:** Yes! Set `GOOGLE_CLOUD_REGION` to any supported region for latency optimization.

### Q: Do I need to change my frontend code?
**A:** No. The API contract is identical. Optional: use new `useVertexAIResponse` hook for better error handling.

---

## Additional Resources

- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Gemini API Reference](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini-api)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)
- [GCP Quotas](https://cloud.google.com/docs/quotas)

---

## Support

If you encounter issues:

1. Check logs: `GCP Console → Cloud Logging`
2. Verify credentials: `gcloud auth list`
3. Test quota: `GCP Console → Quotas`
4. Review checklist above

**You're now using production-grade Vertex AI! 🚀**
