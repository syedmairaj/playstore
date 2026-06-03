/**
 * ASO Reports Database Layer
 *
 * CRUD operations for ASO Report Cards
 * Integrates with listing_generations for context awareness
 */

import { createClient } from "@supabase/supabase-js";
import type {
  AsoReportCard,
  AsoReportDatabase,
  AsoReportSummary,
} from "@/lib/gemini/aso-report-card-types";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Save ASO Report to database
 *
 * @param workspaceId - Workspace ID
 * @param userId - User ID who generated the report
 * @param report - Complete AsoReportCard
 * @param inputData - Original input for audit trail
 * @returns Saved report
 */
export async function saveAsoReport(
  workspaceId: string,
  userId: string,
  report: AsoReportCard,
  inputData: any
): Promise<AsoReportDatabase | null> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("aso_reports")
      .insert({
        workspace_id: workspaceId,
        app_id: report.appId,
        app_name: report.appName,
        locale: report.locale,
        overall_score: report.overallScore,
        readability_score: report.readability.score,
        keyword_density_score: report.keywordDensity.score,
        conversion_potential_score: report.conversionPotential.score,
        report_data: report,
        input_data: inputData,
        generation_time_ms: report.metadata.analysisTimeMs,
        created_by_user_id: userId,
        is_manual_override: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to save ASO report:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error saving ASO report:", error);
    return null;
  }
}

/**
 * Load most recent ASO report for an app
 *
 * @param workspaceId - Workspace ID
 * @param appId - App ID
 * @param locale - Language locale (optional filter)
 * @returns Most recent report or null
 */
export async function loadLatestAsoReport(
  workspaceId: string,
  appId: string,
  locale?: string
): Promise<AsoReportCard | null> {
  try {
    const client = getAdminClient();

    let query = client
      .from("aso_reports")
      .select("report_data")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (locale) {
      query = query.eq("locale", locale);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        return null;
      }
      console.error("Failed to load ASO report:", error);
      return null;
    }

    return data?.report_data || null;
  } catch (error) {
    console.error("Error loading ASO report:", error);
    return null;
  }
}

/**
 * Load all ASO reports for an app
 *
 * @param workspaceId - Workspace ID
 * @param appId - App ID
 * @returns Array of reports (newest first)
 */
export async function loadAsoReportHistory(
  workspaceId: string,
  appId: string
): Promise<AsoReportSummary[]> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("aso_reports")
      .select("report_data, created_at")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load ASO report history:", error);
      return [];
    }

    return (data || []).map((row) => {
      const report = row.report_data as AsoReportCard;
      return {
        id: report.id,
        appName: report.appName,
        locale: report.locale,
        overallScore: report.overallScore,
        overallCategory: report.overallCategory,
        createdAt: row.created_at,
        topTip: report.actionableTips[0],
      };
    });
  } catch (error) {
    console.error("Error loading ASO report history:", error);
    return [];
  }
}

/**
 * Load ASO reports for all apps in a workspace
 *
 * @param workspaceId - Workspace ID
 * @returns Summaries of most recent report per app
 */
export async function loadWorkspaceAsoReports(
  workspaceId: string
): Promise<AsoReportSummary[]> {
  try {
    const client = getAdminClient();

    // Get most recent report per app
    const { data, error } = await client
      .from("aso_reports")
      .select("report_data, created_at, app_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load workspace ASO reports:", error);
      return [];
    }

    // Group by app_id, keep only latest per app
    const reportsByApp = new Map();
    (data || []).forEach((row) => {
      if (!reportsByApp.has(row.app_id)) {
        const report = row.report_data as AsoReportCard;
        reportsByApp.set(row.app_id, {
          id: report.id,
          appName: report.appName,
          locale: report.locale,
          overallScore: report.overallScore,
          overallCategory: report.overallCategory,
          createdAt: row.created_at,
          topTip: report.actionableTips[0],
        });
      }
    });

    return Array.from(reportsByApp.values());
  } catch (error) {
    console.error("Error loading workspace ASO reports:", error);
    return [];
  }
}

