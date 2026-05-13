import { z } from "zod";
import { PLAY_STORE_CATEGORIES } from "@/lib/play-categories";

/** Reverse-DNS Android application id (Play / Gradle style). */
export const ANDROID_PACKAGE_NAME_REGEX =
  /^([A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/;

const PLAY_CATEGORY_SET = new Set(PLAY_STORE_CATEGORIES as readonly string[]);

/** Flat ASO fields accepted on POST /api/workspaces/:id/apps; stored in `apps.metadata` after insert. */
const createAppMetadataFlatFieldsSchema = z
  .object({
    category: z
      .string()
      .trim()
      .min(1, "Category is required")
      .max(120)
      .refine((c) => PLAY_CATEGORY_SET.has(c), {
        message: "Invalid Play Store category",
      }),
    short_description: z.preprocess(
      (v) => (v === null || v === "" ? undefined : v),
      z.string().trim().max(80).optional(),
    ),
    icon_url: z.preprocess(
      (v) => (v === null || v === "" ? undefined : v),
      z.union([
        z.undefined(),
        z
          .string()
          .trim()
          .max(2000)
          .url({ message: "Icon URL must be well-formed" })
          .refine((u) => /^https:\/\//i.test(u), {
            message: "Icon URL must be a valid HTTPS URL",
          }),
      ]),
    ),
  })
  .strict();

export const createAppMetadataSchema = createAppMetadataFlatFieldsSchema.transform((obj) => {
  const out: Record<string, string> = { category: obj.category.trim() };
  const short = obj.short_description?.trim();
  if (short) out.short_description = short;
  const icon = obj.icon_url?.trim();
  if (icon) out.icon_url = icon;
  return out;
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const createKeywordSchema = z.object({
  term: z.string().trim().min(2).max(120),
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

/**
 * POST create-app body: flat fields only (no nested `metadata` in JSON).
 * Server maps `category`, `short_description`, `icon_url` into the `metadata` jsonb column.
 */
export const createAppSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    package_name: z
      .string()
      .trim()
      .min(1, "Package name is required")
      .max(200, "Package name is too long")
      .refine((val) => ANDROID_PACKAGE_NAME_REGEX.test(val), {
        message:
          "Invalid Android package name. Use reverse-DNS form, e.g. com.example.myapp",
      }),
  })
  .merge(createAppMetadataFlatFieldsSchema)
  .strict()
  .transform((data) => {
    const metadata = createAppMetadataSchema.parse({
      category: data.category,
      short_description: data.short_description,
      icon_url: data.icon_url,
    });
    return {
      name: data.name.trim(),
      package_name: data.package_name.trim(),
      metadata,
    };
  });

/** HTTPS icon URL: persisted on `apps.icon_url` and mirrored in `apps.metadata.icon_url` on PATCH. */
const patchAppIconUrlSchema = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(2000)
    .url({ message: "Icon URL must be well-formed" })
    .refine((u) => /^https:\/\//i.test(u), {
      message: "Icon URL must be a valid HTTPS URL",
    })
    .optional(),
);

export const patchAppSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  package_name: z.string().trim().max(200).nullable().optional(),
  play_store_url: z.string().trim().max(2000).nullable().optional(),
  target_countries: z.array(z.string().min(2).max(4)).max(40).optional(),
  icon_url: patchAppIconUrlSchema,
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "member"]),
});

export const patchProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  notification_preferences: z.record(z.string(), z.unknown()).optional(),
});
