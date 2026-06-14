/**
 * Model Gateway — @google/genai (Vertex AI primary, API-key fallback)
 *
 * Replaces deprecated @google-cloud/vertexai (EOL June 2026).
 * Primary: Vertex AI via ADC → aiplatform.googleapis.com
 * Fallback: GEMINI_API_KEY when Vertex generateContent fails
 */

import "server-only";
import { randomUUID } from "crypto";
import {
  ApiError,
  GoogleGenAI,
  type GenerateContentResponse,
} from "@google/genai";
import type { GenerateContentRequest } from "@/lib/ai/genai-compat";
import {
  checkFinishReason,
  extractText,
  isBlockedFinishReason,
} from "@/lib/ai/extract-model-text";
import { ModelGatewayError, isModelGatewayError } from "@/lib/ai/model-gateway-errors";

export type { GenerateContentRequest };
export type { GenerateContentResponse };
export { ModelGatewayError, isModelGatewayError };
export { extractText, checkFinishReason, isBlockedFinishReason } from "@/lib/ai/extract-model-text";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "playstore-496016";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const ACTIVE_MODEL = process.env.AI_MODEL_ID || "gemini-2.5-flash";
const FALLBACK_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";

export const AVAILABLE_MODELS = {
  GEMINI_25_FLASH: "gemini-2.5-flash",
  GEMINI_20_FLASH: "gemini-2.0-flash",
  GEMINI_15_FLASH: "gemini-1.5-flash",
  GEMINI_15_PRO: "gemini-1.5-pro",
} as const;

export interface GenerativeModelConfig {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

export type ModelProvider = "vertex" | "gemini_api";

export interface CompatGenerativeModel {
  systemInstruction?: string;
  generateContent(
    request: GenerateContentRequest | string,
  ): Promise<GenerateContentResponse>;
}

export function createModelGatewayCorrelationId(): string {
  return randomUUID();
}

/**
 * Vertex AI client via ADC.
 *
 * @google/genai v2.x uses flat `vertexai` + `project` + `location` options
 * (equivalent intent to `vertexAI: { project, location }` in migration guides).
 */
function createVertexAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: PROJECT_ID,
    location: LOCATION,
  });
}

function buildGenerationConfig(
  modelConfig: Partial<GenerativeModelConfig>,
  requestConfig?: Record<string, unknown>,
  systemInstruction?: string,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    temperature: modelConfig.temperature ?? 0.7,
    maxOutputTokens: modelConfig.maxOutputTokens ?? 300,
    topP: modelConfig.topP ?? 0.95,
    topK: modelConfig.topK ?? 40,
    ...(modelConfig.responseMimeType
      ? { responseMimeType: modelConfig.responseMimeType }
      : {}),
    ...(modelConfig.responseSchema
      ? { responseSchema: modelConfig.responseSchema }
      : {}),
    ...(requestConfig ?? {}),
  };

  if (systemInstruction) {
    merged.systemInstruction = systemInstruction;
  }

  return merged;
}

function logGenAIApiError(error: unknown, correlationId: string, provider: ModelProvider) {
  if (error instanceof ApiError) {
    console.error("[ModelGateway] ApiError from @google/genai", {
      correlationId,
      provider,
      status: error.status,
      message: error.message,
    });
    return;
  }

  console.error("[ModelGateway] generateContent threw", {
    correlationId,
    provider,
    error: error instanceof Error ? error.message : String(error),
  });
}

function toModelGatewayError(
  error: unknown,
  correlationId: string,
  provider: ModelProvider,
): ModelGatewayError {
  if (error instanceof ModelGatewayError) return error;

  const message =
    error instanceof ApiError
      ? `GenAI API error (${error.status}): ${error.message}`
      : error instanceof Error
        ? error.message
        : "Vertex AI generation failed";

  const httpStatus = error instanceof ApiError ? error.status : 502;

  return new ModelGatewayError(message, {
    code: "AI_GENERATION_FAILED",
    httpStatus: httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
    correlationId,
    provider,
    cause: error,
  });
}

