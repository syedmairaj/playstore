import "server-only";
import type { ZodError } from "zod";

export type InvalidModelOutputOptions = {
  zodError?: ZodError;
  /** Model hit MAX_TOKENS / LENGTH — output may be partial JSON. */
  truncated?: boolean;
  finishReason?: string;
};

/** Thrown when Gemini JSON fails schema validation after server-side length clamping. */
export class InvalidModelOutputError extends Error {
  readonly code = "invalid_model_output" as const;
  readonly truncated: boolean;
  readonly finishReason?: string;

  constructor(
    message: string,
    zodErrorOrOptions?: ZodError | InvalidModelOutputOptions,
    legacyOptions?: InvalidModelOutputOptions,
  ) {
    super(message);
    this.name = "InvalidModelOutputError";

    const options: InvalidModelOutputOptions | undefined =
      zodErrorOrOptions && "issues" in zodErrorOrOptions
        ? { zodError: zodErrorOrOptions, ...legacyOptions }
        : (zodErrorOrOptions as InvalidModelOutputOptions | undefined);

    this.zodError = options?.zodError;
    this.truncated = options?.truncated === true;
    this.finishReason = options?.finishReason;
  }

  readonly zodError?: ZodError;

  get apiErrorCode(): "truncated_model_output" | "invalid_model_output" {
    return this.truncated ? "truncated_model_output" : "invalid_model_output";
  }
}
