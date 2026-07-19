/**
 * Free Tier Enforcement Middleware
 *
 * Centralized enforcement of hard limits, rate limits, and feature gating
 * for free plan users. Runs in middleware before route handlers.
 *
 * Responsibilities:
 * - App slot quota enforcement (max 1 app per free workspace)
 * - Keyword quota enforcement (max 25 keywords per free workspace)
 * - AI credit balance checking (max 20 one-time credits)
 * - Rate limiting (per-endpoint, per-user quotas)
 * - Feature flag enforcement (premium features blocked)
 * - Standardized error responses with upgrade prompts
 */

import { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";

export type PlanId = "free" | "pro" | "growth";

interface FreeTierEnforcementContext {
  plan: PlanId;
  workspaceId: string;
  userId: string;
  endpoint: string; // e.g., "POST /api/listings/generate"
  method: string; // "GET", "POST", "PATCH", "DELETE"
  pathname: string;
}

interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  code?: string;
  statusCode?: number;
  metadata?: Record<string, any>;
}

/**
 * Main enforcement function called from middleware
 */
export async function enforcePlanLimits(
  supabase: ReturnType<typeof createClient<Database>>,
  context: FreeTierEnforcementContext
): Promise<EnforcementResult> {
  // Bypass checks for non-free plans
  if (context.plan !== "free") {
    return { allowed: true };
  }

  // Apply free tier enforcement
  const checks = [
    await checkAppSlotQuota(supabase, context),
    await checkKeywordQuota(supabase, context),
    await checkAiCredits(supabase, context),
    await checkRateLimit(supabase, context),
    await checkFeatureAvailability(context),
  ];

  // Return first failed check
  const failed = checks.find((c) => !c.allowed);
  return failed || { allowed: true };
}

/**
 * Check: Max 1 app per free workspace
 * Applies to: POST /api/workspaces/[workspaceId]/apps
 */
