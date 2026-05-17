import { PRICING } from "@/constants/pricing";

export type PlanId = "free" | "pro" | "growth";

/**
 * Sentinel: unlimited app slots (legacy / future). Growth is capped at 12 apps in product spec.
 * Server responses may still surface `-1` from older data paths — treat as uncapped UI where needed.
 */
export const UNLIMITED_APP_SLOTS = -1;

export function maxAppSlotsForPlan(plan: PlanId): number {
  if (plan === "growth") return 12;
  if (plan === "pro") return 5;
  return 1;
}

export const PLAN_META: Record<
  PlanId,
  {
    label: string;
    /** Short display for app limits (e.g. hero cards). */
    apps: string;
    keywords: string;
    keywordLimit: number;
    /**
     * Included AI credits: Free = one-time pool size; Pro/Growth = monthly allowance (resets monthly).
     * DB `workspaces.ai_credits_monthly_allocation` may still hold legacy values (e.g. 800 for old
     * Growth/Agency rows from `supabase/migrations/20250514000000_ai_credits_and_plan_labels.sql`) until
     * a data migration aligns storage — UI and this module follow the product spec below.
     */
    aiCreditsMonthly: number;
    /** When false, credits are a one-time grant (Free). */
    aiCreditsResetMonthly: boolean;
    priceMonthly: number;
  }
> = {
  free: {
    label: "Free",
    apps: "1",
    keywords: "Limited",
    keywordLimit: 25,
    aiCreditsMonthly: 20,
    aiCreditsResetMonthly: false,
    priceMonthly: PRICING.free.monthly,
  },
  pro: {
    label: "Pro",
    apps: "5",
    keywords: "Full tracking",
    keywordLimit: 500,
    aiCreditsMonthly: 200,
    aiCreditsResetMonthly: true,
    priceMonthly: PRICING.pro.monthly,
  },
  growth: {
    label: "Growth",
    apps: "12",
    keywords: "Full tracking",
    keywordLimit: 5000,
    aiCreditsMonthly: 500,
    aiCreditsResetMonthly: true,
    priceMonthly: PRICING.growth.monthly,
  },
};

/** Maps legacy DB values and aliases to current PlanId (`agency` → Growth). */
export function normalizePlan(raw: string | null | undefined): PlanId {
  const v = (raw ?? "free").toLowerCase();
  if (v === "pro") return "pro";
  if (v === "growth" || v === "agency") return "growth";
  if (v === "free" || v === "starter") return "free";
  return "free";
}

/** Credit top-up packs: paid tiers only (not Free). */
export function canPurchaseCreditTopUps(plan: string): boolean {
  const id = normalizePlan(plan);
  return id === "pro" || id === "growth";
}

export function planAiCredits(plan: PlanId): number {
  return PLAN_META[plan].aiCreditsMonthly;
}
