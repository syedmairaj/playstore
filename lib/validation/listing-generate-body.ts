import { z } from "zod";
import { listingOptimizerRequestSchema } from "@/lib/validation/listing-input";

export const listingGenerateBodySchema = listingOptimizerRequestSchema.extend({
  workspaceId: z.string().uuid(),
  /** When set, associates the saved generation with this workspace app (Keyword Tracker integration). */
  appId: z.string().uuid().optional(),
});
