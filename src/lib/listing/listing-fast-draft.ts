/** Sync full unlock can exceed 3 min (Gemini + DB). Align with route maxDuration (300s) + body download buffer. */
export const LISTING_GENERATION_TIMEOUT_MS = 330_000;

/** @deprecated Use LISTING_GENERATION_TIMEOUT_MS */
export const SIGNAL_ENHANCEMENT_TIMEOUT_MS = LISTING_GENERATION_TIMEOUT_MS;

export const LISTING_GENERATION_TIMEOUT_MESSAGE =
  "Service Temporarily Unavailable - Please try again";
