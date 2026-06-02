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
    /** Optional brand colour as a 6-digit hex string (e.g. "#1A2B3C"). */
    brandColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    /**
     * Optional custom icon concept from the user (paid plans only).
     * Appended to the generation prompt to guide the motif/subject.
     * Max 300 chars — enough for a clear concept, not a novel.
     */
    customPrompt: z.string().trim().max(300).optional(),
  })
  .strict();
