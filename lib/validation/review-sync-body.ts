import { z } from "zod";

/**
 * Validation schema for the reviews/sync route.
 *
 * ## Identification modes (mutually exclusive)
 *
 * 1. `appId` (UUID) — primary app mode.
 *    The route looks up the app row in the `apps` table, reads its
 *    `package_name`, then fetches reviews for that package.
 *
 * 2. `packageName` (Android package ID) — competitor fast-path.
 *    The route skips the DB lookup and scrapes the Play Store directly.
 *
 * ## Language selection
 *
 * Callers MUST NOT supply a `lang` / `hl` parameter.  The server owns that
 * decision entirely, resolving the correct hl[] array from `country` (gl)
 * via `getHlsForCountry()` in `lib/play-store/country-lang-map.ts`.
 *
 * This guarantees that:
 *   - India ("in") always uses hl=en (not hl=hi).
 *   - UAE ("ae") always runs concurrent hl=en + hl=ar passes.
 *   - No caller can accidentally request a mismatched gl/hl combination.
 */
export const reviewSyncBodySchema = z
  .object({
    /** UUID of the workspace's own app row in the `apps` table. */
    appId: z.string().uuid().optional(),

    /**
     * Android package identifier (e.g. "com.example.app").
     * Used as the competitor fast-path — no DB lookup is performed.
     */
    packageName: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .regex(
        /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i,
        "Must be a valid Android package name (e.g. com.example.app)",
      )
      .optional(),

    /**
     * ISO 3166-1 alpha-2 geography code (gl), e.g. "in", "ae", "us".
     * The server resolves the corresponding hl[] values from this code —
     * callers must NOT supply a separate lang / hl parameter.
     */
    country: z.string().trim().toLowerCase().length(2).optional(),

    /**
     * Reviews to fetch **per language pass** (1–200).
     * For multi-pass countries (e.g. UAE) the combined result may contain
     * up to num × hls.length unique items after deduplication.
     */
    num: z.number().int().min(1).max(200).optional().default(100),
  })
  .superRefine((val, ctx) => {
    const hasAppId = typeof val.appId === "string" && val.appId.length > 0;
    const hasPkg = typeof val.packageName === "string" && val.packageName.length > 0;

    if (!hasAppId && !hasPkg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either appId (UUID) or packageName (Android package ID)",
        path: ["appId"],
      });
    }
    if (hasAppId && hasPkg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either appId or packageName, not both",
        path: ["packageName"],
      });
    }
  });

export type ReviewSyncBody = z.infer<typeof reviewSyncBodySchema>;
