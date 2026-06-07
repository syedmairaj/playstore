# Refactoring Example: `generate-response/route.ts`

**File:** `app/api/ai/generate-response/route.ts`  
**Current:** Using hardcoded `MODEL_NAME = "gemini-2.0-flash"`  
**After:** Using Model Gateway abstraction  

---

## Current Code (Lines 1-50)

```typescript
/**
 * POST /api/ai/generate-response
 * ...
 */

import { NextResponse } from "next/server";
import { VertexAI } from "@google-cloud/vertexai";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/ai/generate-response";
const CHAR_LIMIT = 280;
const MODEL_NAME = "gemini-2.0-flash";  // ← REMOVE THIS
const REQUEST_TIMEOUT_MS = 30000;
```

---

## Refactored Code (What to Change)

### Step 1: Add Import
```typescript
// ADD THIS LINE at the top (with other imports)
import { getGenerativeModel, logModelUsage } from "@/lib/ai/modelGateway";
```

### Step 2: Remove Hardcoded Model
```typescript
// DELETE this line:
const MODEL_NAME = "gemini-2.0-flash";

// The model is now managed by the gateway, not here
```

### Step 3: Update API Endpoint Code

**Find this section in your POST handler:**

```typescript
// OLD CODE (somewhere around line 138-160)
const vertexAI = getVertexAIClient();

const generativeModel = vertexAI.preview.getGenerativeModel({
  model: MODEL_NAME,  // ← Uses hardcoded constant
});

const response = await generativeModel.generateContent({
  contents: [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ],
  generationConfig: {
    maxOutputTokens: 300,
    temperature: 0.7,
  },
});
```

**Replace with:**

```typescript
// NEW CODE (using gateway)
const startTime = Date.now();

const response = await getGenerativeModel().generateContent({
  model: "gemini-2.5-flash",  // Gateway will use this or override via env
  contents: prompt,
  generationConfig: {
    maxOutputTokens: 300,
    temperature: 0.7,
  },
});

const duration = Date.now() - startTime;

// Optional: Log usage
logModelUsage({
  endpoint: ROUTE,
  modelUsed: "gemini-2.5-flash",
  durationMs: duration,
});
```

---

## Complete Refactored Section

Here's what the full endpoint refactored looks like:

