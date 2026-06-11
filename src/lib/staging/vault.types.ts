/**
 * Universal Staged-State Architecture - Type Definitions
 *
 * Core types for workspace_staging_vault
 * Enables unlimited feature expansion with strict isolation
 */

// json-schema-to-ts is not installed — schema field typed as `any` below

/**
 * Core Vault Record
 * Represents a single app's staging state across all features
 */
export interface WorkspaceStagingVault {
  id: string; // UUID
  workspace_id: string; // UUID
  app_id: string; // UUID

  // Bilingual isolated state
  state_en: StagingState; // English feature data
  state_ar: StagingState; // Arabic feature data

  // Metadata
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;

  // Audit
  last_modified_by: string; // User UUID
  change_count: number; // Total updates
  active_features: string[]; // List of features with data

  // Soft delete
  is_deleted: boolean;
}

/**
 * Single Locale's Feature State
 * Both EN and AR follow this structure (isolated data)
 */
export interface StagingState {
  features: Record<string, any>; // feature_key -> feature_data
  metadata: StateMetadata;
}

/**
 * Metadata about the state itself
 */
export interface StateMetadata {
  workspace_id: string;
  app_id: string;
  locale: "en" | "ar";
  schema_version: string;
  last_producer: string; // Feature key of last producer
  last_producer_timestamp: string; // ISO timestamp
  feature_count: number; // Number of active features
  total_bytes: number; // Approximate JSONB size
  dirty_flags: Record<string, boolean>; // Which features need sync
}

/**
 * Producer Interface - All features implement this
 */
export interface StagedStateProducer {
  // Unique identifier (becomes key in features{})
  readonly featureKey: string;

  // Which locales this producer supports
  readonly locales: ("en" | "ar")[];

  // JSON Schema for validation
  readonly schema: any; // JSONSchema

  // Main method: Produce and update vault
  produce(
    vault: WorkspaceStagingVault,
    input: any,
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault>;

  // Validate data before update
  validate(data: any): Promise<boolean>;

  // Optional: Cleanup old data
  cleanup?(vault: WorkspaceStagingVault): Promise<void>;
}

/**
 * Producer request (routed through VaultRouterService)
 */
export interface ProducerRequest {
  locale: "en" | "ar";
  userId: string;
  workspaceId: string;
  appId: string;
  feature: string; // Feature key
  payload: any; // Feature-specific data
}

/**
 * Producer response (feature data from vault)
 */
export interface ProducerResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Synthesis context (built from vault state)
 */
export interface SynthesisContext {
  app: {
    appId: string;
    workspaceId: string;
    locale: "en" | "ar";
  };

  // Priority 1: Keywords (validator / Keyword Tracker first)
  stagedKeywords: Array<{
    term: string;
    difficulty: number;
    volume: number;
    confidence?: number;
    rank_position?: number;
    source?: "validator" | "tracker";
    tier?: "high" | "medium" | "low";
  }>;

  // Priority 2: Competitors
  competitorInsights: Array<{
    competitor: string;
    weaknesses: string[];
    ourOpportunities: string[];
  }>;

  // Priority 3: Reviews
  reviewInsights: {
    summary: {
      total_reviews: number;
      avg_rating: number;
      trend: string;
    };
    positiveThemes: Array<{
      theme: string;
      count: number;
      keywords: string[];
    }>;
    improvements: Array<{
      issue: string;
      count: number;
      suggestedFix?: string;
    }>;
  };

  // Priority 4: Validator
  validatorScore?: {
    confidence: number;
    recommendation: string;
  };

  // Priority 5: Baseline
  baselineSnapshot?: {
    title: string;
    short_description: string;
    full_description: string;
  };

  // Priority 6: Feedback
  feedbackSummary: Array<{
    theme: string;
    count: number;
  }>;

  // Metadata
  metadata: {
    featuresPresent: string[];
    synthesisDate: string;
    locale: "en" | "ar";
    estimatedTokens: number;
  };
}

/**
 * Synthesis output
 */
export interface SynthesisOutput {
  title: string;
  shortDescription: string;
  fullDescription: string;
  ctaButton: string;
  strategy: string;
  asoScore: number;
}

/**
 * Configuration for context builder
 */
export interface SynthesisContextConfig {
  maxTokens?: number; // Default 6000
  maxKeywords?: number; // Default 20
  maxCompetitors?: number; // Default 5
  maxThemes?: number; // Default 5
  prioritizeHighDifficulty?: boolean; // Default false
}

/**
 * Isolation violation error
 */
export class IsolationViolationError extends Error {
  constructor(public producerId: string, public violatedFeatureKey: string) {
    super(
      `Producer ${producerId} attempted to modify feature ${violatedFeatureKey}`
    );
    this.name = "IsolationViolationError";
  }
}

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(
    public featureKey: string,
    public errors: any
  ) {
    super(`Validation failed for feature ${featureKey}`);
    this.name = "ValidationError";
  }
}
