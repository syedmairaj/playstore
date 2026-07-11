import "server-only";

import {
  getDeveloperAccountId,
  isGooglePlayConfigured,
  loadServiceAccountCredentials,
} from "@/lib/performance/google-play-auth";

export type PlayMetricsIngestReadiness = {
  configured: boolean;
  ready: boolean;
  missing: string[];
  hints: string[];
  developerAccountId: string | null;
  serviceAccountEmail: string | null;
  cronSecretSet: boolean;
  cronPath: string;
};

/**
 * Reports whether production Play Console GCS ingest can run.
 * Safe to expose to authenticated workspace members (no secrets).
 */
export function getPlayMetricsIngestReadiness(): PlayMetricsIngestReadiness {
  const missing: string[] = [];
  const hints: string[] = [];

  const creds = loadServiceAccountCredentials();
  if (!creds) {
    missing.push("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    hints.push(
      "Add the Play Console service account JSON to Vercel env (raw or base64). Grant storage.objectViewer on pubsite_prod_rev_{developerAccountId}.",
    );
  }

  const developerAccountId = getDeveloperAccountId();
  if (!developerAccountId) {
    missing.push("GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID");
    hints.push(
      "Set numeric developer account ID from Play Console URL: play.google.com/console/.../developers/{ID}",
    );
  }

  const cronSecretSet = Boolean(process.env.CRON_SECRET?.trim());
  if (!cronSecretSet) {
    missing.push("CRON_SECRET");
    hints.push("Set CRON_SECRET in Vercel — required for /api/cron/ingest-play-metrics.");
  }

  const configured = isGooglePlayConfigured();
  const ready = configured && cronSecretSet;

  if (configured && cronSecretSet) {
    hints.push(
      "Trigger manually: POST /api/cron/ingest-play-metrics with Authorization: Bearer $CRON_SECRET",
    );
    hints.push("Daily schedule: 06:00 UTC (vercel.json).");
  }

  return {
    configured,
    ready,
    missing,
    hints,
    developerAccountId,
    serviceAccountEmail: creds?.client_email ?? null,
    cronSecretSet,
    cronPath: "/api/cron/ingest-play-metrics",
  };
}
