# Vertex AI Migration - Quick Start (5 Minutes)

---

## 1. Install SDK

```bash
npm uninstall @google/generative-ai
npm install @google-cloud/aiplatform
```

---

## 2. Get GCP Project ID

```bash
gcloud config get-value project
# Output: my-project-123

# Or from GCP Console → Dashboard → Project ID
```

---

## 3. Set Environment Variables

```bash
# .env.local or your deployment config
GOOGLE_CLOUD_PROJECT_ID=my-project-123
GOOGLE_CLOUD_REGION=us-central1
```

---

## 4. Authenticate (Choose One)

### Local Development
```bash
gcloud auth application-default login
# Opens browser to authenticate
# Credentials saved automatically
```

### Cloud Run
```bash
# No setup needed!
# Cloud Run automatically uses attached service account
# Just grant service account "Vertex AI Compute Admin" role
```

### Service Account (Manual)
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

---

## 5. Copy Endpoint File

```bash
cp app/api/ai/generate-response-vertex/route.ts app/api/ai/generate-response/route.ts
```

---

## 6. Test It

```bash
curl -X POST http://localhost:3000/api/ai/generate-response \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Say hello",
    "workspaceId": "test",
    "itemId": "test",
    "tone": "professional",
    "language": "en"
  }'

# Should return:
# { "response": "Hello! How can I help you?", "model": "gemini-2.0-flash", ... }
```

---

## 7. Grant GCP Permissions

Go to [GCP Console](https://console.cloud.google.com):

1. **IAM & Admin → Service Accounts**
2. Click your service account
3. **Grant Roles:**
   - `Vertex AI Service User`
   - `Vertex AI Compute Admin`
   - `Compute Engine Instance Admin v1`

---

## Done! ✅

Your app now uses Vertex AI with unified GCP billing.

### What Changed Under the Hood

- Old: Google AI Studio API → Prepaid credits
- New: Vertex AI API → GCP billing

### What Stayed the Same

- ✅ LLM behavior (same model: Gemini 2.0 Flash)
- ✅ Prompt logic (tone, language context)
- ✅ API response format
- ✅ Character limits
- ✅ Error handling

---

## Verify Migration

### Check in GCP Console

1. Go to [Cloud Logging](https://console.cloud.google.com/logs)
2. Search for: `generativelanguage` or `vertex`
3. You should see API calls

### Check Billing

1. Go to [Billing](https://console.cloud.google.com/billing)
2. Look for: `Vertex AI API` line item
3. Cost per request: ~$0.0001-0.0005 (Gemini 2.0 Flash)

---

## Troubleshooting

### "Missing GOOGLE_CLOUD_PROJECT_ID"
```bash
# Set it
export GOOGLE_CLOUD_PROJECT_ID=my-project-123
```

### "Authentication Failed"
```bash
# Test credentials
gcloud auth list
gcloud auth application-default print-access-token

# If fails, login again
gcloud auth application-default login
```

### "Model Not Available"
```bash
# Wrong region? Try us-central1
export GOOGLE_CLOUD_REGION=us-central1
```

### "Quota Exceeded"
```
Go to: GCP Console → Quotas
Search: "Vertex AI"
Request quota increase
```

---

**Time to migrate: 5 minutes**  
**Breaking changes: None**  
**Roll-back time: 2 minutes (just delete .env variables)**
