# Schema Validation Layer for `optimizer_selection` Signals

**Date:** June 8, 2026  
**Status:** ✅ Implementation Complete

---

## Overview

Implemented a comprehensive schema validation gatekeeper for `optimizer_selection` signals in the staging vault service. The validation ensures that all keyword selections sent to the AI Listing Optimizer strictly follow the `{ term: string, category: string }` structure, with full multilingual (EN/AR) and Unicode safety.

---

## Key Features

### 1. **Keyword Payload Schema**
```typescript
export interface KeywordPayload {
  term: string;      // Non-empty string (EN/AR safe)
  category: string;  // Non-empty string (EN/AR safe)
  [key: string]: unknown; // Extra fields allowed
}
```

### 2. **Validation Function: `validateKeywordPayload()`**

**Location:** `staging-vault-service.ts` (lines 47-204)

**Responsibilities:**
- Validates that input is an array
- Iterates through each keyword object
- Ensures every object has both `term` and `category`
- Verifies both fields are non-empty strings (after trim)
- Checks JSON serializability (catches circular references)
- Preserves Unicode characters (Arabic, emoji, etc.)

**Validation Checks:**
1. **Array validation** - Input must be an array
2. **Non-empty check** - Array cannot be empty
3. **Object iteration** - Each item must be an object (not null/array/primitive)
4. **Field presence** - Both `term` and `category` must exist
5. **Type checking** - Both fields must be strings
6. **Non-empty strings** - Both must have content after `.trim()`
7. **Unicode safety** - JSON round-trip serialization test
8. **Multilingual support** - Full support for EN/AR text

**Return Value:**
```typescript
{
  valid: boolean;
  errors: string[];
  invalidObjects?: KeywordPayload[];  // Only if errors exist
}
```

### 3. **Integration with `addSignalToVault()`**

**Location:** Updated function signature (lines 257-285)

**Trigger:** When `signalType === 'optimizer_selection'`

**Flow:**
1. Check if `keywords` array is provided
2. Call `validateKeywordPayload(keywords)`
3. If validation fails:
   - Log all invalid objects with specific field issues
   - Throw descriptive error with all validation errors
   - Error is caught in catch block with full context logging
4. If validation passes:
   - Continue with UPSERT logic
   - Insert metadata alongside keywords
   - Post-insert verification confirms data in DB

**Code Example:**
```typescript
if (signalType === 'optimizer_selection') {
  if (!keywords || !Array.isArray(keywords)) {
    throw new Error(`optimizer_selection signals MUST include 'keywords' array`);
  }

  const keywordValidation = validateKeywordPayload(keywords);
  if (!keywordValidation.valid) {
    throw new Error(`Keyword validation failed:\n${keywordValidation.errors.join('\n')}`);
  }
}
```

---

## Diagnostic Logging (20+ Checkpoints)

### Validation Logging
1. **Entry** - Log keyword validation start with payload type/length
2. **Array Check** - Validate array structure
3. **Iteration** - Log each keyword being checked (index, type, keys)
4. **Field Validation** - Log missing `term` or `category` with context
5. **Type Validation** - Log type mismatches for each field
6. **Empty Check** - Log empty strings with trim lengths
7. **Serialization** - Log JSON stringify/parse success/failure
8. **Completion** - Log final validation result

### Error Logging
- **Specific Error Messages** - Each invalid keyword logged individually
- **Invalid Objects** - Complete object dumped for debugging
- **Index Context** - Know exactly which array index failed
- **Field Values** - See actual values that caused failure
- **Character Encoding** - Byte length logged for multilingual debug

### Checkpoint Prefixes
- 🔍 Info - Investigation/tracking
- ✓ Pass - Validation passed
- ❌ Fail - Validation failed
- ✅ Success - Operation complete

**Example Validation Failure Log:**
```
[StagingVault] ❌ VALIDATION FAILED - Missing category:
  index: 1
  errorMsg: "Keyword at index 1 (term: "fitness tracker") is missing 'category' property"
  term: "fitness tracker"
  availableKeys: ["term"]
  keyword: { term: "fitness tracker" }
```

---

## Multilingual & Unicode Safety

### English Support
```typescript
// This passes validation
const keywords = [
  { term: "fitness tracker", category: "health" },
  { term: "workout app", category: "exercise" }
];
```

### Arabic Support (RTL)
```typescript
// This passes validation - Arabic characters preserved
const keywords = [
  { term: "تطبيق اللياقة البدنية", category: "الصحة" },
  { term: "متتبع النشاط", category: "الرياضة" }
];
```

### Mixed Language
```typescript
// This passes validation
const keywords = [
  { term: "fitness", category: "تصنيف1" },
  { term: "تطبيق", category: "health" }
];
```

### Unicode Safety Verification
- Buffer.byteLength logged for UTF-8 verification
- JSON.stringify/parse round-trip ensures no corruption
- RTL characters preserved throughout pipeline
- No character stripping or normalization applied

---

## Integration with Existing Architecture

### No Disruption to Existing Logic
- `workspace_id` handling unchanged
- `language` parameter still defaults to "en"
- UPSERT constraint logic preserved
- Duplicate handling (23505 error) unchanged
- Post-insert verification still runs
- Metadata serialization logic unchanged

