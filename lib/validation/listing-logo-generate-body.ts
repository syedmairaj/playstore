import { z } from "zod";

export const LISTING_LOGO_STYLES = [
  "Minimalist",
  "Modern",
  "Bold",
  "Playful",
  "Professional",
  "Flat Design",
] as const;

export type ListingLogoStyle = (typeof LISTING_LOGO_STYLES)[number];

export const listingLogoGenerateBodySchema = z
  .object({
    workspaceId: z.string().uuid(),
    appId: z.string().uuid(),
    appName: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(120),
    shortDescription: z.string().trim().max(2000).optional(),
    style: z.enum(LISTING_LOGO_STYLES),
  })
  .strict();
