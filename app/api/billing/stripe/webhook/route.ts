import { NextResponse } from "next/server";
import { grantWorkspaceAiCredits } from "@/lib/features/billing/grant-workspace-credits";
import { resolveCreditPack } from "@/lib/features/billing/credit-packs";
import { getStripe, isStripeConfigured } from "@/lib/stripe/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !webhookSecret) {
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }

  const stripe = getStripe();
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const session = event.data.object;
  const metadata = session.metadata ?? {};
  if (metadata.kind !== "credit_topup") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const workspaceId = metadata.workspace_id;
  const userId = metadata.user_id;
  const packId = metadata.pack_id;
  const pack = packId ? resolveCreditPack(packId) : null;

  if (!workspaceId || !userId || !pack) {
    return NextResponse.json({ ok: false, error: "invalid_metadata" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const grant = await grantWorkspaceAiCredits(admin, {
    workspaceId,
    userId,
    amount: pack.credits,
    description: `${pack.name} (${pack.credits} credits)`,
    meta: {
      stripe_session_id: session.id,
      pack_id: pack.id,
      payment_intent: session.payment_intent,
    },
  });

  if (!grant.ok) {
    return NextResponse.json({ ok: false, error: grant.code }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balanceAfter: grant.balanceAfter });
}
