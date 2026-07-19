/**
 * Plan Response Builder
 *
 * Standardized response formatting for plan-gated errors.
 * Ensures consistent error structure, upgrade prompts, and metadata
 * across all API endpoints.
 */

import { NextResponse } from "next/server";

export interface PlanError {
  code: string;
  message: string;
  details: {
    currentPlan: string;
    requiredPlan?: string;
    upgradeUrl?: string;
    [key: string]: any;
  };
}

export interface SuccessResponse<T> {
  ok: true;
  data: T;
  meta: {
    plan: string;
    creditsRemaining?: number;
    limits?: Record<string, number>;
  };
}

export interface ErrorResponse {
  ok: false;
  error: PlanError;
}

/**
 * Build standardized error response for plan gating
 */
export function buildPlanGateResponse(
  code: string,
  message: string,
  statusCode: number,
  metadata: Record<string, any> = {}
): NextResponse<ErrorResponse> {
  const error: PlanError = {
    code,
    message,
    details: {
      currentPlan: metadata.currentPlan || "free",
      requiredPlan: metadata.requiredPlan,
      upgradeUrl: metadata.upgradeUrl,
      ...metadata,
    },
  };

  return NextResponse.json({ ok: false, error }, { status: statusCode });
}

/**
 * Insufficient credits response (402 Payment Required)
 */
export function buildInsufficientCreditsResponse(
  creditsNeeded: number,
  creditsRemaining: number,
  featureName: string = "this operation"
): NextResponse<ErrorResponse> {
  return buildPlanGateResponse(
    "insufficient_credits",
    `You need ${creditsNeeded} credits to ${featureName}, but only have ${creditsRemaining} remaining. Upgrade to Pro for 200 credits/month.`,
    402,
    {
      currentPlan: "free",
      requiredPlan: "pro",
      requiredCredits: creditsNeeded,
      currentCredits: creditsRemaining,
      upgradeUrl: "/plans?upgrade=pro&from=ai_generation&reason=insufficient_credits",
    }
  );
}

/**
 * App limit exceeded response (403 Forbidden)
 */
export function buildAppLimitResponse(
  currentCount: number,
  limit: number = 1
): NextResponse<ErrorResponse> {
  return buildPlanGateResponse(
    "plan_app_limit",
    `Free plan limited to ${limit} app. Upgrade to Pro for ${Math.max(5, limit)} apps.`,
    403,
    {
      currentPlan: "free",
      requiredPlan: "pro",
      currentCount,
      limit,
      upgradeUrl: "/plans?upgrade=pro&from=apps&reason=app_limit",
    }
  );
}

/**
 * Keyword limit exceeded response (403 Forbidden)
 */
export function buildKeywordLimitResponse(
  currentCount: number,
  limit: number = 25
): NextResponse<ErrorResponse> {
  return buildPlanGateResponse(
    "plan_keyword_limit",
    `Free plan limited to ${limit} keywords. Upgrade to Pro for 500 keywords.`,
    403,
    {
      currentPlan: "free",
      requiredPlan: "pro",
      currentCount,
      limit,
      upgradeUrl: "/plans?upgrade=pro&from=keywords&reason=keyword_limit",
    }
  );
}

/**
 * Credit top-up not available response (403 Forbidden)
 */
export function buildCreditTopupNotAvailableResponse(): NextResponse<ErrorResponse> {
  return buildPlanGateResponse(
    "plan_no_topups",
    "Credit top-ups are only available on Pro and Growth plans.",
    403,
    {
      currentPlan: "free",
      requiredPlan: "pro",
      upgradeUrl: "/plans?upgrade=pro&from=billing&reason=no_topups",
    }
  );
}

/**
 * Feature not available response (403 Forbidden)
 */
export function buildFeatureNotAvailableResponse(
  featureName: string,
  endpoint: string = ""
): NextResponse<ErrorResponse> {
  return buildPlanGateResponse(
    "feature_not_available",
    `${featureName} is available on Pro and Growth plans only.`,
    403,
    {
      currentPlan: "free",
      requiredPlan: "pro",
      feature: featureName,
      upgradeUrl: `/plans?upgrade=pro&from=${endpoint.replace(
        /\s+/g,
        "_"
      )}&reason=feature_blocked`,
    }
  );
}

/**
 * Rate limit exceeded response (429 Too Many Requests)
 */
export function buildRateLimitResponse(
  limit: number,
  window: string = "60 seconds"
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Too many requests. Please wait before retrying.",
        details: {
          limit,
          window,
          retryAfter: 60,
        },
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": "60",
      },
    }
  );
}

/**
 * Wrap success response with plan metadata
 */
export function buildSuccessResponse<T>(
  data: T,
  plan: string = "free",
  creditsRemaining?: number,
  limits?: Record<string, number>
): SuccessResponse<T> {
  return {
    ok: true,
    data,
    meta: {
      plan,
      creditsRemaining,
      limits,
    },
  };
}

/**
 * Build generic error response (non-plan errors)
 */
export function buildErrorResponse(
  code: string,
  message: string,
  statusCode: number = 400,
  details: Record<string, any> = {}
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status: statusCode }
  );
}

/**
 * Helper: Create Next Response with standardized error
 * Handles both plan gates and generic errors
 */
export function buildResponse<T = any>(
  config: {
    ok: boolean;
    data?: T;
    error?: { code: string; message: string; statusCode?: number };
    plan?: string;
    creditsRemaining?: number;
    limits?: Record<string, number>;
    headers?: Record<string, string>;
  }
): NextResponse {
  if (config.ok) {
    return NextResponse.json(
      buildSuccessResponse(
        config.data,
        config.plan,
        config.creditsRemaining,
        config.limits
      ),
      {
        status: 200,
        headers: config.headers,
      }
    );
  }

  if (!config.error) {
    return buildErrorResponse("unknown_error", "An unknown error occurred", 500);
  }

  if (config.error.code.startsWith("plan_")) {
    return buildPlanGateResponse(
      config.error.code,
      config.error.message,
      config.error.statusCode || 403,
      { currentPlan: config.plan || "free" }
    );
  }

  return buildErrorResponse(
    config.error.code,
    config.error.message,
    config.error.statusCode || 400
  );
}