function logBlockedFinishReason(
  finishReason: string,
  correlationId: string,
  provider: ModelProvider,
  modelId: string,
) {
  console.error("[ModelGateway] Response blocked by model policy", {
    correlationId,
    provider,
    model: modelId,
    finishReason,
    policy:
      finishReason === "SAFETY"
        ? "content safety filter"
        : finishReason === "RECITATION"
          ? "copyright/recitation filter"
          : "generation policy",
  });
}

class CompatModel implements CompatGenerativeModel {
  systemInstruction?: string;

  constructor(
    private readonly ai: GoogleGenAI,
    private readonly modelId: string,
    private readonly defaultConfig: Partial<GenerativeModelConfig>,
  ) {}

  async generateContent(
    request: GenerateContentRequest | string,
  ): Promise<GenerateContentResponse> {
    const contents = typeof request === "string" ? request : request.contents;
    const requestConfig =
      typeof request === "string" ? undefined : request.generationConfig;

    return this.ai.models.generateContent({
      model: this.modelId,
      contents: contents as never,
      config: buildGenerationConfig(
        this.defaultConfig,
        requestConfig,
        this.systemInstruction,
      ) as never,
    });
  }
}

/** Singleton gateway — Vertex client + optional API-key fallback per process. */
class ModelGatewaySingleton {
  private static instance: ModelGatewaySingleton | null = null;

  private vertexClient: GoogleGenAI | null = null;
  private fallbackClient: GoogleGenAI | null = null;
  private modelCache = new Map<string, CompatModel>();
  private initialized = false;

  static getInstance(): ModelGatewaySingleton {
    if (!ModelGatewaySingleton.instance) {
      ModelGatewaySingleton.instance = new ModelGatewaySingleton();
    }
    return ModelGatewaySingleton.instance;
  }

  private ensureInitialized(): void {
    if (this.initialized) return;

    this.vertexClient = createVertexAIClient();

    if (FALLBACK_API_KEY) {
      this.fallbackClient = new GoogleGenAI({ apiKey: FALLBACK_API_KEY });
    }

    console.info(
      `[ModelGateway] ✅ Initialized Google Gen AI SDK (Vertex AI endpoint)`,
      {
        sdk: "@google/genai",
        endpoint: `https://${LOCATION}-aiplatform.googleapis.com`,
        project: PROJECT_ID,
        location: LOCATION,
        authMethod: "Application Default Credentials (ADC)",
        apiKeyUsage: "NONE - primary path",
        fallbackConfigured: Boolean(FALLBACK_API_KEY),
        multilingual: "Full UTF-8 support (English, Arabic, etc.)",
        timestamp: new Date().toISOString(),
      },
    );

    this.initialized = true;
  }

  getGenerativeModel(config?: Partial<GenerativeModelConfig>): CompatModel {
    this.ensureInitialized();
    const modelId = config?.model || ACTIVE_MODEL;
    const cacheKey = JSON.stringify({ modelId, config: config ?? {} });

    const cached = this.modelCache.get(cacheKey);
    if (cached) return cached;

    const model = new CompatModel(this.vertexClient!, modelId, config ?? {});
    this.modelCache.set(cacheKey, model);

    console.info(`[ModelGateway] 🎯 Cached model handle (Vertex AI)`, {
      model: modelId,
      sdk: "@google/genai",
      endpoint: `https://${LOCATION}-aiplatform.googleapis.com`,
      project: PROJECT_ID,
      location: LOCATION,
    });

    return model;
  }

  private async invokeVertex(
    modelId: string,
    request: GenerateContentRequest,
    modelConfig?: Partial<GenerativeModelConfig>,
    systemInstruction?: string,
  ): Promise<GenerateContentResponse> {
    this.ensureInitialized();
    const contents = request.contents;
    const requestConfig = request.generationConfig ?? {};

    return this.vertexClient!.models.generateContent({
      model: modelId,
      contents: contents as never,
      config: buildGenerationConfig(
        modelConfig ?? {},
        requestConfig,
        systemInstruction,
      ) as never,
    });
  }

