import { z } from "zod";

const androidPackagePattern = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

export const saveListingImprovementBodySchema = z
  .object({
    reviewId: z.string().min(1).max(512),
    reviewText: z.string().min(1).max(8000),
    userName: z.string().min(1).max(256),
    score: z.number().int().min(1).max(5),
    sentimentTag: z.string().min(1).max(120).optional(),
    appId: z.string().uuid().optional(),
    packageName: z
      .string()
      .min(3)
      .max(255)
      .regex(androidPackagePattern, "Invalid package name")
      .optional(),
  })
  .refine((v) => v.appId != null || v.packageName != null, {
    message: "appId or packageName is required",
    path: ["appId"],
  });

export type SaveListingImprovementBody = z.infer<typeof saveListingImprovementBodySchema>;
