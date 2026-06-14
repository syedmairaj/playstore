/**
 * Universal Staged-State Architecture - Main Exports
 *
 * Core infrastructure for unlimited feature scaling with strict isolation.
 * All exports maintain backward compatibility with existing system.
 */

// Type definitions
export {
  WorkspaceStagingVault,
  StagingState,
  StateMetadata,
  StagedStateProducer,
  ProducerRequest,
  ProducerResponse,
  SynthesisContext,
  SynthesisOutput,
  SynthesisContextConfig,
  IsolationViolationError,
  ValidationError,
} from "./vault.types";

// Producer registry (isolation enforcer)
export {
  ProducerRegistry,
  producerRegistry,
  initializeDefaultProducers,
} from "./producer-registry";

// Vault router (request routing)
export { VaultRouterService, vaultRouter } from "./vault-router";

// Centralized vault writes (schema-aware)
export { VaultCore } from "@/lib/staging-vault/vault-core";
export type { VaultUpsertPayload, VaultUpsertResult } from "@/lib/staging-vault/vault-core.types";

// Synthesis context builder (token-aware)
export { SynthesisContextBuilder, synthesisContextBuilder } from "./synthesis-context-builder";

// Version for compatibility tracking
export const STAGED_STATE_VERSION = "1.0";
export const STABLE = true;
