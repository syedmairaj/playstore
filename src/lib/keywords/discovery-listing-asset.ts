/** Play Store metadata fields a discovery keyword can be drafted into. */
export type ListingAssetTarget =
  | "title"
  | "short_description"
  | "full_description"
  | "keywords";

export const LISTING_ASSET_TARGETS: ListingAssetTarget[] = [
  "title",
  "short_description",
  "full_description",
  "keywords",
];

export function isListingAssetTarget(value: unknown): value is ListingAssetTarget {
  return (
    typeof value === "string" &&
    (LISTING_ASSET_TARGETS as readonly string[]).includes(value)
  );
}
