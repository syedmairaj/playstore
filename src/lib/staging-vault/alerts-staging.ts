/**
 * Alerts Module → Staging Vault Integration
 *
 * Stage urgent alerts into persistent vault for immediate action.
 * Maintains severity, language, and regional context.
 *
 * Features:
 * - Severity-based staging (high priority only, or all)
 * - Alert context preservation (sentiment drop, crash spike, etc)
 * - Multi-language alert description
 * - Automatic RTL detection based on language
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { addSignalToVault } from "./staging-vault-service";

/**
 * Alert from Alerts module
 */
export interface AppAlert {
  id: string;
  appId: string;
  alertType:
    | "sentiment_drop"
    | "crash_spike"
    | "rating_decline"
    | "review_surge"
    | "keyword_drop"
    | "competitor_mention"
    | "security_issue";
  severity: "critical" | "high" | "medium" | "low";
  description: string; // Localized description
  language: string; // 'en', 'ar', 'fr', etc
  locale: string; // 'en-US', 'ar-SA', etc
  countryCode?: string;
  detectedAt: string;
  resolvedAt?: string;
  context: {
    previousValue?: number | string;
    currentValue?: number | string;
    changePercent?: number;
    affectedCountries?: string[];
    competitorName?: string;
    category?: string;
  };
}

/**
 * Stage an alert into the vault
 *
 * Used for: "Stage Alert" button next to high-priority alerts.
 * Creates an optimization_insight signal with alert metadata.
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param alert - Alert from the Alerts module
 */
export async function stageAlert(
  supabase: SupabaseClient,
  workspaceId: string,
  alert: AppAlert
): Promise<{
  id: string;
  message: string;
}> {
  try {
    // Use alert language, with fallback to 'en'
    const language = alert.language || "en";
    const isRtl = ["ar", "he", "fa", "ur"].includes(language);

    // Build human-readable alert description for vault
    const alertTitle = getAlertTitle(alert.alertType);
    const description = `[${alert.severity.toUpperCase()}] ${alertTitle}: ${alert.description}`;

    const result = await addSignalToVault(supabase, workspaceId, {
      signalType: "optimization_insight",
      content: description,
      source: "api", // Alerts come from system/API
      sourceAppId: alert.appId,
      sourceContext: "alert",
      sourceContextId: alert.id,
      language,
      metadata: {
        alertType: alert.alertType,
        severity: alert.severity,
        detectedAt: alert.detectedAt,
        resolvedAt: alert.resolvedAt,
        // Localization metadata
        isRtl,
        directionality: isRtl ? "rtl" : "ltr",
        locale: alert.locale,
        // Alert context for generation
        countryCode: alert.countryCode,
        previousValue: alert.context.previousValue,
        currentValue: alert.context.currentValue,
        changePercent: alert.context.changePercent,
        affectedCountries: alert.context.affectedCountries,
        competitorName: alert.context.competitorName,
        category: alert.context.category,
      },
    });

    return {
      id: result.id,
      message: `Staged ${alert.severity} alert: ${alertTitle}`,
    };
  } catch (err) {
    console.error("[AlertsStaging] Failed:", err);
    throw err;
  }
}

/**
 * Stage only high-severity alerts
 *
 * Useful for auto-staging without user interaction.
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param alerts - Array of alerts
 * @param minSeverity - Minimum severity to stage ('critical', 'high', 'medium', 'low')
 */
export async function stageHighSeverityAlerts(
  supabase: SupabaseClient,
  workspaceId: string,
  alerts: AppAlert[],
  minSeverity: "critical" | "high" | "medium" | "low" = "high"
): Promise<{
  staged: number;
  skipped: number;
  message: string;
}> {
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  const filtered = alerts.filter(
    (a) => severityRank[a.severity] >= severityRank[minSeverity]
  );

  let staged = 0;
  let skipped = 0;

  for (const alert of filtered) {
    try {
      await stageAlert(supabase, workspaceId, alert);
      staged++;
    } catch (err) {
      console.error(`[AlertsStaging] Failed to stage alert ${alert.id}:`, err);
      skipped++;
    }
  }

  return {
    staged,
    skipped,
    message: `Staged ${staged} ${minSeverity}+ severity alerts`,
  };
}

/**
 * Stage only unresolved alerts
 *
 * Helper for: "Stage All Unresolved Issues" button.
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param alerts - Array of alerts
 */
export async function stageUnresolvedAlerts(
  supabase: SupabaseClient,
  workspaceId: string,
  alerts: AppAlert[]
): Promise<{
  staged: number;
  message: string;
}> {
  const unresolved = alerts.filter((a) => !a.resolvedAt);
  const results = await stageHighSeverityAlerts(
    supabase,
    workspaceId,
    unresolved,
    "medium"
  );

  return {
    staged: results.staged,
    message: `Staged ${results.staged} unresolved alerts`,
  };
}

/**
 * Get human-readable title for alert type
 *
 * @param alertType - Alert type
 * @returns Formatted title
 */
function getAlertTitle(
  alertType:
    | "sentiment_drop"
    | "crash_spike"
    | "rating_decline"
    | "review_surge"
    | "keyword_drop"
    | "competitor_mention"
    | "security_issue"
): string {
  const titles: Record<string, string> = {
    sentiment_drop: "Sentiment Drop",
    crash_spike: "Crash Spike",
    rating_decline: "Rating Decline",
    review_surge: "Review Surge",
    keyword_drop: "Keyword Drop",
    competitor_mention: "Competitor Mentioned",
    security_issue: "Security Issue",
  };
  return titles[alertType] || "Alert";
}

/**
 * Get localization context for an alert
 *
 * Used by Brand Mirror Engine and Consultant Layer.
 *
 * @param alert - Alert from module
 * @returns Localization metadata
 */
export function getAlertLocalizationContext(alert: AppAlert): {
  language: string;
  locale: string;
  isRtl: boolean;
  directionality: "ltr" | "rtl";
  countryCode?: string;
} {
  const language = alert.language || "en";
  const isRtl = ["ar", "he", "fa", "ur"].includes(language);

  return {
    language,
    locale: alert.locale,
    isRtl,
    directionality: isRtl ? "rtl" : "ltr",
    countryCode: alert.countryCode,
  };
}

/**
 * Format alert for display in vault preview
 *
 * @param alert - Alert
 * @returns Formatted alert string with directionality
 */
export function formatAlertForDisplay(alert: AppAlert): {
  text: string;
  language: string;
  isRtl: boolean;
} {
  const language = alert.language || "en";
  const isRtl = ["ar", "he", "fa", "ur"].includes(language);
  const alertTitle = getAlertTitle(alert.alertType);

  return {
    text: `${alertTitle}: ${alert.description}`,
    language,
    isRtl,
  };
}
