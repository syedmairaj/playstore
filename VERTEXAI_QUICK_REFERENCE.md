# Vertex AI SDK - Quick Reference Card

**Print this or bookmark for easy access during migration!**

---

## Installation

```bash
npm install @google-cloud/vertexai
```

---

## Basic Usage

```typescript
import { getGenerativeModel } from "@/lib/gemini/vertexai-client";

// Get model (uses ADC internally)
const model = getGenerativeModel("gemini-1.5-flash");

// Generate content
const response = await model.generateContent({
  contents: [
    { role: "user", parts: [{ text: "Hello!" }] }
  ]
});

const text = response.response.text();
```

---

## Available Models

```typescript
import { AVAILABLE_MODELS } from "@/lib/gemini/vertexai-client";

// Flash (fast, cost-effective) ✅ DEFAULT
getGenerativeModel(AVAILABLE_MODELS.FLASH);

// Pro (more powerful)
getGenerativeModel(AVAILABLE_MODELS.PRO);

// Flash 2.0 (latest fast)
getGenerativeModel(AVAILABLE_MODELS.FLASH_2);

// Pro 2.0 (latest powerful)
getGenerativeModel(AVAILABLE_MODELS.PRO_2);
```

---

## Configuration

```typescript
// Project: playstore-496016
// Location: us-central1
// Default Model: gemini-1.5-flash
// Auth: Application Default Credentials (ADC)

import { getVertexAIConfig } from "@/lib/gemini/vertexai-client";

const config = getVertexAIConfig();
console.log(config);
// {
//   project: "playstore-496016",
//   location: "us-central1",
//   defaultModel: "gemini-1.5-flash",
//   availableModels: { FLASH, PRO, FLASH_2, PRO_2 },
//   authMethod: "Application Default Credentials (ADC)"
// }
```

---

## Validate Setup

```typescript
import { validateVertexAISetup } from "@/lib/gemini/vertexai-client";

const validation = await validateVertexAISetup();

if (validation.valid) {
  console.log("✅ Ready!", validation.details);
} else {
  console.error("❌ Error:", validation.message);
}
```

---

## Environment Setup

### Option 1: Service Account JSON
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
```

### Option 2: gcloud CLI
```bash
gcloud auth application-default login
```

### Option 3: Google Cloud (Automatic)
- Cloud Run ✅
- Cloud Functions ✅
- App Engine ✅

---

## Common Patterns

### With System Instruction
```typescript
const model = getGenerativeModel();
model.systemInstruction = "You are helpful...";

const response = await model.generateContent({
  contents: [...]
});
```

### With Structured Output Schema
```typescript
import { SchemaType } from "@google-cloud/vertexai";

const response = await model.generateContent({
  contents: [...],
  generationConfig: {
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        field: { type: SchemaType.STRING }
      },
      required: ["field"]
    },
    responseMimeType: "application/json"
  }
});
```

### With Configuration
```typescript
const response = await model.generateContent({
  contents: [...],
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 4096
  }
});
```

### With Streaming
```typescript
const stream = await model.generateContentStream({
  contents: [...]
});

for await (const chunk of stream.stream) {
  process.stdout.write(chunk.candidates?.[0]?.content?.parts?.[0]?.text || "");
}
```

---

## Error Handling

```typescript
try {
  const response = await model.generateContent({...});
} catch (error) {
  if (error instanceof Error) {
    console.error("Error:", error.message);
    
    // Common errors:
    // "Credentials not found" → Configure ADC
    // "Permission denied" → Add IAM role
    // "Resource not found" → Check project/location
    // "Quota exceeded" → Check usage limits
  }
}
```

---

## Comparison: Before & After

### BEFORE (Legacy)
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const client = new GoogleGenerativeAI({ apiKey });
const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
```

### AFTER (Vertex AI)
```typescript
import { getGenerativeModel } from "@/lib/gemini/vertexai-client";

const model = getGenerativeModel("gemini-1.5-flash");
```

**That's it!** Everything else is identical.

---

## Migration Checklist

### Before Starting
- [ ] `npm install @google-cloud/vertexai`
- [ ] Configure credentials (ADC)
- [ ] Run `validateVertexAISetup()`

### For Each File
- [ ] Update imports
- [ ] Replace client initialization
- [ ] Keep schema definitions (same)
- [ ] Keep generateContent calls (same)
- [ ] Test thoroughly
- [ ] Commit changes

### Deployment
- [ ] TypeScript check: `npx tsc --noEmit`
- [ ] Lint: `npm run lint`
- [ ] Tests: `npm run test`
- [ ] Deploy to staging
- [ ] Monitor logs
- [ ] Deploy to production

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Credentials not found" | Set `GOOGLE_APPLICATION_CREDENTIALS` or run `gcloud auth` |
| "Permission denied" | Add `roles/vertexai.users` to service account |
| "Resource not found" | Check project (playstore-496016) and location (us-central1) |
| "Quota exceeded" | Check Cloud Quotas page |
| Models not working | Verify model is available in us-central1 |

---

## File Locations

| Item | Location |
|------|----------|
| **Client Module** | `src/lib/gemini/vertexai-client.ts` |
| **Migration Guide** | `VERTEXAI_MIGRATION_GUIDE.md` |
| **Example (generate-listing.ts)** | `VERTEXAI_REFACTOR_EXAMPLE_GENERATE_LISTING.md` |
| **Full Summary** | `VERTEXAI_IMPLEMENTATION_SUMMARY.md` |

---

## Quick Links

- [Vertex AI Docs](https://cloud.google.com/vertex-ai/docs)
- [Gemini API](https://ai.google.dev/docs)
- [Node.js SDK](https://github.com/googleapis/nodejs-vertexai)
- [ADC Setup](https://cloud.google.com/docs/authentication/application-default-credentials)

---

## Key Points

✅ No API key needed - uses ADC  
✅ Same generateContent API - minimal changes  
✅ Official Google SDK - better support  
✅ Full GCP integration - billing, monitoring  
✅ Easy migration - gradual, file-by-file  

---

**Project:** playstore-496016  
**Location:** us-central1  
**Default Model:** gemini-1.5-flash  
**Auth:** Application Default Credentials  

**Status:** ✅ Ready to migrate!
