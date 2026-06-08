import { z } from "zod";
import { reviewDraftReplyBodySchema } from "@/lib/validation/review-draft-reply-body";

const androidPackagePattern = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

export const reviewReplyBodySchema = reviewDraftReplyBodySchema.extend({
  /** When set, skips Gemini and publishes this text (still charges 1 credit). */
  replyText: z.string().min(1).max(2000).optional(),
  /** Android application id for Play Console publish; required when publish is attempted. */
  packageName: z
    .string()
    .min(3)
    .max(255)
    .regex(androidPackagePattern, "Invalid package name")
    .optional(),
  /** Workspace app uuid — used to resolve `package_name` when omitted. */
  appId: z.string().uuid().optional(),
});

export type ReviewReplyBody = z.infer<typeof reviewReplyBodySchema>;
