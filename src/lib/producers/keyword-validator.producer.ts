/**
 * Keyword Validator Producer — stub
 * Full implementation pending. Exports the class name so webpack
 * can resolve the dynamic import in producer-registry.ts.
 *
 * Owns: state_{locale}.features.keyword_validator.*
 * Boundary enforced by ProducerRegistry.verifyIsolation()
 */
import { StagedStateProducer, WorkspaceStagingVault } from "@/lib/staging/vault.types";

export class KeywordValidatorProducer implements StagedStateProducer {
  readonly featureKey = "keyword_validator";
  readonly locales: ("en" | "ar")[] = ["en", "ar"];
  readonly schema = {};

  async produce(vault: WorkspaceStagingVault, _input: unknown, locale: "en" | "ar", userId: string): Promise<WorkspaceStagingVault> {
    return { ...vault, last_modified_by: userId, change_count: vault.change_count + 1, updated_at: new Date() };
  }

  async validate(_data: unknown): Promise<boolean> { return true; }
}
