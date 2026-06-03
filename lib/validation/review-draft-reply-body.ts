import { z } from "zod";

export const reviewDraftReplyBodySchema = z.object({
  reviewText: z.string().min(1).max(8000),
  rating: z.number().int().min(1).max(5),
  replyLanguage: z.enum(["en", "ar", "hi"]),
  appName: z.string().max(120).optional(),
  userName: z.string().max(80).optional(),
});

export type ReviewDraftReplyBody = z.infer<typeof reviewDraftReplyBodySchema>;
