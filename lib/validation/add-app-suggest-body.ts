import { z } from "zod";

export const addAppSuggestBodySchema = z.object({
  workspaceId: z.string().uuid(),
  field: z.enum(["app_name", "short_description"]),
  context: z
    .object({
      appName: z.string().trim().max(120).optional(),
      category: z.string().trim().max(120).optional(),
      packageName: z
        .string()
        .trim()
        .max(200)
        .optional(),
      shortDescriptionHint: z.string().trim().max(500).optional(),
    })
    .strict(),
});

export type AddAppSuggestBody = z.infer<typeof addAppSuggestBodySchema>;
