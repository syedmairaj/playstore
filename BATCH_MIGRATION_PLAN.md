# Batch Migration Plan: Legacy SDK → Vertex AI

**Status:** AUDIT COMPLETE - Ready for refactoring  
**Files Found:** 11 files using legacy `@google/generative-ai`  
**Refactoring Time:** ~30 minutes (fully automated)  

---

## Files to Migrate

### High Priority (6 files - Direct Client Usage)
```
1. src/lib/gemini/generate-screenshot-captions.ts
2. src/lib/gemini/generate-add-app-suggest.ts
3. src/lib/gemini/generate-listing.ts
4. src/lib/gemini/generate-review-reply.ts
5. src/lib/gemini/generate-screenshot-pack.ts
6. src/lib/gemini/generate-screenshot-layout.ts
7. src/lib/gemini/generate-optimizer-autofill.ts
8. src/lib/gemini/generate-aso-assets.ts
9. src/lib/gemini/generate-review-analysis.ts
```

### Medium Priority (2 files - Type/Config Only)
```
10. src/lib/gemini/gemini-defaults.ts
11. src/lib/gemini/generate-aso-report-card.ts
```

### Low Priority (1 file - Type Import Only)
```
12. src/lib/consultant/strategy-generator.ts
```

### Support Files (Don't modify yet)
```
- src/lib/gemini/log-gemini-env.ts (logging only)
- src/lib/gemini/vertexai-client.ts (already partially Vertex AI)
```

---

## Environment & Package Updates

### 1. Remove Unused Package
```bash
npm uninstall @google/generative-ai
```

### 2. Remove API Key from .env.local
```bash
# From .env.local, delete:
GEMINI_API_KEY=REDACTED_GEMINI_KEY
```

### 3. Verify @google-cloud/vertexai
```bash
npm list @google-cloud/vertexai
# Should show: @google-cloud/vertexai@X.X.X
```

---

## Migration Template

### BEFORE (Legacy SDK)
```typescript
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export async function generateListing(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  
  return response.response.text();
}
```

### AFTER (Vertex AI Gateway)
```typescript
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import type { SchemaType } from "@google-cloud/vertexai";

export async function generateListing(prompt: string) {
  // No API key needed! Uses ADC automatically
  const model = getGenerativeModel();
  
  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  
  return response.response.text();
}
```

**Key Changes:**
- ❌ Remove: `new GoogleGenerativeAI(apiKey)`
- ❌ Remove: `process.env.GEMINI_API_KEY`
- ✅ Add: `import { getGenerativeModel } from "@/lib/ai/modelGateway"`
- ✅ Use: `const model = getGenerativeModel()`

---

## Migration Pattern by File Type

### Pattern 1: Simple generateContent Call
```typescript
// BEFORE
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const response = await model.generateContent({ contents: [...] });

// AFTER
import { getGenerativeModel } from "@/lib/ai/modelGateway";
const model = getGenerativeModel();
const response = await model.generateContent({ contents: [...] });
```

### Pattern 2: With SchemaType
```typescript
// BEFORE
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(apiKey);
const response = await model.generateContent({
  generationConfig: {
    responseSchema: { type: SchemaType.OBJECT, ... }
  }
});

// AFTER
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import type { SchemaType } from "@google-cloud/vertexai";
const model = getGenerativeModel();
const response = await model.generateContent({
  generationConfig: {
    responseSchema: { type: SchemaType.OBJECT, ... }
  }
});
```

### Pattern 3: With Custom Config
```typescript
// BEFORE
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: { temperature: 0.5, ... }
});

// AFTER
const model = getGenerativeModel({
  temperature: 0.5,
  model: "gemini-2.5-flash",
  ...
});
```

---

## Files Detail

### 1. generate-screenshot-captions.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI, SchemaType  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

```typescript
// CURRENT
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// NEW
import { getGenerativeModel } from "@/lib/ai/modelGateway";
const model = getGenerativeModel();
```

