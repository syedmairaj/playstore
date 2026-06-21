import { NextResponse } from "next/server";
import { z } from "zod";
import { PRICING } from "@/constants/pricing";
import { resolveWorkspaceBillingPlan } from "@/lib/utils/app-limits";
import { appBaseUrl, getStripe, isStripeConfigured } from "@/lib/stripe/stripe-server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string }> };

function estimateProratedUsd(periodEnd?: Date | null): {
  proratedUsd: number;
  daysRemaining: number;
  daysInPeriod: number;
} {
  const now = new Date();
  const end =
    periodEnd && periodEnd > now
      ? periodEnd
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const msPerDay = 86_400_000;
  const daysInPeriod = Math.max(
    28,
    Math.ceil(
      (new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() -
        new Date(now.getFullYear(), now.getMonth(), 1).getTime()) /
        msPerDay,
    ),
  );
  const daysRemaining = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / msPerDay));
  const monthlyDelta = PRICING.growth.monthly - PRICING.pro.monthly;
  const proratedUsd = Math.round(((monthlyDelta * daysRemaining) / daysInPeriod) * 100) / 100;
  return { proratedUsd, daysRemaining, daysInPeriod };
}

async function loadProUpgradeQuote(workspaceId: string, userId: string) {
  const supabase = await createClient();
  const role = await getWorkspaceRole(supabase, workspaceId, userId);
  if (!role) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const { normalized: currentPlan } = await resolveWorkspaceBillingPlan(
    supabase,
    workspaceId,
    userId,
  );

  if (currentPlan !== "pro") {
    return {
      ok: true as const,
      eligible: false,
      currentPlan,
      targetPlan: "growth" as const,
    };
  }

  let stripeProratedUsd: number | null = null;
  let periodEnd: Date | null = null;

  if (isStripeConfigured()) {
    const { data: subRow } = await supabase
      .from("user_subscriptions")
      .select("stripe_subscription_id, current_period_end")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const subscriptionId =
      typeof subRow?.stripe_subscription_id === "string"
        ? subRow.stripe_subscription_id
        : null;

    if (subscriptionId) {
      try {
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const itemId = subscription.items.data[0]?.id;
        if (itemId) {
          const upcoming = await stripe.invoices.retrieveUpcoming({
            subscription: subscriptionId,
            subscription_items: [
              {
                id: itemId,
                price_data: {
                  currency: "usd",
                  unit_amount: Math.round(PRICING.growth.monthly * 100),
                  recurring: { interval: "month" },
                  product_data: { name: "Growth Plan" },
                },
              },
            ],
          });
          if (typeof upcoming.amount_due === "number") {
            stripeProratedUsd = Math.round(upcoming.amount_due) / 100;
          }
        }
        if (subRow?.current_period_end) {
          periodEnd = new Date(subRow.current_period_end);
        }
      } catch {
        stripeProratedUsd = null;
      }
    }
  }

  const estimate = estimateProratedUsd(periodEnd);

  return {
    ok: true as const,
    eligible: true,
    currentPlan,
    targetPlan: "growth" as const,
    currentPlanMonthlyUsd: PRICING.pro.monthly,
    targetPlanMonthlyUsd: PRICING.growth.monthly,
    proratedUsd: stripeProratedUsd ?? estimate.proratedUsd,
    source: stripeProratedUsd != null ? ("stripe" as const) : ("estimate" as const),
    daysRemaining: estimate.daysRemaining,
    daysInPeriod: estimate.daysInPeriod,
  };
}

export async function GET(_request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const quote = await loadProUpgradeQuote(workspaceId, user.id);
  if (!quote.ok) {
    return NextResponse.json(
      { ok: false, error: { code: quote.error, message: "Workspace not accessible." } },
      { status: quote.status },
    );
  }

  return NextResponse.json({ ok: true, ...quote });
}

const postBodySchema = z.object({
  locale: z.enum(["en", "ar"]).optional(),
});

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const quote = await loadProUpgradeQuote(workspaceId, user.id);
  if (!quote.ok) {
    return NextResponse.json(
      { ok: false, error: { code: quote.error, message: "Workspace not accessible." } },
      { status: quote.status },
    );
  }

  if (!quote.eligible) {
    return NextResponse.json(
      { ok: false, error: { code: "not_eligible", message: "Upgrade not available." } },
      { status: 400 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "stripe_not_configured", message: "Stripe billing is not configured." },
      },
      { status: 503 },
    );
  }

  let locale: "en" | "ar" = "en";
  try {
    const body = postBodySchema.parse(await request.json());
    if (body.locale === "ar") locale = "ar";
  } catch {
    /* optional body */
  }

  const base = appBaseUrl();
  const returnPath = `/${locale}/app/${workspaceId}/settings?upgrade=growth`;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(PRICING.growth.monthly * 100),
          recurring: { interval: "month" },
          product_data: {
            name: "Growth Plan",
            description: "Prorated upgrade from Pro — immediate access to Growth limits.",
          },
        },
      },
    ],
    metadata: {
      kind: "prorated_upgrade",
      workspace_id: workspaceId,
      user_id: user.id,
      from_plan: "pro",
      to_plan: "growth",
    },
    success_url: `${base}${returnPath}&checkout=success`,
    cancel_url: `${base}${returnPath}&checkout=cancelled`,
  });

  return NextResponse.json({
    ok: true,
    checkoutUrl: session.url,
    proratedUsd: quote.proratedUsd,
  });
}