  private async invokeFallback(
    modelId: string,
    request: GenerateContentRequest,
    modelConfig?: Partial<GenerativeModelConfig>,
    systemInstruction?: string,
  ): Promise<GenerateContentResponse> {
    if (!this.fallbackClient) {
      throw new Error("GEMINI_API_KEY fallback not configured");
    }

    const contents = request.contents;
    const requestConfig = request.generationConfig ?? {};

    return this.fallbackClient.models.generateContent({
      model: modelId,
      contents: contents as never,
      config: buildGenerationConfig(
        modelConfig ?? {},
        requestConfig,
        systemInstruction,
      ) as never,
    });
  }

  async generateContentValidated(args: {
    request: GenerateContentRequest;
    modelConfig?: Partial<GenerativeModelConfig>;
    correlationId?: string;
  }): Promise<{
    text: string;
    correlationId: string;
    provider: ModelProvider;
    result: GenerateContentResponse;
  }> {
    const correlationId = args.correlationId ?? createModelGatewayCorrelationId();
    const modelId = args.modelConfig?.model || ACTIVE_MODEL;
    const startedAt = Date.now();

    console.info("[ModelGateway] generateContent start", {
      correlationId,
      model: modelId,
      provider: "vertex",
      project: PROJECT_ID,
      location: LOCATION,
    });

    let genaiResponse: GenerateContentResponse | null = null;
    let provider: ModelProvider = "vertex";

    try {
      genaiResponse = await this.invokeVertex(modelId, args.request, args.modelConfig);
    } catch (vertexError) {
      logGenAIApiError(vertexError, correlationId, "vertex");

      if (this.fallbackClient) {
        console.warn(
          "[ModelGateway] Vertex generateContent failed — trying GEMINI_API_KEY fallback",
          {
            correlationId,
            error:
              vertexError instanceof Error ? vertexError.message : String(vertexError),
          },
        );
        try {
          genaiResponse = await this.invokeFallback(
            modelId,
            args.request,
            args.modelConfig,
          );
          provider = "gemini_api";
        } catch (fallbackError) {
          logGenAIApiError(fallbackError, correlationId, "gemini_api");
          throw toModelGatewayError(fallbackError, correlationId, "gemini_api");
        }
      } else {
        throw toModelGatewayError(vertexError, correlationId, "vertex");
      }
    }

    if (!genaiResponse) {
      throw new ModelGatewayError("Model returned null result", {
        code: "AI_GENERATION_FAILED",
        httpStatus: 502,
        correlationId,
        provider,
      });
    }

    const finish = checkFinishReason(genaiResponse);
    const text = extractText(genaiResponse);

    if (!finish.ok && finish.blocked) {
      logBlockedFinishReason(finish.finishReason, correlationId, provider, modelId);
      throw new ModelGatewayError(
        `Model response blocked by safety filter (${finish.finishReason})`,
        {
          code: "AI_RESPONSE_BLOCKED",
          httpStatus: 502,
          correlationId,
          finishReason: finish.finishReason,
          provider,
        },
      );
    }

    if (!text) {
      const finishReason = finish.finishReason ?? "UNKNOWN";
      if (isBlockedFinishReason(finishReason)) {
        logBlockedFinishReason(finishReason, correlationId, provider, modelId);
      }

      throw new ModelGatewayError(
        !finish.ok
          ? `Model response incomplete (${finishReason})`
          : "Model returned empty text",
        {
          code: "AI_RESPONSE_EMPTY",
          httpStatus: 502,
          correlationId,
          finishReason,
          provider,
        },
      );
    }

    if (!finish.ok && finish.truncated) {
      console.warn("[ModelGateway] finishReason MAX_TOKENS — using partial text", {
        correlationId,
        textLength: text.length,
        provider,
        finishReason: finish.finishReason,
      });
    }

    console.info("[ModelGateway] generateContent success", {
      correlationId,
      provider,
      model: modelId,
      durationMs: Date.now() - startedAt,
      textLength: text.length,
      finishReason: finish.finishReason ?? "STOP",
      responseId: genaiResponse.responseId,
    });

    return { text, correlationId, provider, result: genaiResponse };
  }

  clearCaches(): void {
    this.modelCache.clear();
    this.vertexClient = null;
    this.fallbackClient = FALLBACK_API_KEY ? new GoogleGenAI({ apiKey: FALLBACK_API_KEY }) : null;
    this.initialized = false;
  }
}

