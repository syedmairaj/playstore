import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const createKeywordSchema = z.object({
  term: z.string().trim().min(1).max(120),
  market: z.string().trim().min(2).max(8).optional(),
  locale: z.string().trim().min(2).max(16).optional(),
  appId: z.string().uuid().optional(),
});

export const createRankSchema = z.object({
  rank: z.number().int().min(1).max(500).nullable(),
  source: z.string().trim().max(32).optional(),
});

export const markAlertsReadSchema = z.object({
  alertIds: z.array(z.string().uuid()).min(1),
});

export const patchWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  onboarding_state: z.any().optional(),
  plan: z.enum(["free", "pro", "growth"]).optional(),
});

export const patchAppSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  package_name: z.string().trim().max(200).nullable().optional(),
  play_store_url: z.string().trim().max(2000).nullable().optional(),
  target_countries: z.array(z.string().min(2).max(4)).max(40).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "member"]),
});

export const patchProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  notification_preferences: z.record(z.string(), z.unknown()).optional(),
});
