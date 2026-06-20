import "server-only";

/** Thrown when generation + repair + self-correction are all exhausted. */
export class ListingGenerationUnavailableError extends Error {
  readonly code = "generation_unavailable" as const;

  constructor(
    message = "The listing could not be generated at this time. Please try again.",
  ) {
    super(message);
    this.name = "ListingGenerationUnavailableError";
  }
}
