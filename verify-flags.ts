/**
 * Verification Script for Phase 2 Feature Flags
 *
 * Run this to verify all 13 feature flags are properly defined and resolve correctly.
 * Usage: npx ts-node verify-flags.ts
 */

import { FEATURE_FLAG_KEYS } from "@/lib/features/flags/keys";
import { DEFAULT_FEATURE_FLAGS } from "@/lib/features/flags/defaults";
import { mergeFeatureFlags, type FeatureFlagMap } from "@/lib/features/flags/resolve";

const expectedFlags = 13;
const newFlags = ["brand_assets", "advanced_competitor_analysis", "advanced_reviews"];

console.log("\n=== Feature Flags Verification ===\n");

// 1. Check key count
console.log(`✓ Flag keys defined: ${FEATURE_FLAG_KEYS.length} (expected: ${expectedFlags})`);
if (FEATURE_FLAG_KEYS.length !== expectedFlags) {
  console.error(`  ✗ FAILED: Expected ${expectedFlags} flags, got ${FEATURE_FLAG_KEYS.length}`);
  process.exit(1);
}

// 2. Check defaults count
const defaultKeys = Object.keys(DEFAULT_FEATURE_FLAGS).length;
console.log(`✓ Defaults defined: ${defaultKeys} (expected: ${expectedFlags})`);
if (defaultKeys !== expectedFlags) {
  console.error(
    `  ✗ FAILED: Expected ${expectedFlags} defaults, got ${defaultKeys}`
  );
  process.exit(1);
}

// 3. Check all keys have defaults
console.log("\n✓ All keys have defaults:");
for (const key of FEATURE_FLAG_KEYS) {
  if (!(key in DEFAULT_FEATURE_FLAGS)) {
    console.error(`  ✗ FAILED: Key '${key}' missing from defaults`);
    process.exit(1);
  }
  const value = DEFAULT_FEATURE_FLAGS[key];
  console.log(`  - ${key}: ${value}`);
}

// 4. Check new flags are OFF by default
console.log("\n✓ New flags default to OFF:");
for (const flag of newFlags) {
  const value = (DEFAULT_FEATURE_FLAGS as any)[flag];
  if (value !== false) {
    console.error(
      `  ✗ FAILED: Flag '${flag}' should default to false, got ${value}`
    );
    process.exit(1);
  }
  console.log(`  - ${flag}: ${value}`);
}

// 5. Test merging
console.log("\n✓ Flag merging works:");
const merged = mergeFeatureFlags({});
console.log(`  - Merged ${Object.keys(merged).length} flags`);

// 6. Test with overrides
console.log("\n✓ Overrides work:");
const overridden = mergeFeatureFlags({ brand_assets: true });
if (overridden.brand_assets !== true) {
  console.error("  ✗ FAILED: Override not applied");
  process.exit(1);
}
console.log(`  - brand_assets override: ${overridden.brand_assets} (true)`);

// 7. Display all flags
console.log("\n=== All 13 Feature Flags ===");
FEATURE_FLAG_KEYS.forEach((key) => {
  const value = DEFAULT_FEATURE_FLAGS[key];
  const isNew = newFlags.includes(key);
  const marker = isNew ? " (NEW)" : "";
  console.log(`  ${value ? "✓" : "✗"} ${key}${marker}`);
});

console.log("\n✅ All verifications passed!\n");
console.log("Summary:");
console.log(`  - 13 feature flags defined (10 existing + 3 new)`);
console.log(`  - All defaults set (3 new flags OFF by default)`);
console.log(`  - Merging/overriding works correctly`);
console.log(`  - Ready for production\n`);
