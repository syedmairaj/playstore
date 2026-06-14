/**
 * Typed errors for ModelGateway — API routes map these to clean HTTP responses.
 */

export type ModelGatewayErrorCode =
  | "AI_GENERATION_FAILED"
  | "AI_RESPONSE_BLOCKED"
  | "AI_RESPONSE_EMPTY"
  | "AI_PROVIDER_UNAVAILABLE";

export class ModelGatewayError extends Error {
  readonly code: ModelGatewayErrorCode;
  readonly httpStatus: number;
  readonly correlationId: string;
  readonly finishReason?: string;
  readonly provider?: string;

  constructor(
    message: string,
    options: {
      code?: ModelGatewayErrorCode;
      httpStatus?: number;
      correlationId: string;
      finishReason?: string;
      provider?: string;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ModelGatewayError";
    this.code = options.code ?? "AI_GENERATION_FAILED";
    this.httpStatus = options.httpStatus ?? 502;
    this.correlationId = options.correlationId;
    this.finishReason = options.finishReason;
    this.provider = options.provider;
  }
}

export function isModelGatewayError(error: unknown): error is ModelGatewayError {
  return error instanceof ModelGatewayError;
}
