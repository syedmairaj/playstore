# 🔍 StageButton Error Debugging Guide

**Issue:** Getting `[StageButton] API Error: {}` with empty error object  
**Status:** ✅ FIXED - Enhanced error diagnostics

---

## What Was Wrong

The error handler wasn't properly reading the response when it failed:

```typescript
// ❌ OLD - Would silently fail and log empty object
const error = await response.json().catch(() => ({}));
const errorCode = error.error?.code || "unknown";  // Always "unknown"
const errorMessage = error.error?.message || ...    // Empty
```

Result: `console.error("[StageButton] API Error:", {})` — no useful info

---

## What's Fixed

### Enhanced Error Parsing

```typescript
// ✅ NEW - Properly handles all response types
let errorData: any = {};
const contentType = response.headers.get("content-type");

try {
  if (contentType?.includes("application/json")) {
    errorData = await response.json();
  } else {
    const text = await response.text();
    console.warn("[StageButton] Response is not JSON:", text);
    errorData = { message: text };
  }
} catch (parseError) {
  console.warn("[StageButton] Failed to parse response:", parseError);
}

const errorCode = errorData?.error?.code || errorData?.code || "unknown";
const errorMessage =
  errorData?.error?.message ||
  errorData?.message ||
  `HTTP ${response.status}`;

console.error("[StageButton] API Error:", {
  status: response.status,
  statusText: response.statusText,           // ✅ NEW
  code: errorCode,
  message: errorMessage,
  contentType,                               // ✅ NEW
  rawResponse: errorData,                    // ✅ NEW
});
```

Now you'll see:

```javascript
[StageButton] API Error: {
  status: 403,
  statusText: "Forbidden",                   // ← NEW helpful info
  code: "forbidden",
  message: "Not a workspace member",
  contentType: "application/json; charset=utf-8",
  rawResponse: {                             // ← NEW full response
    ok: false,
    error: {
      code: "forbidden",
      message: "Not a workspace member"
    }
  }
}
```

---

## Enhanced Debug Logging

### Request Logging (Before API call)

```typescript
console.info("[StageButton] Staging signal:", {
  url: "/api/workspaces/550e8400-.../staging/add",  // ✅ NEW
  workspaceId: "550e8400-...",
  signalType: "competitor_weakness",
  source: "competitor_spy",
  sourceContext: "competitor_weakness",             // ✅ NEW
  sourceContextId: "com.example.app",               // ✅ NEW
  language: "en"
});
```

### Success Logging

```javascript
[StageButton] Signal staged successfully: {
  signalType: "competitor_weakness"
}
```

---

## Error Scenarios - What You'll See Now

### Scenario 1: Not Signed In (401)

**Browser Console:**
```javascript
[StageButton] Staging signal: {
  url: "/api/workspaces/550e8400-.../staging/add",
  workspaceId: "550e8400-...",
  signalType: "keyword",
  source: "keyword_tracker",
  sourceContext: "keyword_tracker_alert",
  sourceContextId: "fitness tracker_US",
  language: "en"
}

[StageButton] API Error: {
  status: 401,
  statusText: "Unauthorized",
  code: "unauthorized",
  message: "Sign in required",
  contentType: "application/json; charset=utf-8",
  rawResponse: {
    ok: false,
    error: {
      code: "unauthorized",
      message: "Sign in required"
    }
  }
}

[StageButton] Staging failed: You must be signed in to stage signals
```

**User sees:** Error toast: "Failed to Stage" → "You must be signed in to stage signals"

---

### Scenario 2: Not Workspace Member (403)