/**
 * Check if a report exists for an app/locale combination
 *
 * @param workspaceId - Workspace ID
 * @param appId - App ID
 * @param locale - Language locale
 * @param withinHours - Only return true if report is within X hours (0 = any age)
 * @returns true if recent report exists
 */
export async function hasRecentAsoReport(
  workspaceId: string,
  appId: string,
  locale: string,
  withinHours: number = 24
): Promise<boolean> {
  try {
    const client = getAdminClient();

    let query = client
      .from("aso_reports")
      .select("created_at")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .eq("locale", locale)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { data, error } = await query;

    if (error) {
      if (error.code === "PGRST116") return false;
      console.error("Error checking ASO report:", error);
      return false;
    }

    if (!data) return false;

    if (withinHours === 0) return true;

    const ageHours =
      (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60);
    return ageHours < withinHours;
  } catch (error) {
    console.error("Error checking ASO report existence:", error);
    return false;
  }
}

/**
 * Delete an ASO report
 *
 * @param reportId - Report ID
 * @returns true if deleted
 */
export async function deleteAsoReport(reportId: string): Promise<boolean> {
  try {
    const client = getAdminClient();

    const { error } = await client
      .from("aso_reports")
      .delete()
      .eq("id", reportId);

    if (error) {
      console.error("Failed to delete ASO report:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting ASO report:", error);
    return false;
  }
}

/**
 * Compare two reports and calculate improvement metrics
 *
 * @param workspaceId - Workspace ID
 * @param appId - App ID
 * @param locale - Language locale
 * @returns Improvement data or null if can't compare
 */
export async function getAsoReportImprovement(
  workspaceId: string,
  appId: string,
  locale: string
): Promise<{
  previousScore?: number;
  currentScore?: number;
  improvement: number;
  direction: "up" | "down" | "stable";
} | null> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("aso_reports")
      .select("overall_score, created_at")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .eq("locale", locale)
      .order("created_at", { ascending: false })
      .limit(2);

    if (error || !data || data.length === 0) {
      return null;
    }

    if (data.length === 1) {
      // Only one report, no comparison
      return {
        currentScore: data[0].overall_score,
        improvement: 0,
        direction: "stable",
      };
    }

    const current = data[0].overall_score;
    const previous = data[1].overall_score;
    const improvement = current - previous;

    return {
      previousScore: previous,
      currentScore: current,
      improvement,
      direction:
        improvement > 2 ? "up" : improvement < -2 ? "down" : "stable",
    };
  } catch (error) {
    console.error("Error calculating ASO report improvement:", error);
    return null;
  }
}

/**
 * Get statistics for workspace ASO reports
 *
 * @param workspaceId - Workspace ID
 * @returns Summary statistics
 */
export async function getAsoReportStatistics(
  workspaceId: string
): Promise<{
  totalReports: number;
  appsWithReports: number;
  avgScore: number;
  scoreDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  localesUsed: string[];
} | null> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("aso_reports")
      .select("overall_score, app_id, locale")
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("Failed to get ASO statistics:", error);
      return null;
    }

    if (!data || data.length === 0) {
      return {
        totalReports: 0,
        appsWithReports: 0,
        avgScore: 0,
        scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
        localesUsed: [],
      };
    }

    const uniqueApps = new Set(data.map((r) => r.app_id)).size;
    const avgScore =
      data.reduce((sum, r) => sum + r.overall_score, 0) / data.length;

    const distribution = {
      excellent: data.filter((r) => r.overall_score >= 80).length,
      good: data.filter(
        (r) => r.overall_score >= 60 && r.overall_score < 80
      ).length,
      fair: data.filter(
        (r) => r.overall_score >= 40 && r.overall_score < 60
      ).length,
      poor: data.filter((r) => r.overall_score < 40).length,
    };

    const locales = Array.from(new Set(data.map((r) => r.locale)));

    return {
      totalReports: data.length,
      appsWithReports: uniqueApps,
      avgScore: Math.round(avgScore),
      scoreDistribution: distribution,
      localesUsed: locales,
    };
  } catch (error) {
    console.error("Error getting ASO statistics:", error);
    return null;
  }
}
