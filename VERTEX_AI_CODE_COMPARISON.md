# Vertex AI Migration - Code Comparison

Shows exact changes from Google AI Studio to Vertex AI.

---

## SDK Import

### OLD (Google AI Studio)
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
```

### NEW (Vertex AI)
```typescript
import { VertexAI } from "@google-cloud/aiplatform";
```

---

## Client Initialization

### OLD
```typescript
const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
```

### NEW
```typescript
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const REGION = process.env.GOOGLE_CLOUD_REGION || "us-central1";

// Singleton pattern (optional but recommended)
let vertexAIClient: VertexAI | null = null;

function getVertexAIClient(): VertexAI {
  if (!vertexAIClient) {
    vertexAIClient = new VertexAI({
      project: PROJECT_ID,
      location: REGION,
      // Credentials auto-loaded via Application Default Credentials (ADC)
    });
  }
  return vertexAIClient;
}

const vertexAI = getVertexAIClient();
const generativeModel = vertexAI.preview.getGenerativeModel({
  model: "gemini-2.0-flash",
});
```

---

## Model Invocation

### OLD (AI Studio)
```typescript
const response = await model.generateContent(prompt);

const responseText = response.text(); // Simple string extraction
```

### NEW (Vertex AI)
```typescript
const response = await generativeModel.generateContent({
  contents: [
    {
      role: "user",
      parts: [
        {
          text: prompt,
        },
      ],
    },
  ],
  generationConfig: {
    maxOutputTokens: 300,
    temperature: 0.7,
  },
});

// More complex structure extraction
let responseText = "";

if (
  response.response &&
  response.response.candidates &&
  response.response.candidates.length > 0
) {
  const candidate = response.response.candidates[0];
  if (candidate.content && candidate.content.parts) {
    for (const part of candidate.content.parts) {
      if ("text" in part && typeof part.text === "string") {
        responseText = part.text;
        break;
      }
    }
  }
}
```

---

## Error Handling

### OLD (AI Studio)
```typescript
try {
  const response = await model.generateContent(prompt);
  // ...
} catch (error) {
  if (error.message.includes("429")) {
    // Rate limit
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  
  if (error.message.includes("permission")) {
    // Auth error
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  
  throw error; // Generic
}
```

### NEW (Vertex AI)
```typescript
interface VertexAIError extends Error {
  code?: string | number;
  status?: number;
  details?: string;
  message: string;
}

function isRateLimitError(error: unknown): boolean {
  const err = error as VertexAIError;
  if (err.status === 429 || err.code === 429) return true;
  if (err.message?.includes("quota") || err.message?.includes("rate")) return true;
  return false;
}

function isAuthError(error: unknown): boolean {
  const err = error as VertexAIError;
  if (err.status === 401 || err.status === 403) return true;
  if (err.message?.includes("permission") || err.message?.includes("credential")) return true;
  return false;
}

try {
  const response = await generativeModel.generateContent({
    contents: [/* ... */],
  });
  // ...
} catch (error) {
  const err = error as VertexAIError;

  if (isRateLimitError(error)) {
    console.warn(`Rate limited: ${err.message}`);
    return NextResponse.json(
      { error: "Rate Limited", code: "rate_limit" },
      { status: 429 }
    );
  }

  if (isAuthError(error)) {
    console.error(`Auth failed: ${err.message}`);
    return NextResponse.json(
      { error: "Authentication Failed", code: "gcp_auth_failed" },
      { status: 403 }
    );
  }

  if (err.message?.includes("timeout")) {
    return NextResponse.json(
      { error: "Request Timeout", code: "timeout" },
      { status: 504 }
    );
  }

  throw error; // Re-throw unknown errors
}
```

---

## Authentication

### OLD (API Key)
```typescript
// Environment setup
GOOGLE_API_KEY=sk-xxxxx

// Code
const apiKey = process.env.GOOGLE_API_KEY;
const client = new GoogleGenerativeAI(apiKey);
```

**Issue:** API key in environment, potential exposure in logs

### NEW (Application Default Credentials)
```typescript
// Environment setup (for service account)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
GOOGLE_CLOUD_PROJECT_ID=my-project-123

// OR for local dev
gcloud auth application-default login

// Code - credentials auto-detected, no key in code!
const client = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: process.env.GOOGLE_CLOUD_REGION,
  // ADC automatically picks up credentials
});
```

**Benefits:** 
- No API key in environment
- Works across Cloud Run, Cloud Functions, GKE
- Rotates automatically with service accounts
- Audit trail in Cloud Audit Logs

---

## Environment Variables

### OLD
```bash
GOOGLE_API_KEY=sk-xxxxx
```

### NEW
```bash
GOOGLE_CLOUD_PROJECT_ID=my-project-123
GOOGLE_CLOUD_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json  # Optional
```

---

## Response Parsing

### OLD (Simple)
```typescript
const text = response.text();
const charCount = text.length;
```

### NEW (Structured)
```typescript
let text = "";

// Navigate nested structure
if (response.response?.candidates?.[0]?.content?.parts) {
  for (const part of response.response.candidates[0].content.parts) {
    if ("text" in part) {
      text = part.text;
      break;
    }
  }
}

