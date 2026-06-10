/**
 * PRODUCER TEMPLATE
 *
 * Copy this file and customize for your feature:
 * 1. Rename file: PRODUCER_TEMPLATE.ts → my-feature.producer.ts
 * 2. Update CLASS_NAME to MyFeatureProducer
 * 3. Update featureKey to match feature name
 * 4. Update schema with your data structure
 * 5. Implement produce() logic
 * 6. Register in producer-registry.ts
 *
 * ✅ ZERO-BREAKING-CHANGES ARCHITECTURE
 * - Each producer is independent
 * - Only modifies its own feature key
 * - ProducerRegistry enforces isolation
 * - No database migrations needed
 */

import { StagedStateProducer, WorkspaceStagingVault } from "@/lib/staging/vault.types";
import Ajv from "ajv";

const ajv = new Ajv();

/**
 * JSON Schema for your feature
 * Update this to match your data structure
 */
const MY_FEATURE_SCHEMA = {
  type: "object",
  properties: {
    // TODO: Add your feature properties here
    items: {
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
  required: ["items", "metadata"],
  additionalProperties: false
};

/**
 * My Feature Producer
 *
 * CRITICAL RULES (enforced by ProducerRegistry):
 * ✅ ONLY modify vault.state_{locale}.features[this.featureKey]
 * ✅ NEVER touch other features
 * ✅ NEVER touch the other locale
 * ✅ Always validate before updating
 * ✅ Always update metadata
 */
export class MyFeatureProducer implements StagedStateProducer {
  // 1. REQUIRED: Unique feature identifier
  // This becomes the key in vault.state_{locale}.features
  readonly featureKey = "my_feature"; // TODO: Change to your feature name

  // 2. REQUIRED: Supported locales
  readonly locales: ("en" | "ar")[] = ["en", "ar"];

  // 3. REQUIRED: JSON Schema for validation
  readonly schema = MY_FEATURE_SCHEMA;

  /**
   * 4. REQUIRED: Main production method
   *
   * Contract:
   * - Input: raw feature data
   * - Output: updated vault (with ONLY this feature modified in ONLY this locale)
   * - Side effects: NONE (pure function from ProducerRegistry's perspective)
   */
  async produce(
    vault: WorkspaceStagingVault,
    input: any,
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault> {
    console.log(`[MyFeatureProducer] Producing for ${locale} locale:`, {
      inputKeys: Object.keys(input),
    });

    // Step 1: Get current state for THIS locale ONLY
    const state = locale === "en" ? vault.state_en : vault.state_ar;

    // Step 2: Get current feature data (default to empty structure)
    const currentFeatureData = state.features[this.featureKey] || {
      items: [],
      metadata: {
        total_count: 0,
        last_updated: new Date().toISOString()
      }
    };

    // Step 3: Transform input into feature format
    const transformedItems = input.items.map((item: any) => ({
      id: item.id || crypto.randomUUID(),
      name: item.name,
      value: item.value
    }));

    // Step 4: Merge with existing (smart merge example)
    const mergedItems = this.smartMerge(currentFeatureData.items, transformedItems);

    // Step 5: Build feature data object
    const featureData = {
      items: mergedItems,
      metadata: {
        total_count: mergedItems.length,
        last_updated: new Date().toISOString()
      }
    };

    // Step 6: VALIDATE before updating
    const isValid = await this.validate(featureData);
    if (!isValid) {
      throw new Error(`Validation failed for ${this.featureKey}`);
    }

    // Step 7: Update ONLY this feature in ONLY this locale
    // ✅ Everything else stays the same
    const updatedState = {
      ...state,
      features: {
        ...state.features,
        [this.featureKey]: featureData // ✅ ONLY this key modified
      },
      metadata: {
        ...state.metadata,
        last_producer: this.featureKey,
        last_producer_timestamp: new Date().toISOString(),
        feature_count: Object.keys(state.features).length,
        dirty_flags: {
          ...state.metadata.dirty_flags,
          [this.featureKey]: true
        }
      }
    };

    // Step 8: Return updated vault
    // ✅ ONLY this locale's state modified
    // ✅ Other locale completely unchanged
    // ✅ ProducerRegistry will verify isolation
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
   * 5. REQUIRED: Validation method
   */
  async validate(data: any): Promise<boolean> {
    const validate = ajv.compile(this.schema);
    const valid = validate(data);

    if (!valid) {
      console.error(`[MyFeatureProducer] Validation failed:`, validate.errors);
      return false;
    }

    return true;
  }

  /**
   * 6. OPTIONAL: Cleanup old data
   * Called periodically to remove stale entries
   */
  async cleanup?(vault: WorkspaceStagingVault): Promise<void> {
    // TODO: Implement cleanup logic if needed
    // Example: Remove entries older than 30 days
  }

  /**
   * HELPER: Smart merge strategy
   * Keep existing data, update with new data
   */
  private smartMerge(existing: any[], newData: any[]): any[] {
    const map = new Map(existing.map((item) => [item.id, item]));

    for (const item of newData) {
      if (map.has(item.id)) {
        // Update existing: preserve ID, update other fields
        map.set(item.id, {
          ...map.get(item.id),
          ...item,
          id: item.id // Preserve ID
        });
      } else {
        // Add new item
        map.set(item.id, item);
      }
    }

    return Array.from(map.values());
  }
}

/**
 * USAGE INSTRUCTIONS:
 *
 * 1. Copy this file:
 *    cp src/lib/producers/PRODUCER_TEMPLATE.ts src/lib/producers/my-feature.producer.ts
 *
 * 2. Update the class:
 *    - Change class name: MyFeatureProducer → MyFeatureProducer
 *    - Change featureKey: "my_feature" → "my_feature"
 *    - Update schema with your data structure
 *    - Implement produce() logic
 *
 * 3. Register in producer-registry.ts:
 *    import { MyFeatureProducer } from "@/lib/producers/my-feature.producer";
 *    producerRegistry.register(new MyFeatureProducer());
 *
 * 4. Create API endpoint:
 *    app/api/workspaces/[workspaceId]/staging/vault/route.ts
 *    (Already exists, just route through it)
 *
 * 5. Test:
 *    curl -X POST http://localhost:3000/api/workspaces/{id}/staging/vault \
 *      -d '{"appId": "...", "locale": "en", "feature": "my_feature", "payload": {...}}'
 *
 * That's it! Your feature is live without any schema migrations.
 */