### 2. generate-add-app-suggest.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 3. generate-listing.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI, SchemaType  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 4. generate-review-reply.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 5. generate-screenshot-pack.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI, SchemaType  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 6. generate-screenshot-layout.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI, SchemaType  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 7. generate-optimizer-autofill.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 8. generate-aso-assets.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI, SchemaType  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 9. generate-review-analysis.ts
**Status:** Direct client usage  
**Imports:** GoogleGenerativeAI, SchemaType  
**Changes:** Replace with getGenerativeModel()  
**Complexity:** Low  

### 10. gemini-defaults.ts
**Status:** Configuration/defaults  
**Current:** Creates GoogleGenerativeAI and passes to other modules  
**Changes:** Remove API key logic, export getGenerativeModel instead  
**Complexity:** Medium  

### 11. generate-aso-report-card.ts
**Status:** Type usage only  
**Current:** Uses GoogleGenerativeAI as type parameter  
**Changes:** Remove type, or import from @google-cloud/vertexai  
**Complexity:** Low  

### 12. strategy-generator.ts
**Status:** Type import only  
**Current:** `import type { GoogleGenerativeAI }`  
**Changes:** Remove or change to GenerativeModel  
**Complexity:** Low  

---

## Execution Plan

### Phase 1: Cleanup (2 minutes)
```bash
# 1. Remove legacy package
npm uninstall @google/generative-ai

# 2. Remove API key from .env.local
# Edit .env.local and delete: GEMINI_API_KEY=...

# 3. Remove backup files
rm -f src/lib/ai/modelGateway-REFACTORED.ts
```

### Phase 2: Migrate High-Priority Files (15 minutes)
```
Files: 9 direct client usage files
Action: Replace GoogleGenerativeAI with getGenerativeModel()
```

### Phase 3: Migrate Medium/Low-Priority Files (5 minutes)
```
Files: 3 files with type/config usage
Action: Update imports and type references
```

### Phase 4: Clean Up Support Files (3 minutes)
```
Files: 2 logging/support files
Action: Update for consistency
```

### Phase 5: Verify & Test (5 minutes)
```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

---

## Verification Checklist

After migration:

```bash
# 1. No legacy SDK imports
grep -r "@google/generative-ai" src/
# Should return: NOTHING

# 2. No GoogleGenerativeAI class usage
grep -r "new GoogleGenerativeAI" src/
# Should return: NOTHING

# 3. Only one VertexAI instantiation
grep -r "new VertexAI" src/
# Should return: ONLY modelGateway.ts

# 4. All AI calls use getGenerativeModel
grep -r "getGenerativeModel()" src/lib/gemini/
# Should return: Multiple matches (good!)

# 5. TypeScript clean
npm run typecheck
# Should return: No errors

# 6. Lint clean
npm run lint
# Should return: No errors

# 7. Build clean
npm run build
# Should return: Success
```

---

## Rollback Plan

If issues occur:

```bash
# Restore package
npm install @google/generative-ai

# Restore files from git
git checkout src/lib/gemini/
git checkout src/lib/consultant/

# Restore .env.local
git checkout .env.local
```

---

## Summary

**Current State:**
- ❌ 11 files using legacy SDK
- ❌ API key stored in .env.local
- ❌ Getting 429 "prepayment credits depleted" error

**Target State:**
- ✅ 0 files using legacy SDK
- ✅ 0 API keys in codebase
- ✅ All requests routed to Vertex AI (aiplatform.googleapis.com)
- ✅ No more 429 errors

**Time to Complete:** ~30 minutes  
**Breaking Changes:** None (backward compatible)  
**Risk Level:** Low (audit script guides all changes)

---

## Next Step

Ready to proceed with batch migration?

```bash
# 1. Start Phase 1
npm uninstall @google/generative-ai
# Delete GEMINI_API_KEY from .env.local

# 2. I'll refactor all 11 files
# 3. Run verification
# 4. Deploy
```

All files are straightforward replacements - the hardened `modelGateway.ts` handles everything.
