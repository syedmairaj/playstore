# 🔍 Complete Insertion Flow - Debug Guide

## Overview

The competitor keyword insertion happens in **3 stages** with comprehensive logging at each stage.

---

## Stage 1: CLIENT-SIDE (Browser Console)

### 1.1 - Validation & Prep
```
[StageCompetitorAnalysis] Starting for competitor: com.myfitnesspal.android
✓ Validation passed
```
✅ Input data is valid.

### 1.2 - Payload Preparation
```
════════════════════════════════════════════════════════════════════════════════
🔍 COMPETITOR ANALYSIS CAPTURE - PRE-DATABASE LOG
════════════════════════════════════════════════════════════════════════════════
✓ competitorId: "com.myfitnesspal.android"
✓ competitorName: "MyFitnessPal"
✓ categoryLabel: "Health & Fitness"
✓ keywords.length: 45
  Sample keywords: ["fitness","diet","tracker"]
✓ vulnerabilities.length: 0
✓ workspaceId: "e8408dba-a0d5-49ce-a88c-6759b01b2ff1"
✓ language: "en"
✓ isRtl: false

📦 METADATA OBJECT (will be stored in DB):
{
  "competitor_id": "com.myfitnesspal.android",
  "competitor_name": "MyFitnessPal",
  "category_label": "Health & Fitness",
  "language": "en",
  "keywords_by_strategy": {
    "high_volume": [...],
    "intent_based": [...],
    "competitor_gap": [...]
  },
  "vulnerabilities": [],
  "is_rtl": false
}
✓ JSON.stringify succeeded. Size: 1234 bytes
════════════════════════════════════════════════════════════════════════════════
```

✅ Metadata object structure is valid.

### 1.3 - Request Body Log
```
[StageCompetitorAnalysis] 🔍 REQUEST BODY - About to POST to /api/workspaces/e8408dba-a0d5-49ce-a88c-6759b01b2ff1/staging/add
Request payload:
{
  "signalType": "competitor_weakness",
  "content": "{\"keywords\":[...],\"vulnerabilities\":[],\"language\":\"en\"}",
  "source": "competitor_spy",
  "sourceContext": "competitor_weakness",
  "sourceContextId": "com.myfitnesspal.android",
  "language": "en",
  "metadata": {
    "competitor_id": "com.myfitnesspal.android",
    ...
  }
}
Metadata type: object
Metadata.competitor_id: com.myfitnesspal.android
```

✅ Request body is correctly formatted with metadata as native object (not stringified).

### 1.4 - Response Log
```
[StageCompetitorAnalysis] 📡 RESPONSE - Status: 200
Response body: {"ok":true,"data":{"id":"uuid-12345","message":"Signal staged: competitor_weakness"}}
✓ Successfully staged competitor analysis
  Signal ID: uuid-12345
[StageCompetitorAnalysis] ✅ SUCCESS - Competitor weakness signal inserted
```

✅ HTTP 200 response received with signal ID.

**If you don't see this:** The fetch call failed. Check browser Network tab for the actual error.

---

## Stage 2: SERVER-SIDE - API Route (Server Console)

### 2.1 - Incoming Request
```
[POST /api/workspaces/[workspaceId]/staging/add] 🔍 INCOMING REQUEST
  workspaceId: e8408dba-a0d5-49ce-a88c-6759b01b2ff1
  userId: user-123
  role: editor
  timestamp: 2026-06-07T15:51:34.528Z
```

✅ Request reached the server, user is authenticated.

### 2.2 - Request Body Parsing
```
[POST /api/workspaces/[workspaceId]/staging/add] 🔍 REQUEST BODY (raw)
  signalType: competitor_weakness
  language: en
  source: competitor_spy
  sourceContextId: com.myfitnesspal.android
  metadataType: object
  metadata.competitor_id: com.myfitnesspal.android
  metadata keys: competitor_id, competitor_name, category_label, language, keywords_by_strategy, vulnerabilities, is_rtl
  content length: 456
[POST /api/workspaces/[workspaceId]/staging/add] ✓ Request body validation passed
```

✅ Request body parsed and validated (Zod schema).

### 2.3 - Call to addSignalToVault
```
[POST /api/workspaces/[workspaceId]/staging/add] 🔍 CALLING addSignalToVault with:
  workspaceId: e8408dba-a0d5-49ce-a88c-6759b01b2ff1
  body.signalType: competitor_weakness
  body.language: en
  body.metadata.competitor_id: com.myfitnesspal.android
```

✅ About to call the vault service.

---

## Stage 3: SERVER-SIDE - Vault Service (Server Console)

### 3.1 - Entry Log
```
[StagingVault] 🔍 ENTRY - Full signal object:
{
  signalType: 'competitor_weakness',
  language: 'en',
  metadataProvided: true,
  metadataType: 'object',
  metadataKeys: ['competitor_id', 'competitor_name', 'category_label', ...],
  competitorIdValue: 'com.myfitnesspal.android',
  competitorIdType: 'string',
  contentLength: 456,
  source: 'competitor_spy',
  sourceAppId: undefined,
  workspaceId: 'e8408dba-a0d5-49ce-a88c-6759b01b2ff1',
  timestamp: '2026-06-07T15:51:34.528Z'
}
```

