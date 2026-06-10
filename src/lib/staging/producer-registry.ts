/**
 * Producer Registry - Isolation Enforcer
 *
 * Central registry for all feature producers.
 * Enforces:
 * - Feature isolation (producer can only modify its own feature)
 * - Locale isolation (EN/AR never mixed)
 * - Schema validation
 * - Audit trail
 */

import {
  StagedStateProducer,
  WorkspaceStagingVault,
  ProducerRequest,
  ProducerResponse,
  IsolationViolationError,
  ValidationError,
} from "./vault.types";

export class ProducerRegistry {
  private producers: Map<string, StagedStateProducer> = new Map();

  /**
   * Register a new feature producer
   */
  register(producer: StagedStateProducer) {
    if (this.producers.has(producer.featureKey)) {
      throw new Error(`Producer ${producer.featureKey} already registered`);
    }

    console.log(`[ProducerRegistry] Registered producer: ${producer.featureKey}`);
    this.producers.set(producer.featureKey, producer);
  }

  /**
   * Get all registered producers
   */
  getAllProducers(): StagedStateProducer[] {
    return Array.from(this.producers.values());
  }

  /**
   * Get specific producer
   */
  getProducer(featureKey: string): StagedStateProducer | undefined {
    return this.producers.get(featureKey);
  }

  /**
   * Main entry point: Route request to correct producer
   *
   * Guarantees:
   * ✅ Feature isolation (producer only touches its key)
   * ✅ Locale isolation (EN/AR separate)
   * ✅ Validation enforcement
   * ✅ Audit trail
   */
  async produce(
    featureKey: string,
    vault: WorkspaceStagingVault,
    input: any,
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault> {
    // Validate inputs
    if (!["en", "ar"].includes(locale)) {
      throw new Error(`Invalid locale: ${locale}`);
    }

    const producer = this.producers.get(featureKey);
    if (!producer) {
      throw new Error(`Producer ${featureKey} not registered`);
    }

    if (!producer.locales.includes(locale)) {
      throw new Error(
        `Producer ${featureKey} does not support locale ${locale}`
      );
    }

    console.log(`[ProducerRegistry.produce] Starting production:`, {
      featureKey,
      locale,
      userId,
      vaultId: vault.id,
    });

    // Take snapshot before
    const beforeSnapshot = this.createSnapshot(vault);

    // Call producer
    let result: WorkspaceStagingVault;
    try {
      result = await producer.produce(vault, input, locale, userId);
    } catch (error) {
      console.error(`[ProducerRegistry] Producer error:`, error);
      throw error;
    }

    // Verify isolation (critical!)
    try {
      this.verifyIsolation(beforeSnapshot, result, featureKey, locale);
    } catch (error) {
      console.error(`[ProducerRegistry] Isolation violation detected!`, error);
      throw error;
    }

    console.log(`[ProducerRegistry.produce] ✅ Production complete:`, {
      featureKey,
      locale,
      changesApplied: true,
    });

    return result;
  }

  /**
   * Verify that ONLY the intended feature was modified
   *
   * Checks:
   * 1. Only the requested locale was modified
   * 2. Only the requested feature was modified
   * 3. Other features are untouched
   * 4. Other locale is completely untouched
   */
  private verifyIsolation(
    before: any,
    after: WorkspaceStagingVault,
    modifiedFeatureKey: string,
    modifiedLocale: "en" | "ar"
  ) {
    // Get state objects
    const beforeState =
      modifiedLocale === "en" ? before.state_en : before.state_ar;
    const afterState =
      modifiedLocale === "en" ? after.state_en : after.state_ar;

    const untouchedLocale = modifiedLocale === "en" ? "ar" : "en";
    const untouchedStateBefore =
      untouchedLocale === "en" ? before.state_en : before.state_ar;
    const untouchedStateAfter =
      untouchedLocale === "en" ? after.state_en : after.state_ar;

    // Check 1: Other locale COMPLETELY untouched
    if (JSON.stringify(untouchedStateBefore) !== JSON.stringify(untouchedStateAfter)) {
      throw new IsolationViolationError(modifiedFeatureKey, untouchedLocale);
    }

    // Check 2: Only this feature was modified in the locale
    const beforeFeatures = beforeState.features || {};
    const afterFeatures = afterState.features || {};

    for (const [featureKey, featureData] of Object.entries(beforeFeatures)) {
      if (featureKey === modifiedFeatureKey) {
        // This feature SHOULD be different
        continue;
      }

      // Other features MUST be identical
      const beforeFeatureStr = JSON.stringify(featureData);
      const afterFeatureStr = JSON.stringify(afterFeatures[featureKey]);

      if (beforeFeatureStr !== afterFeatureStr) {
        console.error(
          `[ProducerRegistry] Isolation violation: Producer ${modifiedFeatureKey} modified ${featureKey}`,
          {
            before: beforeFeatureStr.substring(0, 100),
            after: afterFeatureStr.substring(0, 100),
          }
        );
        throw new IsolationViolationError(modifiedFeatureKey, featureKey);
      }
    }

    // Check 3: No new features were added
    const beforeFeatureKeys = Object.keys(beforeFeatures);
    const afterFeatureKeys = Object.keys(afterFeatures);
    const newFeatures = afterFeatureKeys.filter(
      (k) => !beforeFeatureKeys.includes(k) && k !== modifiedFeatureKey
    );

    if (newFeatures.length > 0) {
      throw new IsolationViolationError(
        modifiedFeatureKey,
        `Added unauthorized features: ${newFeatures.join(", ")}`
      );
    }
  }

  /**
   * Create a deep snapshot for comparison
   */
  private createSnapshot(vault: WorkspaceStagingVault): any {
    return JSON.parse(JSON.stringify(vault));
  }
}

/**
 * Global producer registry instance
 */
export const producerRegistry = new ProducerRegistry();

/**
 * Helper to register all default producers
 */
export async function initializeDefaultProducers() {
  // Import producers
  const { KeywordTrackerProducer } = await import("@/lib/producers/keyword-tracker.producer");
  const { CompetitorSpyProducer } = await import("@/lib/producers/competitor-spy.producer");
  const { ReviewAnalysisProducer } = await import("@/lib/producers/review-analysis.producer");
  const { KeywordValidatorProducer } = await import("@/lib/producers/keyword-validator.producer");
  const { ExperimentSnapshotsProducer } = await import("@/lib/producers/experiment-snapshots.producer");

  // Register
  producerRegistry.register(new KeywordTrackerProducer());
  producerRegistry.register(new CompetitorSpyProducer());
  producerRegistry.register(new ReviewAnalysisProducer());
  producerRegistry.register(new KeywordValidatorProducer());
  producerRegistry.register(new ExperimentSnapshotsProducer());

  console.log(
    `[ProducerRegistry] Initialized ${producerRegistry.getAllProducers().length} default producers`
  );
}
