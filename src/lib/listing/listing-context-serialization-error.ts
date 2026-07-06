import "server-only";

export class ListingContextSerializationError extends Error {
  readonly code = "context_serialization_failed" as const;

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ListingContextSerializationError";
  }
}

/** Fail fast before platform timeout when request context cannot be serialized. */
export function assertListingRequestSerializable(
  payload: unknown,
  label = "listing_generate_request",
): void {
  try {
    JSON.stringify(payload);
  } catch (error) {
    throw new ListingContextSerializationError(
      `${label} exceeded safe serialization limits. Reduce active context payload and retry.`,
      error,
    );
  }
}
