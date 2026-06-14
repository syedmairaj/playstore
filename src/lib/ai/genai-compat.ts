/**
 * Request shape for ModelGateway generateContent calls.
 */

export type GenerateContentRequest = {
  contents?: unknown;
  generationConfig?: Record<string, unknown>;
};