async function checkAppSlotQuota(
  supabase: ReturnType<typeof createClient<Database>>,
  context: FreeTierEnforcementContext
): Promise<EnforcementResult> {
  // Only check on app creation endpoint
  if (context.endpoint !== "POST /api/workspaces/[workspaceId]/apps") {
    return { allowed: true };
  }

  try {
    const { data: apps, error } = await supabase
      .from("apps")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", context.workspaceId);

    if (error) throw error;

    const currentCount = apps?.length ?? 0;
    const limit = 1; // Free tier max

    if (currentCount >= limit) {
      return {
        allowed: false,
        reason: "Free plan limited to 1 app",
        code: "plan_app_limit",
        statusCode: 403,
        metadata: {
          currentPlan: "free",
          requiredPlan: "pro",
          currentCount,
          limit,
          upgradeUrl: "/plans?upgrade=pro&from=apps&reason=app_limit",
        },
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error("App quota check failed:", err);
    // On error, allow request to proceed (fail open)
    return { allowed: true };
  }
}

/**
 * Check: Max 25 keywords per free workspace
 * Applies to: POST /api/workspaces/[workspaceId]/keywords
 */
async function checkKeywordQuota(
  supabase: ReturnType<typeof createClient<Database>>,
  context: FreeTierEnforcementContext
): Promise<EnforcementResult> {
  // Only check on keyword creation endpoint
  if (context.endpoint !== "POST /api/workspaces/[workspaceId]/keywords") {
    return { allowed: true };
  }

  try {
    const { data: keywords, error } = await supabase
      .from("keywords")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", context.workspaceId);

    if (error) throw error;

    const currentCount = keywords?.length ?? 0;
    const limit = 25; // Free tier max

    if (currentCount >= limit) {
      return {
        allowed: false,
        reason: "Free plan limited to 25 keywords",
        code: "plan_keyword_limit",
        statusCode: 403,
        metadata: {
          currentPlan: "free",
          requiredPlan: "pro",
          currentCount,
          limit,
          upgradeUrl:
            "/plans?upgrade=pro&from=keywords&reason=keyword_limit",
        },
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error("Keyword quota check failed:", err);
    return { allowed: true };
  }
}

/**
 * Check: AI credit balance for credit-based endpoints
 * Applies to: POST /api/listings/generate, /api/listings/optimizer-autofill, etc.
 *
 * Note: This is informational for middleware. Actual debit happens in route handler.
 */
async function checkAiCredits(
  supabase: ReturnType<typeof createClient<Database>>,
  context: FreeTierEnforcementContext
): Promise<EnforcementResult> {
  // List of endpoints that consume AI credits
  const creditConsumingEndpoints = [
    "POST /api/listings/generate",
    "POST /api/listings/optimizer-autofill",
    "POST /api/apps/suggest",
    "POST /api/workspaces/[workspaceId]/reviews/[reviewId]/draft-reply",
    "POST /api/workspaces/[workspaceId]/reviews/analyze",
    "POST /api/workspaces/[workspaceId]/listings/localize",
    "POST /api/market/keyword-spotlight",
    "POST /api/workspaces/[workspaceId]/keywords/[id]/serper-refresh",
    "POST /api/listings/logo-generate",
    "POST /api/brand-assets/banner-generate",
    "POST /api/screenshot-studio/generate",
  ];

  if (!creditConsumingEndpoints.includes(context.endpoint)) {
    return { allowed: true };
  }

  try {
    const { data: workspace, error } = await supabase
      .from("workspaces")
      .select("ai_credits_remaining")
      .eq("id", context.workspaceId)
      .single();

    if (error) throw error;

    const creditsRemaining = workspace?.ai_credits_remaining ?? 0;

    // For middleware, just check if credits exist (route handler does actual cost calculation)
    if (creditsRemaining <= 0) {
      return {
        allowed: false,
        reason: "Free plan AI credits exhausted",
        code: "insufficient_credits",
        statusCode: 402,
        metadata: {
          currentPlan: "free",
          currentCredits: 0,
          upgradeUrl:
            "/plans?upgrade=pro&from=ai_generation&reason=no_credits",
        },
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error("Credit check failed:", err);
    return { allowed: true };
  }
}

/**
 * Check: Rate limiting per endpoint, per user, per workspace
 * Uses existing RPC `consume_rate_limit(key, max_per_window)`
 */
async function checkRateLimit(
  supabase: ReturnType<typeof createClient<Database>>,
  context: FreeTierEnforcementContext
): Promise<EnforcementResult> {
  // Rate limit configuration by endpoint tier
  const rateLimitConfig: Record<string, number> = {
    // Tier 1: Generous (read operations)
    "GET /api/workspaces/[workspaceId]/apps": 100,
    "GET /api/workspaces/[workspaceId]/keywords": 100,
    "GET /api/listings/latest": 50,
    "GET /api/workspaces/[workspaceId]/reviews": 50,

    // Tier 2: Standard (expensive reads)
    "POST /api/workspaces/[workspaceId]/keywords/[id]/serper-refresh": 5,
    "POST /api/workspaces/[workspaceId]/keywords/serper-preview-draft": 5,
    "POST /api/workspaces/[workspaceId]/reviews/analyze": 3,
    "POST /api/market/keyword-spotlight": 3,

    // Tier 3: Strict (AI generations)
    "POST /api/listings/generate": 10,
    "POST /api/workspaces/[workspaceId]/reviews/[reviewId]/draft-reply": 10,
    "POST /api/apps/suggest": 10,
    "POST /api/listings/optimizer-autofill": 10,
    "POST /api/listings/logo-generate": 3,
    "POST /api/brand-assets/banner-generate": 3,
    "POST /api/screenshot-studio/generate": 2,

    // Tier 4: Extreme (writes)
    "POST /api/workspaces/[workspaceId]/apps": 5,
    "POST /api/workspaces/[workspaceId]/keywords": 10,
    "PATCH /api/workspaces/[workspaceId]/apps/[appId]": 10,
  };

  const maxPerWindow = rateLimitConfig[context.endpoint];
  if (!maxPerWindow) {
    // No rate limit configured for this endpoint
    return { allowed: true };
  }

  try {
    const rateLimitKey = `${context.endpoint}:${context.workspaceId}:${context.userId}`;

    const { data, error } = await supabase.rpc(
      "consume_rate_limit" as never,
      {
        p_key: rateLimitKey,
        p_max_per_window: maxPerWindow,
      } as never
    );

    if (error) throw error;

    if (!data?.allowed) {
      return {
        allowed: false,
        reason: "Rate limit exceeded",
        code: "rate_limited",
        statusCode: 429,
        metadata: {
          limit: maxPerWindow,
          window: "60 seconds",
          retryAfter: 60,
        },
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error("Rate limit check failed:", err);
    // Fail open on rate limit check errors
    return { allowed: true };
  }
}

/**
 * Check: Feature flag gating for premium features
 * Blocks certain endpoints entirely for free tier
 */
async function checkFeatureAvailability(
  context: FreeTierEnforcementContext
): Promise<EnforcementResult> {
  // Features blocked for free tier
  const blockedEndpoints = [
    "POST /api/listings/logo-generate",
    "POST /api/brand-assets/banner-generate",
    "POST /api/screenshot-studio/generate",
    "POST /api/screenshot-studio/render",
    "POST /api/brand-kit/sync",
  ];

  if (!blockedEndpoints.includes(context.endpoint)) {
    return { allowed: true };
  }

  const featureName = extractFeatureName(context.endpoint);

  return {
    allowed: false,
    reason: `${featureName} is only available on Pro and Growth plans`,
    code: "feature_not_available",
    statusCode: 403,
    metadata: {
      currentPlan: "free",
      requiredPlan: "pro",
      feature: featureName,
      upgradeUrl: `/plans?upgrade=pro&from=${context.endpoint.replace(
        /\s+/g,
        "_"
      )}&reason=feature_blocked`,
    },
  };
}

/**
 * Extract feature name from endpoint for error messages
 */
function extractFeatureName(endpoint: string): string {
  const map: Record<string, string> = {
    "POST /api/listings/logo-generate": "Logo Generation",
    "POST /api/brand-assets/banner-generate": "Banner Generation",
    "POST /api/screenshot-studio/generate": "Screenshot Studio",
    "POST /api/screenshot-studio/render": "Screenshot Studio",
    "POST /api/brand-kit/sync": "Brand Kit",
  };
  return map[endpoint] || "Premium Feature";
}

/**
 * Helper: Check if plan is free tier
 */
export function isFreeTier(plan: PlanId): boolean {
  return plan === "free";
}

/**
 * Helper: Get plan display name
 */
export function getPlanName(plan: PlanId): string {
  return { free: "Free", pro: "Pro", growth: "Growth" }[plan];
}
