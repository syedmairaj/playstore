import "server-only";
import { google } from "googleapis";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/**
 * True when a service account JSON or ADC path is configured for Play Console publish.
 */
export function hasGooglePlayPublishCredentials(): boolean {
  return Boolean(parseServiceAccountJson() || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
}

function parseServiceAccountJson(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      console.error("[google-play-credentials] Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
      return null;
    }
  }

  const b64 = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      console.error(
        "[google-play-credentials] Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64",
      );
      return null;
    }
  }

  return null;
}

export async function getAndroidPublisherClient() {
  const credentials = parseServiceAccountJson();
  const auth = credentials
    ? new google.auth.GoogleAuth({
        credentials,
        scopes: [ANDROID_PUBLISHER_SCOPE],
      })
    : new google.auth.GoogleAuth({
        scopes: [ANDROID_PUBLISHER_SCOPE],
      });

  return google.androidpublisher({ version: "v3", auth });
}