**Browser Console:**
```javascript
[StageButton] Staging signal: {
  url: "/api/workspaces/550e8400-.../staging/add",
  workspaceId: "550e8400-...",
  signalType: "review_issue",
  source: "review_analysis",
  sourceContext: "common_issues_theme",
  sourceContextId: "issue-123",
  language: "en"
}

[StageButton] API Error: {
  status: 403,
  statusText: "Forbidden",
  code: "forbidden",
  message: "Not a workspace member",
  contentType: "application/json; charset=utf-8",
  rawResponse: {
    ok: false,
    error: {
      code: "forbidden",
      message: "Not a workspace member"
    }
  }
}

[StageButton] Staging failed: You are not a member of this workspace
```

**User sees:** Error toast: "Failed to Stage" → "You are not a member of this workspace"

---

### Scenario 3: Invalid Data (422)

**Browser Console:**
```javascript
[StageButton] Staging signal: {
  url: "/api/workspaces/550e8400-.../staging/add",
  workspaceId: "550e8400-...",
  signalType: "unknown_type",  // ← Invalid enum
  source: "keyword_tracker",
  sourceContext: "keyword_tracker_alert",
  sourceContextId: "fitness tracker_US",
  language: "en"
}

[StageButton] API Error: {
  status: 422,
  statusText: "Unprocessable Entity",
  code: "validation",
  message: "Invalid enum value. Expected 'keyword' | 'review_issue' | 'competitor_weakness' | 'optimization_insight'",
  contentType: "application/json; charset=utf-8",
  rawResponse: {
    ok: false,
    error: {
      code: "validation",
      message: "Invalid enum value..."
    }
  }
}

[StageButton] Staging failed: Invalid data: Invalid enum value...
```

**User sees:** Error toast: "Failed to Stage" → "Invalid data: ..."

---

### Scenario 4: Server Error (500)

**Browser Console:**
```javascript
[StageButton] Staging signal: {
  url: "/api/workspaces/550e8400-.../staging/add",
  workspaceId: "550e8400-...",
  signalType: "keyword",
  source: "keyword_spotlight",
  sourceContext: "keyword_spotlight",
  sourceContextId: "Health & Fitness",
  language: "en"
}

[StageButton] API Error: {
  status: 500,
  statusText: "Internal Server Error",
  code: "staging_error",
  message: "Database connection failed",
  contentType: "application/json; charset=utf-8",
  rawResponse: {
    ok: false,
    error: {
      code: "staging_error",
      message: "Database connection failed"
    }
  }
}

[StageButton] Staging failed: Failed to stage: Database connection failed
```

**User sees:** Error toast: "Failed to Stage" → "Failed to stage: Database connection failed"

---

### Scenario 5: Malformed Response

**Browser Console:**
```javascript
[StageButton] Staging signal: {
  url: "/api/workspaces/550e8400-.../staging/add",
  // ...
}

[StageButton] Response is not JSON: "<html><body>502 Bad Gateway</body></html>"

[StageButton] API Error: {
  status: 502,
  statusText: "Bad Gateway",
  code: "unknown",
  message: "<html><body>502 Bad Gateway</body></html>",
  contentType: "text/html; charset=utf-8",
  rawResponse: {
    message: "<html><body>502 Bad Gateway</body></html>"
  }
}

[StageButton] Staging failed: Failed to stage: <html><body>502 Bad Gateway</body></html>
```

**User sees:** Error toast: "Failed to Stage" → "Failed to stage: <html><body>502 Bad Gateway</body></html>"

---

## Debugging Checklist

When you see an error in the console, follow this checklist:

### 1. Check Status Code
```javascript
// From console output:
status: 403  // ← Look at this first
```

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Not signed in | User needs to login |
| 403 | Not workspace member | User needs to be added to workspace |
| 422 | Invalid data | Check payload matches schema |
| 500 | Server error | Check server logs |
| 502/503 | Gateway error | Check infrastructure |

### 2. Check Error Code
```javascript
code: "forbidden"  // ← More specific than status
```

Use this to understand exactly what failed at the API level.

### 3. Check Error Message
```javascript
message: "Not a workspace member"  // ← Human-readable explanation
```

This should clearly explain why it failed.

