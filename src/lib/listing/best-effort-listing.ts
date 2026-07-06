import "server-only";

import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { buildCoreAsoTemplateListing } from "@/lib/listing/core-aso-template";

export function buildBestEffortListing(
  input: ListingOptimizerInput,
  lockedKeywords: string[] = [],
): ListingGenerationOutput {
  return buildCoreAsoTemplateListing(input, lockedKeywords).listing;
}
