import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCreditPack } from "@/lib/features/billing/credit-packs";
import { canPurchaseCreditTopUps } from "@/lib/plan-limits";
import { resolveWorkspaceBillingPlan } from "@/lib/utils/app-limits";
import { appBaseUrl, getStripe, isStripeConfigured } from "@/lib/stripe/stripe-server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const bodySchema = z.object({
  packId: z.string().trim().min(1),
  locale: z.string().optional(),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

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

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not accessible." } },
      { status: 403 },
    );
  }

  const { normalized: plan } = await resolveWorkspaceBillingPlan(supabase, workspaceId, user.id);
  if (!canPurchaseCreditTopUps(plan)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "plan_gate",
          message: "Credit top-ups require a Pro or Growth plan.",
        },
      },
      { status: 403 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: "Invalid request body." } },
      { status: 400 },
    );
  }

  const pack = resolveCreditPack(body.packId);
  if (!pack) {
    return NextResponse.json(
      { ok: false, error: { code: "unknown_pack", message: "Unknown credit pack." } },
      { status: 400 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "stripe_not_configured",
          message: "Stripe checkout is not configured for this environment.",
        },
      },
      { status: 503 },
    );
  }

  const locale = body.locale === "ar" ? "ar" : "en";
  const base = appBaseUrl();
  const returnPath = `/${locale}/app/${workspaceId}/listing-optimizer`;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(pack.priceUsd * 100),
          product_data: {
            name: pack.name,
            description: `${pack.credits} AI credits — one-time top-up (does not change your subscription).`,
          },
        },
      },
    ],
    metadata: {
      kind: "credit_topup",
      pack_id: pack.id,
      workspace_id: workspaceId,
      user_id: user.id,
      credits: String(pack.credits),
    },
    success_url: `${base}${returnPath}?topup=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}${returnPath}?topup=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json(
      { ok: false, error: { code: "checkout_failed", message: "Could not start checkout." } },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    checkoutUrl: session.url,
    sessionId: session.id,
    pack: { id: pack.id, credits: pack.credits, priceUsd: pack.priceUsd },
  });
}