### 4. Check Raw Response
```javascript
rawResponse: { ok: false, error: { ... } }  // ← Full API response
```

If everything else is unclear, this shows exactly what the API returned.

### 5. Check Content Type
```javascript
contentType: "application/json; charset=utf-8"  // ← Should always be JSON for our API
```

If not JSON, the API endpoint isn't working correctly.

---

## API Response Format

The endpoint (`/api/workspaces/[workspaceId]/staging/add`) always returns one of these:

### Success (2xx)
```json
{
  "ok": true,
  "data": {
    "id": "signal-uuid",
    "message": "Signal added"
  }
}
```

### Unauthorized (401)
```json
{
  "ok": false,
  "error": {
    "code": "unauthorized",
    "message": "Sign in required"
  }
}
```

### Forbidden (403)
```json
{
  "ok": false,
  "error": {
    "code": "forbidden",
    "message": "Not a workspace member"
  }
}
```

### Validation Error (422)
```json
{
  "ok": false,
  "error": {
    "code": "validation",
    "message": "Invalid request"
  }
}
```

### Server Error (500)
```json
{
  "ok": false,
  "error": {
    "code": "staging_error",
    "message": "Database connection failed"
  }
}
```

---

## Required Payload Schema

When staging a signal, StageButton sends this payload:

```typescript
{
  // REQUIRED - Must be one of these enum values
  signalType: "keyword" | "review_issue" | "competitor_weakness" | "optimization_insight",
  
  // REQUIRED - 1-5000 characters
  content: "The actual signal content",
  
  // OPTIONAL but recommended - Source module
  source: "keyword_spotlight" | "keyword_tracker" | "review_analysis" | "competitor_spy" | "manual" | "api",
  
  // OPTIONAL - UUID of source app
  sourceAppId: "app-uuid-here",
  
  // OPTIONAL but HIGHLY RECOMMENDED - Context type
  sourceContext: "common_issues_theme" | "keyword_tracker_alert" | "competitor_weakness" | "keyword_spotlight" | "manual",
  
  // OPTIONAL but HIGHLY RECOMMENDED - ID linking to source
  sourceContextId: "issue-123" or "keyword_US" or "com.competitor.app",
  
  // OPTIONAL - Language code (defaults to "en")
  language: "en" | "ar" | "fr" | etc,
  
  // OPTIONAL - Arbitrary metadata
  metadata: {
    isRtl: false,
    directionality: "ltr",
    // ... module-specific fields
  }
}
```

---

## Common Issues & Fixes

### Issue: "Invalid enum value"

```javascript
message: "Invalid enum value. Expected 'keyword' | 'review_issue' | ..."
```

**Fix:** Check that `signalType` is exactly one of the valid values. Common typos:
- `"keywords"` ❌ → `"keyword"` ✅
- `"issue"` ❌ → `"review_issue"` ✅
- `"weakness"` ❌ → `"competitor_weakness"` ✅

### Issue: "Content is required"

```javascript
message: "String must contain at least 1 character"
```

**Fix:** Make sure `content` is not empty. The component validates this, so you should never see this error in production.

### Issue: "Not a workspace member"

```javascript
code: "forbidden",
message: "Not a workspace member"
```

**Fix:** User needs to be added to the workspace. Check `workspace_members` table:
```sql
SELECT * FROM workspace_members 
WHERE user_id = 'user-id' 
AND workspace_id = 'workspace-id';
```

If no row exists, user is not a member.

---

## Files Modified

| File | Change |
|------|--------|
| `components/staging/StageButton.tsx` | Enhanced error handling and diagnostics |

---

## Testing

Open browser console (F12) and:

1. Click "Stage" button
2. Check console output
3. Should see `[StageButton] Staging signal: { ... }`
4. Either see `[StageButton] Signal staged successfully` or `[StageButton] API Error: { ... }`

The error object should now be **fully populated** instead of empty `{}`.

---

**All future errors will have full context for debugging.**