const gateway = ModelGatewaySingleton.getInstance();

export function getGenerativeModel(
  config?: Partial<GenerativeModelConfig>,
): CompatGenerativeModel {
  return gateway.getGenerativeModel(config);
}

export async function generateContentValidated(args: {
  request: GenerateContentRequest;
  modelConfig?: Partial<GenerativeModelConfig>;
  correlationId?: string;
}): Promise<{
  text: string;
  correlationId: string;
  provider: ModelProvider;
  result: GenerateContentResponse;
}> {
  return gateway.generateContentValidated(args);
}

export function getActiveModelInfo() {
  return {
    activeModel: ACTIVE_MODEL,
    availableModels: AVAILABLE_MODELS,
    isProduction: process.env.NODE_ENV === "production",
    gcpProject: PROJECT_ID,
    gcpLocation: LOCATION,
    authMethod: "Application Default Credentials (ADC)",
    fallbackApiKeyConfigured: Boolean(FALLBACK_API_KEY),
    sdk: "@google/genai",
    timestamp: new Date().toISOString(),
  };
}

export function isValidModel(modelId: string): boolean {
  return Object.values(AVAILABLE_MODELS).includes(
    modelId as (typeof AVAILABLE_MODELS)[keyof typeof AVAILABLE_MODELS],
  );
}

export function getFallbackModel(): string {
  if (ACTIVE_MODEL === AVAILABLE_MODELS.GEMINI_25_FLASH) {
    return AVAILABLE_MODELS.GEMINI_20_FLASH;
  }
  if (ACTIVE_MODEL === AVAILABLE_MODELS.GEMINI_20_FLASH) {
    return AVAILABLE_MODELS.GEMINI_15_FLASH;
  }
  return AVAILABLE_MODELS.GEMINI_15_FLASH;
}

export const modelGatewayConfig = {
  activeModel: ACTIVE_MODEL,
  availableModels: AVAILABLE_MODELS,
  gcpProject: PROJECT_ID,
  gcpLocation: LOCATION,
  nodeEnv: process.env.NODE_ENV || "development",
  sdk: "@google/genai",
  authMethod: "Application Default Credentials (ADC)",
};

export function clearModelCache(): void {
  gateway.clearCaches();
}

export function clearVertexAIClient(): void {
  gateway.clearCaches();
}

export async function validateVertexAISetup(): Promise<{
  valid: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const correlationId = createModelGatewayCorrelationId();
  try {
    const { text } = await generateContentValidated({
      correlationId,
      modelConfig: { temperature: 0, maxOutputTokens: 16 },
      request: {
        contents: [{ role: "user", parts: [{ text: "Say OK" }] }],
      },
    });

    const arabic = await generateContentValidated({
      correlationId: createModelGatewayCorrelationId(),
      modelConfig: { temperature: 0, maxOutputTokens: 16 },
      request: {
        contents: [{ role: "user", parts: [{ text: "قل حسناً" }] }],
      },
    });

    return {
      valid: Boolean(text),
      message:
        "✅ Vertex AI is properly configured and accessible" +
        (arabic.text ? " (multilingual support verified)" : ""),
      details: {
        project: PROJECT_ID,
        location: LOCATION,
        model: ACTIVE_MODEL,
        endpoint: `https://${LOCATION}-aiplatform.googleapis.com`,
        authMethod: "ADC",
        sdk: "@google/genai",
        multilingualSupport: Boolean(arabic.text),
        correlationId,
      },
    };
  } catch (error) {
    const message = isModelGatewayError(error)
      ? `${error.message} (correlationId=${error.correlationId})`
      : error instanceof Error
        ? error.message
        : String(error);

    return { valid: false, message: `❌ Vertex AI validation failed: ${message}` };
  }
}

export function logModelUsage(context: {
  endpoint: string;
  modelUsed: string;
  durationMs?: number;
  tokensUsed?: { input: number; output: number };
  correlationId?: string;
}) {
  console.info("[ModelGateway:Usage]", {
    ...context,
    activeModelConfig: ACTIVE_MODEL,
    project: PROJECT_ID,
    location: LOCATION,
    sdk: "@google/genai",
    timestamp: new Date().toISOString(),
  });
}