```typescript
/**
 * POST /api/ai/generate-response
 *
 * Generate AI-powered responses to user reviews using Model Gateway
 * (Model selection is now centralized in lib/ai/modelGateway.ts)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getGenerativeModel, logModelUsage } from "@/lib/ai/modelGateway";  // ← NEW

const ROUTE = "POST /api/ai/generate-response";
const CHAR_LIMIT = 280;
const REQUEST_TIMEOUT_MS = 30000;
// MODEL_NAME removed - now in modelGateway

interface GenerateResponseRequest {
  prompt: string;
  workspaceId: string;
  itemId: string;
  tone: "professional" | "empathetic" | "concise";
  language: string;
}

type Ctx = { params?: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Ctx) {
  const startTime = Date.now();

  try {
    // ── Parse Request ──────────────────────────────────────────────────
    const body = (await request.json()) as GenerateResponseRequest;
    const { prompt, workspaceId, itemId, tone, language } = body;

    if (!prompt || !workspaceId || !itemId || !tone || !language) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          code: "validation_error",
          message: "prompt, workspaceId, itemId, tone, language are required",
        },
        { status: 400 }
      );
    }

    // ── Authenticate User ──────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn(`[${ROUTE}] Unauthorized: No user found`);
      return NextResponse.json(
        {
          error: "Unauthorized",
          code: "auth_required",
          message: "You must be logged in",
        },
        { status: 401 }
      );
    }

    // ── Verify Workspace Membership ───────────────────────────────────
    const role = await getWorkspaceRole(supabase, workspaceId, user.id);

    if (!role) {
      console.warn(
        `[${ROUTE}] Forbidden: User ${user.id} not member of workspace ${workspaceId}`
      );
      return NextResponse.json(
        {
          error: "Forbidden",
          code: "not_workspace_member",
          message: "You do not have access to this workspace",
        },
        { status: 403 }
      );
    }

    console.info(
      `[${ROUTE}] Generating response for item ${itemId} (tone: ${tone}, language: ${language})`
    );

    // ── Call AI Model (Using Gateway) ──────────────────────────────────
    const requestStartTime = Date.now();

    const response = await getGenerativeModel().generateContent({
      model: "gemini-2.5-flash",  // ← Gateway will use this
      contents: prompt,
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.7,
      },
    });

    const requestDuration = Date.now() - requestStartTime;

    // ── Extract Response Text ──────────────────────────────────────────
    const responseText = response.text;

    if (!responseText) {
      throw new Error("Empty response from AI model");
    }

    // ── Validate Character Count ──────────────────────────────────────
    const cleanedResponse = responseText.trim();
    const charCount = cleanedResponse.length;

    if (charCount > CHAR_LIMIT) {
      console.warn(
        `[${ROUTE}] Response exceeds character limit: ${charCount}/${CHAR_LIMIT}`
      );
    }

    console.info(
      `[${ROUTE}] Generated response: ${charCount} characters in ${requestDuration}ms`
    );

    // ── Log Usage (Optional) ───────────────────────────────────────────
    logModelUsage({
      endpoint: ROUTE,
      modelUsed: "gemini-2.5-flash",
      durationMs: requestDuration,
    });

    // ── Log to Supabase (Optional) ────────────────────────────────────
    try {
      await supabase.from("ai_generation_log").insert({
        workspace_id: workspaceId,
        item_id: itemId,
        user_id: user.id,
        tone,
        language,
        response: cleanedResponse,
        character_count: charCount,
        model: "gemini-2.5-flash",  // ← Can be updated from gateway too
        generated_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.warn(`[${ROUTE}] Failed to log generation:`, logErr);
    }

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        response: cleanedResponse,
        itemId,
        language,
        tone,
        characterCount: charCount,
        characterLimit: CHAR_LIMIT,
        isWithinLimit: charCount <= CHAR_LIMIT,
        durationMs: duration,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    // ... existing error handling ...
  }
}
```

---

## Key Changes Summary

| What | Old | New |
|-----|-----|-----|
| **Model Definition** | `const MODEL_NAME = "gemini-2.0-flash"` | Removed (in gateway) |
| **Model Access** | `model: MODEL_NAME` | `getGenerativeModel()` |
| **Response Text** | `response.response.candidates[0]...` | `response.text` |
| **Usage Logging** | None | `logModelUsage()` |
| **Model Swapping** | Edit file | Environment variable |

---

## Testing the Refactor

### 1. Verify It Works
```bash
# Test with current model
curl -X POST http://localhost:3000/api/ai/generate-response \
  -H "Content-Type: application/json" \
  -d '{...}'
# Should return 200 with response
```

### 2. Swap Model and Test
```bash
# Test with different model
AI_MODEL_ID=gemini-2.0-flash npm run dev

# Run same curl command
# Should still work, just with different model
```

### 3. Verify No Breaking Changes
```typescript
// Response format should be identical
{
  response: "...",
  itemId: "...",
  language: "...",
  characterCount: 245,
  // etc.
}
```

---

## Benefits of This Refactor

✅ **No Hardcoded Models** - Gateway handles configuration  
✅ **Easy Testing** - Swap models via environment variable  
✅ **Zero Breaking Changes** - Response format identical  
✅ **Credit Ledger Safe** - Business logic untouched  
✅ **Cleaner Code** - Less duplication, single source of truth  

---

## Apply This Pattern To All Files

Once you refactor `generate-response/route.ts`, apply the same pattern to:

- `app/api/market/keyword-spotlight/route.ts`
- `app/api/workspaces/[workspaceId]/competitors/sentiment/route.ts`
- All library functions in `lib/gemini/*`

They all follow the same pattern:
1. Import `getGenerativeModel`
2. Remove hardcoded `MODEL_NAME`
3. Call `getGenerativeModel().generateContent()`
4. Optionally call `logModelUsage()`

---

**Ready to refactor? Start with this file and use it as your template for the rest!** 🚀
