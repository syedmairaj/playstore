import { z } from "zod";
import { listingOptimizerRequestSchema } from "@/lib/validation/listing-input";

export const listingGenerateBodySchema = listingOptimizerRequestSchema.extend({
  workspaceId: z.string().uuid(),
  /** When set, associates the saved generation with this workspace app (Keyword Tracker integration). */
  appId: z.string().uuid().optional(),
  /**
   * Active signal types present at generation time — used server-side to compute
   * quality_status / quality_warning meta fields returned in the API response.
   * Subset of: "reviews" | "market" | "competitors"
   */
  activeSignalTypes: z
    .array(z.enum(["reviews", "market", "competitors"]))
    .max(3)
    .optional(),
});
