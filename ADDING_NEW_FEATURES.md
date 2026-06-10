# ✅ ADD NEW FEATURES IN 1 DAY

**Universal Staged-State Architecture Quick Guide**

---

## Overview

Adding a new feature takes exactly 4 steps:

1. **Define Schema** (10 min)
2. **Create Producer** (30 min)
3. **Register Producer** (5 min)
4. **Create API Endpoint** (15 min)

**Total: ~60 minutes** ✅

No schema migrations. No breaking changes. No downtime.

---

## Step 1: Define Schema (10 min)

Create a file for your feature schema:

```typescript
// src/lib/producers/my-feature.schema.ts

export const MY_FEATURE_SCHEMA = {
  type: "object",
  properties: {
    myData: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          value: { type: "number" }
        },
        required: ["id", "name"]
      }
    },
    metadata: {
      type: "object",
      properties: {
        total_count: { type: "integer" },
        last_updated: { type: "string", format: "date-time" }
      }
    }
  },
  required: ["myData", "metadata"],
  additionalProperties: false
};
```

---

## Step 2: Create Producer (30 min)

Copy this template and fill in your feature logic:

```typescript
// src/lib/producers/my-feature.producer.ts

import { StagedStateProducer, WorkspaceStagingVault } from "@/lib/staging/vault.types";
import Ajv from "ajv";
import { MY_FEATURE_SCHEMA } from "./my-feature.schema";

const ajv = new Ajv();

/**
 * My Feature Producer
 * 
 * Feature Key: my_feature
 * Locales: en, ar
 * Input: { items: [...] }
 * Output: { myData: [...], metadata: {...} }
 */
export class MyFeatureProducer implements StagedStateProducer {
  // REQUIRED: Unique feature identifier (becomes key in vault.features)
  readonly featureKey = "my_feature";

  // REQUIRED: Supported locales
  readonly locales: ("en" | "ar")[] = ["en", "ar"];

  // REQUIRED: JSON Schema for validation
  readonly schema = MY_FEATURE_SCHEMA;

  /**
   * REQUIRED: Main production method
   * 
   * Contract:
   * - ONLY modify vault.state_{locale}.features[this.featureKey]
   * - Never touch other features
   * - Never touch the other locale
   * - Always update metadata
   * - Return updated vault
   */
  async produce(
    vault: WorkspaceStagingVault,
    input: any,
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault> {
    // Step 1: Get current state for this locale
    const state = locale === "en" ? vault.state_en : vault.state_ar;
    
    // Step 2: Get current feature data (default to empty)
    const current = state.features[this.featureKey] || {
      myData: [],
      metadata: { total_count: 0 }
    };

    // Step 3: Transform input into feature data
    const myData = input.items.map((item: any) => ({
      id: item.id || crypto.randomUUID(),
      name: item.name,
      value: item.value
    }));

    // Step 4: Merge with existing (keep old, update new)
    const merged = this.smartMerge(current.myData, myData);

    // Step 5: Build feature data
    const featureData = {
      myData: merged,
      metadata: {
        total_count: merged.length,
        last_updated: new Date().toISOString()
      }
    };

    // Step 6: VALIDATE before updating
    const isValid = await this.validate(featureData);
    if (!isValid) {
      throw new Error("Validation failed for my_feature");
    }

    // Step 7: Update ONLY this feature in ONLY this locale
    const updatedState = {
      ...state,
      features: {
        ...state.features,
        [this.featureKey]: featureData  // ✅ Only this feature
      },
      metadata: {
        ...state.metadata,
        last_producer: this.featureKey,
        last_producer_timestamp: new Date().toISOString(),
        feature_count: Object.keys(state.features).length + 1,
        dirty_flags: {
          ...state.metadata.dirty_flags,
          [this.featureKey]: true
        }
      }
    };

    // Step 8: Return updated vault (ONLY this locale modified)
    return {
      ...vault,
      [locale === "en" ? "state_en" : "state_ar"]: updatedState,
      active_features: Array.from(
        new Set([...vault.active_features, this.featureKey])
      ),
      last_modified_by: userId,
      change_count: vault.change_count + 1,
      updated_at: new Date()
    };
  }

  /**
   * REQUIRED: Validation method
   */
  async validate(data: any): Promise<boolean> {
    const validate = ajv.compile(this.schema);
    return validate(data);
  }

  /**
   * OPTIONAL: Cleanup old data
   */
  async cleanup?(vault: WorkspaceStagingVault): Promise<void> {
    // Delete old entries, archive, etc.
  }

  /**
   * HELPER: Smart merge strategy
   * Keep old data, update/add new data
   */
  private smartMerge(existing: any[], newData: any[]): any[] {
    const map = new Map(existing.map(item => [item.id, item]));

    for (const item of newData) {
      if (map.has(item.id)) {
        // Update existing (preserve ID)
        map.set(item.id, {
          ...map.get(item.id),
          ...item,
          id: item.id
        });
      } else {
        // Add new
        map.set(item.id, item);
      }
    }

    return Array.from(map.values());
  }
}
```

