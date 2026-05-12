import { z } from "zod";
import { listingOptimizerRequestSchema } from "@/lib/validation/listing-input";

export const listingGenerateBodySchema = listingOptimizerRequestSchema.extend({
  workspaceId: z.string().uuid(),
});
