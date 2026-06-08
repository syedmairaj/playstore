import "server-only";
import type { ZodError } from "zod";

/** Thrown when Gemini JSON fails schema validation after server-side length clamping. */
export class InvalidModelOutputError extends Error {
  readonly code = "invalid_model_output" as const;

  constructor(
    message: string,
    public readonly zodError?: ZodError,
  ) {
    super(message);
    this.name = "InvalidModelOutputError";
  }
}
