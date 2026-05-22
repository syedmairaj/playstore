import "server-only";
import {
  getAndroidPublisherClient,
  hasGooglePlayPublishCredentials,
} from "@/lib/play-store/google-play-credentials";

export type PublishPlayStoreReplyResult =
  | { ok: true; published: true }
  | { ok: true; published: false; skipped: true; reason: "no_google_play_credentials" }
  | { ok: false; error: string };

/**
 * Publishes a developer reply on Google Play via Android Publisher API v3.
 * When credentials are missing, returns `skipped` (stub) without throwing.
 */
export async function publishPlayStoreReply(params: {
  packageName: string;
  reviewId: string;
  replyText: string;
}): Promise<PublishPlayStoreReplyResult> {
  const packageName = params.packageName.trim();
  const reviewId = params.reviewId.trim();
  const replyText = params.replyText.trim();

  if (!packageName || !reviewId || !replyText) {
    return { ok: false, error: "packageName, reviewId, and replyText are required" };
  }

  if (!hasGooglePlayPublishCredentials()) {
    return {
      ok: true,
      published: false,
      skipped: true,
      reason: "no_google_play_credentials",
    };
  }

  try {
    const androidpublisher = await getAndroidPublisherClient();
    await androidpublisher.reviews.reply({
      packageName,
      reviewId,
      requestBody: { replyText },
    });
    return { ok: true, published: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to publish Play Store reply";
    console.error("[publishPlayStoreReply]", { packageName, reviewId, message });
    return { ok: false, error: message };
  }
}
