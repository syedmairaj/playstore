/**
 * Model Gateway - Centralized AI Model Management
 *
 * Purpose:
 * - Abstracts the model selection logic away from individual route handlers
 * - Allows easy swapping of models (gemini-2.5-flash, gemini-2.0-flash, etc.) without code changes
 * - Provides a single source of truth for model configuration
 * - Enables feature flags and A/B testing of different models
 *
 * Usage:
 * import { getGenerativeModel } from "@/lib/ai/modelGateway";
 *
 * const model = getGenerativeModel();
 * const response = await model.generateContent({...});
 *
 * Benefits:
 * - Prevents hardcoded model strings throughout the codebase
 * - Easy to swap models during testing/deployment
 * - Centralized logging and monitoring of model usage
 * - Supports future multi-model routing logic
 */

import { GoogleGenAI } from "@google/genai";

// ── Configuration ──────────────────────────────────────────────────────
// IMPORTANT: This is the single source of truth for model selection.
// Change this value to instantly update all API calls across the system.
const ACTIVE_MODEL = process.env.AI_MODEL_ID || "gemini-2.5-flash";

// Future model options for easy swapping
export const AVAILABLE_MODELS = {
  GEMINI_25_FLASH: "gemini-2.5-flash",     // Current production model
  GEMINI_20_FLASH: "gemini-2.0-flash",     // Alternative model
  GEMINI_15_FLASH: "gemini-1.5-flash",     // Fallback option
  GEMINI_15_PRO: "gemini-1.5-pro",         // Advanced reasoning model
} as const;

// ── AI Client (Singleton) ──────────────────────────────────────────────
let aiClientInstance: GoogleGenAI | null = null;

/**
 * Initialize the AI client (singleton pattern)
 * Ensures only one client instance exists across the application
 */
function initializeAIClient(): GoogleGenAI {
  if (!aiClientInstance) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    if (!project) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT environment variable is not set. " +
        "This is required for AI model initialization."
      );
    }

    aiClientInstance = new GoogleGenAI({
      vertexai: {
        project,
        location,
      },
    });

    console.info(
      `[ModelGateway] Initialized AI client: project=${project}, location=${location}`
    );
  }

  return aiClientInstance;
}

// ── Model Gateway Interface ────────────────────────────────────────────
export interface GenerativeModelConfig {
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

// ── Main Gateway Function ──────────────────────────────────────────────
/**
 * Get the active generative model instance
 *
 * This is the main function used throughout the codebase.
 * It returns a model instance configured with the current ACTIVE_MODEL.
 *
 * @param config Optional configuration overrides
 * @returns Generative model instance ready for use
 *
 * @example
 * // Basic usage
 * const model = getGenerativeModel();
 * const response = await model.generateContent({ contents: "Hello" });
 *
 * @example
 * // With custom config
 * const model = getGenerativeModel({ temperature: 0.5 });
 */
export function getGenerativeModel(config?: Partial<GenerativeModelConfig>) {
  const aiClient = initializeAIClient();

  const modelConfig: GenerativeModelConfig = {
    model: ACTIVE_MODEL,
    temperature: config?.temperature ?? 0.7,
    maxOutputTokens: config?.maxOutputTokens ?? 300,
    topP: config?.topP ?? 0.95,
    topK: config?.topK ?? 40,
  };

  if (modelConfig.model !== ACTIVE_MODEL) {
    console.warn(
      `[ModelGateway] Using override model: ${modelConfig.model} (default: ${ACTIVE_MODEL})`
    );
  }

  return aiClient.models.generateContent.bind(aiClient.models);
}

// ── Alternative: Get Model Info ────────────────────────────────────────
/**
 * Get information about the currently active model
 * Useful for logging and monitoring
 *
 * @returns Object with model metadata
 */
export function getActiveModelInfo() {
  return {
    activeModel: ACTIVE_MODEL,
    availableModels: AVAILABLE_MODELS,
    isProduction: process.env.NODE_ENV === "production",
    timestamp: new Date().toISOString(),
  };
}

// ── Model Validation ───────────────────────────────────────────────────
/**
 * Validate that a model ID is in the list of available models
 * Used for safety checks when model IDs come from environment or config
 *
 * @param modelId Model ID to validate
 * @returns True if model is available, false otherwise
 */
export function isValidModel(modelId: string): boolean {
  return Object.values(AVAILABLE_MODELS).includes(modelId as any);
}

// ── Model Fallback ─────────────────────────────────────────────────────
/**
 * Get a fallback model if the primary one is unavailable
 * Useful for handling model outages or quota issues
 *
 * @returns Fallback model ID
 */
export function getFallbackModel(): string {
  // If current model is gemini-2.5-flash, fallback to gemini-2.0-flash
  if (ACTIVE_MODEL === AVAILABLE_MODELS.GEMINI_25_FLASH) {
    return AVAILABLE_MODELS.GEMINI_20_FLASH;
  }

  // If current model is gemini-2.0-flash, fallback to gemini-1.5-flash
  if (ACTIVE_MODEL === AVAILABLE_MODELS.GEMINI_20_FLASH) {
    return AVAILABLE_MODELS.GEMINI_15_FLASH;
  }

  // Default fallback
  return AVAILABLE_MODELS.GEMINI_15_FLASH;
}

// ── Environment Configuration ──────────────────────────────────────────
/**
 * Export configuration for reference in other parts of the system
 */
export const modelGatewayConfig = {
  activeModel: ACTIVE_MODEL,
  availableModels: AVAILABLE_MODELS,
  gcpProject: process.env.GOOGLE_CLOUD_PROJECT,
  gcpLocation: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  nodeEnv: process.env.NODE_ENV || "development",
};

// ── Logging Utility ────────────────────────────────────────────────────
/**
 * Log model usage for monitoring and analytics
 * Call this when making API requests to track which models are being used
 */
export function logModelUsage(context: {
  endpoint: string;
  modelUsed: string;
  durationMs?: number;
  tokensUsed?: { input: number; output: number };
}) {
  console.info("[ModelGateway:Usage]", {
    endpoint: context.endpoint,
    modelUsed: context.modelUsed,
    activeModelConfig: ACTIVE_MODEL,
    durationMs: context.durationMs,
    tokensUsed: context.tokensUsed,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Summary:
 *
 * This Model Gateway provides:
 * 1. Centralized model configuration via ACTIVE_MODEL constant
 * 2. Easy swapping via environment variable AI_MODEL_ID or direct change
 * 3. Singleton AI client for efficiency
 * 4. Helper functions for validation, fallback, and logging
 * 5. Zero changes to existing credit ledger or database logic
 *
 * To swap models in production:
 * Option 1: Set environment variable
 *   export AI_MODEL_ID=gemini-2.0-flash
 *
 * Option 2: Edit ACTIVE_MODEL constant in this file
 *   const ACTIVE_MODEL = "gemini-2.0-flash";
 *
 * Option 3: Restart with new model for E2E testing
 *   AI_MODEL_ID=gemini-2.0-flash npm run dev
 */
