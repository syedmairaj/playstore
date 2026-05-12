export type PlanId = "free" | "pro" | "growth";

/** Negative sentinel: unlimited app slots (Growth). */
export const UNLIMITED_APP_SLOTS = -1;

export function maxAppSlotsForPlan(plan: PlanId): number {
  if (plan === "growth") return UNLIMITED_APP_SLOTS;
  if (plan === "pro") return 5;
  return 1;
}

export const PLAN_META: Record<
  PlanId,
  {
    label: string;
    apps: string;
    keywords: string;
    keywordLimit: number;
    aiCreditsMonthly: number;
    priceMonthly: number;
  }
> = {
  free: {
    label: "Free",
    apps: "1",
    keywords: "Limited",
    keywordLimit: 25,
    aiCreditsMonthly: 20,
    priceMonthly: 0,
  },
  pro: {
    label: "Pro",
    apps: "5",
    keywords: "Full tracking",
    keywordLimit: 500,
    aiCreditsMonthly: 200,
    priceMonthly: 29,
  },
  growth: {
    label: "Growth",
    apps: "Unlimited",
    keywords: "Full tracking",
    keywordLimit: 5000,
    aiCreditsMonthly: 800,
    priceMonthly: 59,
  },
};

/** Maps legacy DB values and aliases to current PlanId. */
export function normalizePlan(raw: string | null | undefined): PlanId {
  const v = (raw ?? "free").toLowerCase();
  if (v === "pro") return "pro";
  if (v === "growth" || v === "agency") return "growth";
  if (v === "free" || v === "starter") return "free";
  return "free";
}

export function planAiCredits(plan: PlanId): number {
  return PLAN_META[plan].aiCreditsMonthly;
}
