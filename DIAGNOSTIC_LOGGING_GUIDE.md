# 🔍 Diagnostic Logging Guide - StagingVault

## Overview

Comprehensive debug logging added to `staging-vault-service.ts` to trace the complete signal insertion pipeline. Logs are organized in logical checkpoints.

---

## Logging Checkpoints

### 1. **ENTRY** - Function receives signal
```
[StagingVault] 🔍 ENTRY - Full signal object:
```
**What it shows:**
- The complete signal object passed to `addSignalToVault()`
- `metadata` object and its structure
- `competitor_id` value and type
- Signal type, language, workspace ID

**If you see this:** The function was called successfully.

---

### 2. **VALIDATION FAILED** - Pre-insertion checks
```
[StagingVault] ❌ VALIDATION FAILED - [reason]
```
**Possible failures:**
- `Content is empty` - No signal content provided
- `Content too long` - Content exceeds 5000 characters
- `Invalid language` - Language code doesn't match `en`/`ar` format

**What to do:** Check the error details in the log to see what's wrong with the input.

---

### 3. **METADATA CHECK #1** - Type validation
```
[StagingVault] 🔍 METADATA CHECK #1 - Type validation:
```
**What it verifies:**
- Is metadata an object? (not null, not array, not string)
- `competitor_id` is present and accessible

**If it fails:** 
```
❌ VALIDATION FAILED - Metadata type error
```
Check the `actualType` field—metadata should always be `object`.

---

### 4. **METADATA CHECK #2** - JSON stringification
```
[StagingVault] 🔍 METADATA CHECK #2 - JSON.stringify succeeded:
```
**What it verifies:**
- Metadata can be converted to JSON string
- No circular references or non-serializable values

**If it fails:**
```
❌ VALIDATION FAILED - JSON stringify error
```
The metadata contains something that can't be JSON-encoded (function, Symbol, circular ref).

---

### 5. **METADATA CHECK #3** - Round-trip serialization
```
[StagingVault] 🔍 METADATA CHECK #3 - Round-trip JSON succeeded:
```
**What it verifies:**
- Metadata survives: object → JSON string → object

**If it fails:**
```
❌ VALIDATION FAILED - JSON parse error
```
The stringified metadata couldn't be parsed back (rare, usually means Check #2 already failed).

---

### 6. **METADATA CHECK #4** - competitor_weakness specific
```
[StagingVault] 🔍 METADATA CHECK #4 - competitor_weakness specific validation:
```
**What it verifies:**
- `metadata.competitor_id` exists
- `competitor_id` is a non-empty string

**If it fails:**
```
❌ VALIDATION FAILED - Missing or wrong-type competitor_id
```
For `competitor_weakness` signals, `competitor_id` is REQUIRED.

---

### 7. **METADATA VALIDATION PASSED**
```
[StagingVault] ✓ METADATA VALIDATION PASSED for [type]:
```
**All checks passed!** Metadata is valid and ready for schema validation.

---

### 8. **SCHEMA VALIDATION** - Full schema enforcement
```
[StagingVault] 🔍 SCHEMA VALIDATION STARTED for competitor_weakness:
```
**What it verifies:**
- Signal structure matches BRAND-MIRROR-ENGINE-SCHEMA
- Required fields are present and correctly typed
- All nested objects are valid

**If it fails:**
```
❌ SCHEMA VALIDATION FAILED:
```
Check the `validationErrors` array for specific issues.

---

### 9. **SCHEMA VALIDATION PASSED**
```
[StagingVault] ✓ SCHEMA VALIDATION PASSED for competitor_weakness:
```
**All schema checks passed!** Signal is ready for database insertion.

---

### 10. **ABOUT TO INSERT** - Pre-database state
```
[StagingVault] 🔍 ABOUT TO INSERT signal:
```
**What it shows:**
- All fields being sent to the database
- Final metadata object (should be `object` type, not string)
- workspace_id, signal_type, competitor_id, language

**This is your last chance to inspect the data before it hits the database.**

---

### 11. **DATABASE INSERT ERROR** - Supabase error
```
[StagingVault] ❌ DATABASE INSERT ERROR:
```
**What it shows:**
- Supabase error code (e.g., `23505` for duplicates)
- Error message from the database
- All inserted fields for comparison