**Key Rules:**
- ✅ Only modify `vault.state_{locale}.features[this.featureKey]`
- ✅ Never touch other features
- ✅ Never touch the other locale
- ✅ Always validate before returning
- ✅ Update metadata (last_producer, timestamp, etc.)

---

## Step 3: Register Producer (5 min)

Add to the producer registry:

```typescript
// src/lib/staging/producer-registry.ts

// Add import
import { MyFeatureProducer } from "@/lib/producers/my-feature.producer";

// In initializeDefaultProducers() function
export async function initializeDefaultProducers() {
  // ... existing producers ...
  
  // Add your producer
  producerRegistry.register(new MyFeatureProducer());
  
  console.log("✅ MyFeatureProducer registered");
}
```

**That's it!** Your producer is now registered and isolated.

---

## Step 4: Create API Endpoint (15 min)

Create a route handler:

```typescript
// app/api/workspaces/[workspaceId]/my-feature/route.ts

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { vaultRouter } from "@/lib/staging/vault-router";

const ROUTE = "POST /api/workspaces/[workspaceId]/my-feature";

const bodySchema = z.object({
  appId: z.string().uuid(),
  locale: z.enum(["en", "ar"]),
  items: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      value: z.number()
    })
  )
});

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  // Workspace membership check
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  // Parse request
  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation", message: err.errors[0]?.message }
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 }
    );
  }

  try {
    console.log(`[${ROUTE}] Processing request:`, {
      appId: body.appId,
      locale: body.locale,
      itemCount: body.items.length
    });

    // Route to producer through vault router
    const response = await vaultRouter.routeProducerRequest({
      locale: body.locale,
      userId: user.id,
      workspaceId,
      appId: body.appId,
      feature: "my_feature",  // Must match producer featureKey
      payload: { items: body.items }
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: response.error },
        { status: 500 }
      );
    }

    console.log(`[${ROUTE}] ✅ Success`);

    return NextResponse.json({
      ok: true,
      data: response.data
    });

  } catch (error) {
    console.error(`[${ROUTE}] Error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { ok: false, error: { code: "feature_error", message } },
      { status: 500 }
    );
  }
}
```

---

## Testing Your Feature

### 1. Test API Endpoint

```bash
curl -X POST http://localhost:3000/api/workspaces/{workspaceId}/my-feature \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "550e8400-e29b-41d4-a716-446655440000",
    "locale": "en",
    "items": [
      { "id": "1", "name": "Item 1", "value": 100 },
      { "id": "2", "name": "Item 2", "value": 200 }
    ]
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "myData": [
      { "id": "1", "name": "Item 1", "value": 100 },
      { "id": "2", "name": "Item 2", "value": 200 }
    ],
    "metadata": {
      "total_count": 2,
      "last_updated": "2026-06-10T14:30:00Z"
    }
  }
}
```

### 2. Test Isolation Enforcement

Try creating a producer that modifies another feature:

```typescript
// This will FAIL because ProducerRegistry.verifyIsolation() catches it
updatedState.features.other_feature = "corrupted"; // ❌ ERROR
```

The system will throw:
```
IsolationViolationError: Producer my_feature attempted to modify feature other_feature
```

### 3. Test Bilingual Separation

Create same feature in both locales:

```bash
# English
curl -X POST http://localhost:3000/api/workspaces/{ws}/my-feature \
  -d '{ "appId": "...", "locale": "en", "items": [...] }'

