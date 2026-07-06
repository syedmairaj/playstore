import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type {
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";

type LooseGeneratedListing = {
  title?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
};

/** Null-safe trim for listing phase UPSERT columns — prevents undefined.trim() crashes. */
export function safeListingPhaseFields(
  generatedData?: LooseGeneratedListing | null,
): {
  title: string;
  short_description: string;
  long_description: string;
} {
  return {
    title: (generatedData?.title ?? "").trim(),
    short_description: (
      generatedData?.short_description ??
      generatedData?.shortDescription ??
      ""
    ).trim(),
    long_description: (
      generatedData?.long_description ??
      generatedData?.fullDescription ??
      ""
    ).trim(),
  };
}

export function safeTitleStepFields(
  data?: ModularTitleStepData | null,
): Pick<ReturnType<typeof safeListingPhaseFields>, "title"> {
  return { title: (data?.title ?? "").trim() };
}

export function safeFinalizeOutputFields(
  data?: ListingGenerationOutput | null,
): ReturnType<typeof safeListingPhaseFields> {
  return safeListingPhaseFields(data);
}

export function safeLongStepFields(
  data?: ModularLongStepData | null,
): Pick<ReturnType<typeof safeListingPhaseFields>, "long_description"> & {
  hook: string;
  features: string;
  closing: string;
} {
  return {
    long_description: (data?.hook ?? data?.features ?? data?.closing ?? "")
      ? [
          (data?.hook ?? "").trim(),
          (data?.features ?? "").trim(),
          (data?.closing ?? "").trim(),
        ]
          .filter(Boolean)
          .join("\n\n")
      : "",
    hook: (data?.hook ?? "").trim(),
    features: (data?.features ?? "").trim(),
    closing: (data?.closing ?? "").trim(),
  };
}

export function safeShortStepFields(
  data?: ModularShortStepData | null,
): Pick<ReturnType<typeof safeListingPhaseFields>, "short_description"> {
  const first =
    data?.variations?.find((v) => (v.text ?? "").trim())?.text ?? "";
  return { short_description: (first ?? "").trim() };
}
