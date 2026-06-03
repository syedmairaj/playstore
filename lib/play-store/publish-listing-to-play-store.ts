import "server-only";
import { google } from "googleapis";
import { getOAuth2ClientForWorkspace } from "@/lib/play-store/google-play-oauth";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListingFields {
  /** Play Console "App name" — max 30 chars */
  title: string;
  /** Play Console "Short description" — max 80 chars */
  shortDescription: string;
  /** Play Console "Full description" — max 4000 chars */
  fullDescription: string;
}

export type PublishListingResult =
  | { ok: true; editId: string; language: string }
  | {
      ok: false;
      code:
        | "not_connected"
        | "no_package_name"
        | "api_error"
        | "auth_error"
        | "validation_error";
      message: string;
    };

// ── Character limits (Play Console enforced) ──────────────────────────────────

const PLAY_LIMITS = {
  title: 30,
  shortDescription: 80,
  fullDescription: 4000,
} as const;

function clampField(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  // Hard clamp — same logic as the UI's clampedListing
  return trimmed.slice(0, max);
}

// ── Language code normalisation ───────────────────────────────────────────────

/**
 * Maps our internal locale codes to the BCP-47 tags Google Play accepts.
 * Play Console uses "en-US" style tags; the fallback is "en-US".
 *
 * Arabic is published to "ar" (Google Play accepts the 2-letter tag).
 * If you localise to a specific Arabic region (e.g. "ar-SA"), add it here.
 */
const LOCALE_TO_PLAY_LANGUAGE: Record<string, string> = {
  en: "en-US",
  ar: "ar",
  "en-US": "en-US",
  "en-GB": "en-GB",
};

export function resolvePlayLanguage(locale: string): string {
  return LOCALE_TO_PLAY_LANGUAGE[locale] ?? locale;
}

// ── Core publish function ─────────────────────────────────────────────────────

/**
 * Publishes a listing (title, shortDescription, fullDescription) to Google Play
 * Console using the workspace's stored OAuth2 credentials.
 *
 * Flow:
 *  1. Create a draft edit  (`edits.insert`)
 *  2. Update the listing   (`edits.listings.update`)
 *  3. Commit the edit      (`edits.commit`) — changes go live immediately
 *
 * The commit makes changes visible in the Play Console UI but does NOT
 * trigger a new app review — only store listing text is updated.
 */
export async function publishListingToPlayStore(params: {
  workspaceId: string;
  packageName: string;
  /** BCP-47 locale, e.g. "en", "ar", "en-US". Defaults to "en-US". */
  locale?: string;
  listing: ListingFields;
}): Promise<PublishListingResult> {
  const { workspaceId, packageName, listing } = params;
  const locale = params.locale ?? "en";
  const language = resolvePlayLanguage(locale);

  // Validate
  if (!packageName?.trim()) {
    return {
      ok: false,
      code: "no_package_name",
      message:
        "No package name is set for this app. Add it in Workspace & Apps settings.",
    };
  }

  if (!listing.title?.trim() || !listing.shortDescription?.trim() || !listing.fullDescription?.trim()) {
    return {
      ok: false,
      code: "validation_error",
      message: "title, shortDescription, and fullDescription are all required.",
    };
  }

  // Clamp to Play limits (belt-and-suspenders; UI already clamps)
  const title = clampField(listing.title, PLAY_LIMITS.title);
  const shortDescription = clampField(listing.shortDescription, PLAY_LIMITS.shortDescription);
  const fullDescription = clampField(listing.fullDescription, PLAY_LIMITS.fullDescription);

  // Get OAuth2 client for this workspace
  let auth: Awaited<ReturnType<typeof getOAuth2ClientForWorkspace>>;
  try {
    auth = await getOAuth2ClientForWorkspace(workspaceId);
  } catch (err) {
    return {
      ok: false,
      code: "not_connected",
      message:
        err instanceof Error
          ? err.message
          : "No Google Play account connected. Connect in Settings → Integrations.",
    };
  }

  const androidpublisher = google.androidpublisher({ version: "v3", auth });

  try {
    // 1. Create a draft edit
    const editInsert = await androidpublisher.edits.insert({
      packageName,
    });
    const editId = editInsert.data.id;
    if (!editId) {
      return {
        ok: false,
        code: "api_error",
        message: "Google Play API returned an edit without an ID.",
      };
    }

    // 2. Update the listing for the specified language
    await androidpublisher.edits.listings.update({
      packageName,
      editId,
      language,
      requestBody: {
        language,
        title,
        shortDescription,
        fullDescription,
      },
    });

    // 3. Commit — changes go live in Play Console
    await androidpublisher.edits.commit({
      packageName,
      editId,
    });

    return { ok: true, editId, language };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    // Classify common Google API errors for better UX messages
    const isAuth =
      raw.includes("invalid_grant") ||
      raw.includes("Token has been expired") ||
      raw.includes("unauthorized") ||
      raw.includes("401");

    const isPermission =
      raw.includes("403") ||
      raw.includes("does not have") ||
      raw.includes("permission");

    console.error("[publishListingToPlayStore]", {
      packageName,
      language,
      error: raw.slice(0, 400),
    });

    if (isAuth) {
      return {
        ok: false,
        code: "auth_error",
        message:
          "Google Play authentication failed. Try disconnecting and reconnecting in Settings → Integrations.",
      };
    }

    if (isPermission) {
      return {
        ok: false,
        code: "auth_error",
        message:
          "Permission denied. Make sure the connected account has 'Release manager' or 'Admin' role in Google Play Console for this app.",
      };
    }

    return {
      ok: false,
      code: "api_error",
      message: raw.slice(0, 300),
    };
  }
}