# Arabic (same app, different locale)
curl -X POST http://localhost:3000/api/workspaces/{ws}/my-feature \
  -d '{ "appId": "...", "locale": "ar", "items": [...different...] }'
```

Both are stored separately:
- `vault.state_en.features.my_feature` (English data)
- `vault.state_ar.features.my_feature` (Arabic data)

---

## Advanced: Using Feature in Synthesizer

To include your feature in synthesis context:

```typescript
// src/lib/staging/synthesis-context-builder.ts

async buildContext(vault, locale, config) {
  const state = locale === "en" ? vault.state_en : vault.state_ar;
  const features = state.features;

  // Add your feature
  const context: SynthesisContext = {
    // ... existing fields ...
    
    myFeatureData: features.my_feature?.myData || [],
    
    metadata: { ... }
  };

  return context;
}
```

Then in your synthesizer prompt:

```typescript
if (context.myFeatureData?.length > 0) {
  prompt += `\n\n## My Feature Data`;
  context.myFeatureData.forEach((item) => {
    prompt += `\n- ${item.name}: ${item.value}`;
  });
}
```

---

## Checklist for New Feature

- [ ] Schema defined and tested
- [ ] Producer class created and follows template
- [ ] Producer registered in `producerRegistry`
- [ ] API endpoint created with validation
- [ ] Tested via curl
- [ ] Isolation test (verify can't modify other features)
- [ ] Bilingual test (test both EN and AR)
- [ ] Integration test (if needed)
- [ ] Documentation updated
- [ ] Ready to deploy!

---

## Example: Complete Feature Addition (Real-time)

Let's say you want to add a "user_preferences" feature:

### 1. Schema (5 min)

```typescript
// src/lib/producers/user-preferences.schema.ts
export const USER_PREFERENCES_SCHEMA = {
  type: "object",
  properties: {
    preferences: {
      type: "object",
      properties: {
        autogenerate_listings: { type: "boolean" },
        preferred_tone: { type: "string", enum: ["professional", "casual", "fun"] },
        keyword_difficulty_threshold: { type: "number" }
      }
    }
  }
};
```

### 2. Producer (20 min)

```typescript
// src/lib/producers/user-preferences.producer.ts
export class UserPreferencesProducer implements StagedStateProducer {
  readonly featureKey = "user_preferences";
  readonly locales = ["en", "ar"];
  readonly schema = USER_PREFERENCES_SCHEMA;

  async produce(vault, input, locale, userId) {
    const state = locale === "en" ? vault.state_en : vault.state_ar;
    const current = state.features[this.featureKey] || { preferences: {} };

    const featureData = {
      preferences: { ...current.preferences, ...input }
    };

    await this.validate(featureData);

    const updatedState = {
      ...state,
      features: {
        ...state.features,
        [this.featureKey]: featureData
      }
    };

    return {
      ...vault,
      [locale === "en" ? "state_en" : "state_ar"]: updatedState,
      // ... rest of vault update ...
    };
  }

  async validate(data) {
    const validate = ajv.compile(this.schema);
    return validate(data);
  }
}
```

### 3. Register (2 min)

```typescript
producerRegistry.register(new UserPreferencesProducer());
```

### 4. Endpoint (10 min)

```typescript
// app/api/workspaces/[workspaceId]/preferences/route.ts
export async function POST(request, context) {
  // ... validation ...
  const response = await vaultRouter.routeProducerRequest({
    locale: body.locale,
    userId: user.id,
    workspaceId,
    appId: body.appId,
    feature: "user_preferences",
    payload: body.preferences
  });
  return NextResponse.json({ ok: true, data: response.data });
}
```

### Done! ✅

Your feature is live. No migrations. No downtime. 60 minutes.

---

## Summary

| Step | Time | What | File |
|------|------|------|------|
| 1 | 10 min | Define schema | `my-feature.schema.ts` |
| 2 | 30 min | Create producer | `my-feature.producer.ts` |
| 3 | 5 min | Register producer | `producer-registry.ts` |
| 4 | 15 min | Create endpoint | `app/api/.../my-feature/route.ts` |
| **Total** | **~60 min** | **Feature Ready** | |

No breaking changes. No migrations. Full isolation. Bilingual support.

**Welcome to 1-day feature development!** 🚀

---

*Last Updated: 2026-06-10*