**Common error codes:**
- `22P02` - Invalid JSON syntax (metadata malformed)
- `23505` - Unique constraint violation
- `42P01` - Table doesn't exist (RLS or schema issue)

---

### 12. **SUCCESS** - Signal inserted
```
[StagingVault] ✅ SUCCESS - Signal inserted:
```
**Signal made it to the database!**
- Signal ID returned by Supabase
- All identifying information (competitor_id, language, workspace_id)

---

### 13. **CATCH BLOCK** - Unexpected error
```
[StagingVault] ❌ CATCH BLOCK - Add signal failed:
```
**An error wasn't caught by earlier validation.** Shows:
- Error message and stack trace
- All metadata and context at the time of failure

---

## How to Debug

### Symptom: Database table remains empty

**Step 1: Check ENTRY logs**
```
[StagingVault] 🔍 ENTRY - Full signal object:
```
Do you see this? If not, the function isn't being called.

**Step 2: Check which validation fails**
Look for the first `❌ VALIDATION FAILED` message. Each tells you exactly what's wrong:
- Empty content? Fix the input.
- Wrong language? Must be `en` or `ar`.
- Missing competitor_id? Add it to metadata.

**Step 3: Check METADATA validation sequence**
Look for CHECK #1, #2, #3, #4 in order. The first one that fails tells you the problem:
- CHECK #1 fails → metadata isn't an object
- CHECK #2 fails → metadata has non-serializable values
- CHECK #4 fails → missing competitor_id for competitor_weakness signals

**Step 4: Check SCHEMA validation**
If you see `SCHEMA VALIDATION STARTED`, look for either:
- `SCHEMA VALIDATION PASSED` ✓ → Insert should happen next
- `SCHEMA VALIDATION FAILED` ❌ → Check `validationErrors` array

**Step 5: Check ABOUT TO INSERT**
Does this log appear? If yes, data passed all checks and is about to go to the database.

**Step 6: Check SUCCESS or DATABASE ERROR**
- `SUCCESS` ✅ → Data is in the database! Problem is retrieval, not insertion.
- `DATABASE INSERT ERROR` ❌ → Database rejected the data. Check the error code.

---

## Example: Debugging "Empty Database"

Terminal output:
```
[StagingVault] 🔍 ENTRY - Full signal object:
{
  signalType: 'competitor_weakness',
  language: 'en',
  metadataProvided: true,
  metadataType: 'object',
  competitorIdValue: 'com.fittrack.pro',
  competitorIdType: 'string',
  contentLength: 150,
  timestamp: '2026-06-07T10:30:45.123Z'
}

[StagingVault] ✓ METADATA VALIDATION PASSED for competitor_weakness:
{
  hasCompetitorId: true,
  competitorId: 'com.fittrack.pro',
  metadataSize: 342
}

[StagingVault] 🔍 SCHEMA VALIDATION STARTED for competitor_weakness:
{
  competitorId: 'com.fittrack.pro',
  language: 'en',
  contentLength: 150
}

[StagingVault] ✓ SCHEMA VALIDATION PASSED for competitor_weakness:
{
  competitorId: 'com.fittrack.pro',
  language: 'en',
  validationStatus: 'PASSED'
}

[StagingVault] 🔍 ABOUT TO INSERT signal:
{
  metadataType: 'object',
  allInsertFields: { ... }
}

[StagingVault] ✅ SUCCESS - Signal inserted:
{
  signalId: 'uuid-123',
  competitorId: 'com.fittrack.pro',
  language: 'en'
}
```

**Interpretation:** All checks passed, signal was inserted successfully. Database is no longer empty—check retrieval logic instead.

---

## Log Levels

| Symbol | Meaning | Action |
|--------|---------|--------|
| 🔍 | Information checkpoint | Just informational, continue reading logs |
| ✓ | Validation passed | Good sign, process continuing |
| ❌ | Failure or error | Something stopped the process, fix the cause |
| ✅ | Success | Goal achieved, data in database |

---

## Key Takeaway

**The logs tell you EXACTLY where the process breaks:**
- If you see `ENTRY` but not `SUCCESS`, check which `❌` comes first
- The first failure is the root cause
- Each failure log includes context to fix the issue