✅ Function entry, all parameters present.

### 3.2 - Metadata Validation
```
[StagingVault] 🔍 METADATA CHECK #1 - Type validation:
{
  finalMetadataType: 'object',
  isObject: true,
  isNotNull: true,
  isNotArray: true,
  competitorId: 'com.myfitnesspal.android',
  signalType: 'competitor_weakness'
}
[StagingVault] 🔍 METADATA CHECK #2 - JSON.stringify succeeded:
{
  stringLength: 1234,
  competitorId: 'com.myfitnesspal.android'
}
[StagingVault] 🔍 METADATA CHECK #3 - Round-trip JSON succeeded:
{
  competitorId: 'com.myfitnesspal.android',
  metadataKeys: [...]
}
[StagingVault] 🔍 METADATA CHECK #4 - competitor_weakness specific validation:
{
  hasCompetitorId: true,
  competitorIdType: 'string',
  competitorIdValue: 'com.myfitnesspal.android',
  competitorIdLength: 23
}
[StagingVault] ✓ METADATA VALIDATION PASSED for competitor_weakness:
{
  hasCompetitorId: true,
  competitorId: 'com.myfitnesspal.android',
  metadataSize: 1234,
  metadataKeys: [...],
  language: 'en'
}
```

✅ All metadata checks passed, competitor_id present.

### 3.3 - Schema Validation
```
[StagingVault] 🔍 SCHEMA VALIDATION STARTED for competitor_weakness:
{
  competitorId: 'com.myfitnesspal.android',
  language: 'en',
  contentLength: 456,
  metadataKeys: [...]
}
[StagingVault] ✓ SCHEMA VALIDATION PASSED for competitor_weakness:
{
  competitorId: 'com.myfitnesspal.android',
  language: 'en',
  metadataKeys: [...],
  validationStatus: 'PASSED'
}
```

✅ Schema validation passed (strict type checking).

### 3.4 - About to Insert
```
[StagingVault] 🔍 ABOUT TO INSERT signal:
{
  workspaceId: 'e8408dba-a0d5-49ce-a88c-6759b01b2ff1',
  signalType: 'competitor_weakness',
  language: 'en',
  metadataType: 'object',
  metadataKeys: [...],
  competitorId: 'com.myfitnesspal.android',
  allInsertFields: {
    workspace_id: 'e8408dba-a0d5-49ce-a88c-6759b01b2ff1',
    signal_type: 'competitor_weakness',
    source: 'competitor_spy',
    content_length: 456,
    language: 'en',
    source_app_id: undefined,
    source_context: 'competitor_weakness',
    source_context_id: 'com.myfitnesspal.android',
    metadata: {...},
    expires_at: undefined
  }
}
```

✅ All fields ready for database insert.

### 3.5 - Insert Success
```
[StagingVault] ✅ SUCCESS - Signal inserted:
{
  signalId: 'db-uuid-12345',
  signalType: 'competitor_weakness',
  competitorId: 'com.myfitnesspal.android',
  language: 'en',
  workspaceId: 'e8408dba-a0d5-49ce-a88c-6759b01b2ff1',
  timestamp: '2026-06-07T15:51:34.528Z'
}
```

✅ Signal successfully inserted into database!

### 3.6 - API Route Success
```
[POST /api/workspaces/[workspaceId]/staging/add] ✅ addSignalToVault succeeded
  signalId: db-uuid-12345
  message: Signal staged: competitor_weakness
```

✅ API route returning success response.

---

## Finding the Breakpoint

If the database is empty, **find the first ❌ error in the logs**. 

**What to do now:**

1. Open your browser console (F12 → Console tab)
2. In your app, analyze a competitor (this triggers the stageCompetitorAnalysis call)
3. Copy ALL console logs starting with `[StageCompetitorAnalysis]`
4. Paste them here for analysis

Then check your server console for logs starting with `[POST /api/...` and `[StagingVault]`

---

## Key Decision Points

### If you see `REQUEST BODY` log:
✅ Client-side code is working
- Look for `RESPONSE - Status: ...` next
- If Status 200: Problem is on server side
- If Status 500: Server error (check server console)
- If no response: Network failed

### If you see server `INCOMING REQUEST` log:
✅ API route is being called
- Look for `REQUEST BODY (raw)` next
- Check `metadataType: object` (not string!)
- Look for `CALLING addSignalToVault` next

### If you see vault service `ENTRY` log:
✅ addSignalToVault was called with correct data
- Look for first ❌ error in metadata checks
- Look for `METADATA VALIDATION PASSED`
- Look for `SCHEMA VALIDATION PASSED`
- Look for `SUCCESS` log

---

## Status

The updated code includes complete logging from **client → server → vault → database**.

**Next step:** Run your app and paste the first ❌ error you see in the logs.