const charCount = text.length;
```

---

## Timeout Handling

### OLD (No built-in timeout)
```typescript
// Had to manually implement timeout with Promise.race
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Timeout")), 30000)
);
const response = await Promise.race([
  model.generateContent(prompt),
  timeoutPromise,
]);
```

### NEW (Built-in AbortController)
```typescript
const abortController = new AbortController();
const timeoutId = setTimeout(
  () => abortController.abort(),
  REQUEST_TIMEOUT_MS
);

try {
  const response = await generativeModel.generateContent({
    contents: [/* ... */],
    // Pass abort signal (SDK support may vary)
  });
} finally {
  clearTimeout(timeoutId);
}
```

---

## Logging

### OLD
```typescript
// Had to log manually
console.log(`Generated: ${text.length} characters`);
await supabase.insert({
  model: "gemini-2.0-flash-ai-studio",
  response: text,
});
```

### NEW
```typescript
// More detailed logging
console.info(
  `[POST /api/ai/generate-response-vertex] Generated response: ${charCount} characters`
);

await supabase.from("ai_generation_log").insert({
  workspace_id: workspaceId,
  item_id: itemId,
  tone,
  language,
  response: text,
  character_count: charCount,
  model: "vertex-ai/gemini-2.0-flash",  // ← New format
  generated_at: new Date().toISOString(),
});
```

---

## Retries & Circuit Breaking

### OLD (Manual implementation needed)
```typescript
async function generateWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

### NEW (Hook provided)
```typescript
// Use the provided hook
import { useVertexAIResponse } from "@/hooks/useVertexAIResponse";

const { generateResponse, isLoading } = useVertexAIResponse({
  maxRetries: 3,
  baseDelayMs: 1000,
  timeout: 30000,
});

// Automatically handles retries, backoff, and timeout
await generateResponse(request);
```

---

## Prompt Structure

### OLD
```typescript
const response = await model.generateContent(prompt);
```

### NEW
```typescript
const response = await generativeModel.generateContent({
  contents: [
    {
      role: "user",
      parts: [
        {
          text: prompt,
        },
      ],
    },
  ],
  generationConfig: {
    maxOutputTokens: 300,
    temperature: 0.7,
  },
});
```

**Note:** Prompt text stays the same - only the envelope changes!

---

## Regional Deployment

### OLD (No region control)
```typescript
// Always hit Google's centralized API
const client = new GoogleGenerativeAI(apiKey);
```

### NEW (Regional optimization)
```typescript
// Choose region closest to your users
const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: "europe-west1", // Deploy EU content in EU region
});
```

---

## Billing Integration

### OLD
```
Google AI Studio Account
├── API Key: sk-xxxxx
├── Prepaid credits: $10.00
└── Quota: 15 RPM (free tier)

Separate bill in Google Cloud account
```

### NEW
```
Google Cloud Project: my-project-123
├── Service Account with Vertex AI permissions
├── Pay-as-you-go: $0.10 per 1M input tokens
├── Quota: 100+ RPM per region
└── Unified with all GCP services

Single bill in GCP Console
```

---

## Migration Checklist - Code Changes

- [ ] Change import from `@google/generative-ai` to `@google-cloud/aiplatform`
- [ ] Update client initialization with project ID and region
- [ ] Change API invocation from `model.generateContent()` to `generativeModel.generateContent({ contents: [...] })`
- [ ] Update response parsing from `response.text()` to navigate `response.response.candidates[0].content.parts`
- [ ] Update error handling with proper Vertex AI error types
- [ ] Add environment variables: `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_REGION`
- [ ] Remove: `GOOGLE_API_KEY`
- [ ] Update logging to use new model format: `vertex-ai/gemini-2.0-flash`
- [ ] Add timeout handling with AbortController
- [ ] Test end-to-end with real data
- [ ] Update documentation and comments
- [ ] Monitor GCP billing for first week

---

## Summary

| Aspect | OLD (AI Studio) | NEW (Vertex AI) |
|--------|---|---|
| **SDK** | @google/generative-ai | @google-cloud/aiplatform |
| **Auth** | API Key | Application Default Credentials |
| **Credentials** | Exposed in env | Secure, auto-rotated |
| **Client Init** | Simple (1 line) | Slightly complex (project + region) |
| **Model Call** | `model.generateContent(prompt)` | `generativeModel.generateContent({ contents: [...] })` |
| **Response Parse** | `response.text()` | Navigate nested structure |
| **Error Types** | Generic strings | Specific error codes |
| **Timeout** | Manual with Promise.race | AbortController |
| **Billing** | Separate account | Unified GCP |
| **Regions** | None | Any GCP region |
| **SLA** | None | 99.5% uptime |

---

## No Breaking Changes For

✅ Prompt logic (identical)  
✅ Tone generation (identical)  
✅ Character limits (identical)  
✅ Language handling (identical)  
✅ API response format (identical)  
✅ Frontend code (no changes needed)  

---

**One endpoint file changed.**  
**Same LLM behavior.**  
**Better production support.**