### New Signal Type Added
```typescript
export type SignalType = 
  | "keyword"
  | "review_issue"
  | "competitor_weakness"
  | "optimization_insight"
  | "optimizer_selection"  // ← NEW
```

### Function Signature Updated
```typescript
export async function addSignalToVault(
  supabase: SupabaseClient,
  workspaceId: string,
  signal: {
    // ... existing fields ...
    keywords?: KeywordPayload[];  // ← NEW: Optional keywords array
    // ... rest unchanged ...
  }
): Promise<{ id: string; message: string }> {
```

### Grouped Signal Response Updated
```typescript
// listVaultSignals now includes:
optimizerSelections: VaultSignal[];  // ← NEW grouping

// getAppVaultContext now includes:
optimizerSelections: Array<{
  content: string;
  language: string;
  isRtl: boolean;
  metadata: Record<string, unknown>;
}>;
```

---

## Error Handling & Recovery

### Validation Failures
If keyword validation fails:
1. Error thrown immediately (before DB write)
2. Caller receives descriptive error message
3. Full validation errors logged with invalid objects
4. No partial data written to database
5. User can fix and retry

### Example: Missing Category
```
Error: Keyword validation failed:
Keyword at index 1 (term: "fitness tracker") is missing 'category' property. Keys: term
```

### Graceful Degradation
- Duplicate signals (23505 error) still handled gracefully
- Metadata validation still requires proper JSON
- Language validation still enforced
- Content length validation still applied
- RLS policies still respected

---

## Testing Scenarios

### ✅ Valid Cases

**Case 1: Basic EN Keywords**
```javascript
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'Selected keywords from competitor analysis',
  language: 'en',
  keywords: [
    { term: 'fitness', category: 'health' },
    { term: 'workout', category: 'exercise' }
  ]
});
// Result: ✅ SUCCESS - Signal staged: optimizer_selection
```

**Case 2: Arabic Keywords**
```javascript
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'الكلمات المختارة من تحليل المنافسين',
  language: 'ar',
  keywords: [
    { term: 'اللياقة البدنية', category: 'الصحة' },
    { term: 'تمرين', category: 'التدريب' }
  ]
});
// Result: ✅ SUCCESS - Signal staged: optimizer_selection
```

**Case 3: Mixed Language + Extra Fields**
```javascript
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'Keywords with metadata',
  language: 'en',
  keywords: [
    { 
      term: 'fitness app', 
      category: 'health',
      confidence: 0.95,
      source: 'competitor_analysis'  // Extra fields allowed
    }
  ]
});
// Result: ✅ SUCCESS - Signal staged: optimizer_selection
```

### ❌ Invalid Cases

**Case 1: Missing Category**
```javascript
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'Invalid keywords',
  keywords: [
    { term: 'fitness' }  // Missing category
  ]
});
// Error: Keyword validation failed:
//   Keyword at index 0 (term: "fitness") is missing 'category' property
```

**Case 2: Empty String Terms**
```javascript
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'Invalid keywords',
  keywords: [
    { term: '   ', category: 'health' }  // Whitespace only
  ]
});
// Error: Keyword validation failed:
//   Keyword at index 0 has empty 'term' (after trim)
```

**Case 3: Non-String Category**
```javascript
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'Invalid keywords',
  keywords: [
    { term: 'fitness', category: 123 }  // Number instead of string
  ]
});
// Error: Keyword validation failed:
//   Keyword at index 0 (term: "fitness") has 'category' as number, not string
```

**Case 4: Not an Array**
```javascript
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'Invalid keywords',
  keywords: { term: 'fitness', category: 'health' }  // Object, not array
});
// Error: optimizer_selection signals MUST include 'keywords' array. Got: object
```

---

## Deployment Checklist

- ✅ Schema validation function implements all requirements
- ✅ Multilingual (EN/AR) support verified
- ✅ Unicode safety tested (no character corruption)
- ✅ Integration with `addSignalToVault` complete
- ✅ 20+ diagnostic checkpoints implemented
- ✅ No disruption to existing logic
- ✅ Backward compatible with other signal types
- ✅ Error messages specific and actionable
- ✅ Logging follows existing conventions
- ✅ Database schema unchanged
- ✅ RLS policies unaffected

---

## Usage in AI Optimizer

When user selects keywords from competitor spy analysis:

```typescript
// 1. User selects keywords from UI
const selectedKeywords: KeywordPayload[] = [
  { term: 'fitness tracker', category: 'health' },
  { term: 'workout plans', category: 'exercise' }
];

// 2. Call vault service with validation
await addSignalToVault(supabase, workspaceId, {
  signalType: 'optimizer_selection',
  content: 'Keywords selected for listing optimization',
  language: 'en',
  sourceAppId: appId,
  keywords: selectedKeywords  // ← Validated here
});

// 3. If valid: stored in vault, ready for AI consumption
// 4. If invalid: error thrown with specific field details
```

---

## Related Files

- `staging-vault-service.ts` - Main service with validation
- `BRAND-MIRROR-ENGINE-SCHEMA.ts` - Existing schema validation (competitor_weakness)
- Database: `workspace_staging_vault` table
- Project Status: `project_status.md` (architecture reference)

---

**Implementation Date:** June 8, 2026  
**Status:** ✅ Ready for Integration Testing
