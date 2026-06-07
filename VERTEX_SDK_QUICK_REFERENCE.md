# Vertex AI SDK Migration - Quick Reference

**Status:** ✅ Complete  
**Time to Deploy:** 5 minutes  
**Breaking Changes:** None

---

## What Changed

### SDK
```typescript
// OLD
import { GoogleGenerativeAI } from "@google/generative-ai";

// NEW
import { VertexAI } from "@google-cloud/vertexai";
```

### Authentication
```bash
# OLD: API Key
export GOOGLE_API_KEY=sk-xxxxx

# NEW: Application Default Credentials (secure, auto-rotating)
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_REGION=us-central1
gcloud auth application-default login
```

### Client Initialization
```typescript
// OLD
const client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

// NEW
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_REGION,
});
const generativeModel = vertexAI.preview.getGenerativeModel({
  model: "gemini-2.0-flash",
});
```

### Content Generation
```typescript
// OLD
const response = await model.generateContent(prompt);
const text = response.text();

// NEW
const response = await generativeModel.generateContent({
  contents: [{ role: "user", parts: [{ text: prompt }] }],
});
const text = response.response.candidates[0].content.parts[0].text;
```

---

## Installation

```bash
npm install @google-cloud/vertexai
npm uninstall @google/generative-ai  # Optional, can coexist
```

---

## Setup (3 Steps)

### 1. Set Environment Variables
```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_REGION=us-central1
```

### 2. Authenticate
```bash
gcloud auth application-default login
# Opens browser to authenticate
```

### 3. Test
```bash
node test-vertex.js
# Should print: "SUCCESS! Response from Gemini: ..."
```

---

## What Stayed the Same ✅

- ✅ API response format (frontend compatible)
- ✅ Prompt logic and tones
- ✅ Character limits
- ✅ Language context handling
- ✅ Error handling patterns
- ✅ Logging to Supabase

---

## What's Different

| Aspect | Before | After |
|--------|--------|-------|
| **Auth** | API Key | ADC (auto-rotating) |
| **Security** | Key in env | Secure, audited |
| **Initialization** | Simple | Project + Region |
| **Error Details** | Generic | Specific error codes |
| **Response** | Simple `.text()` | Navigate `.response.candidates[0]...` |

---

## Error Handling

```typescript
// New error detection
if (isRateLimitError(error)) { /* 429 */ }
if (isAuthError(error)) { /* 403 */ }
if (isServiceUnavailableError(error)) { /* 503 */ }

// Specific status codes
error.status === 429  // Rate limit
error.status === 403  // Permission denied
error.status === 503  // Service unavailable
```

---

## Testing Your Setup

### Quick Test
```bash
node test-vertex.js
# Checks credentials and model access
```

### API Test
```bash
curl -X POST http://localhost:3000/api/ai/generate-response \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello",
    "workspaceId": "test",
    "itemId": "test",
    "tone": "professional",
    "language": "en"
  }'
```

---

## Environment Variables

```bash
# Required
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_REGION=us-central1

# Optional (ADC auto-detects if not set)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

---

## Troubleshooting

### "GOOGLE_CLOUD_PROJECT not set"
```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
```

### "Authentication failed"
```bash
gcloud auth application-default login
```

### "Permission denied"
- Check service account has `Vertex AI Compute Admin` role
- Go to GCP Console → IAM → Service Accounts

### "Quota exceeded"
- Go to GCP Console → Quotas
- Search "Vertex AI"
- Request quota increase

---

## Files Updated

✅ `app/api/ai/generate-response/route.ts` - Fully refactored  
✅ `test-vertex.js` - New test script  
✅ Documentation - Complete guide  

---

## Rollback (if needed)

```bash
# Takes ~2 minutes
# Restore old endpoint or switch feature flag
USE_VERTEX_AI_SDK=false npm run dev
```

---

## Next Steps

1. ✅ Install SDK: `npm install @google-cloud/vertexai`
2. ✅ Set environment variables
3. ✅ Authenticate: `gcloud auth application-default login`
4. ✅ Test: `node test-vertex.js`
5. ✅ Verify API: Test endpoint with curl
6. ✅ Deploy: No frontend changes needed!

---

## Key Benefits

✅ **Secure Authentication** - Auto-rotating credentials (no API keys)  
✅ **Production Ready** - Enterprise error handling  
✅ **GCP Integrated** - Full Vertex AI feature access  
✅ **Better Quotas** - Per-region quotas with monitoring  
✅ **Zero Breaking Changes** - API response format identical  

---

**Ready to go! Start with `node test-vertex.js`** 🚀
