import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import {
  buildInsufficientAiCreditsPayload,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import {
  SerperNotConfiguredError,
  isSerperConfigured,
  searchPlayStore,
} from "@/lib/serper";
import { serperSearchBodySchema } from "@/lib/validation/serper-search-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/serper/play-store-search";

/**
 * Live Play Store preview powered by Serper.dev (server-only key).
 *
 * Auth: signed-in workspace member. We require `workspaceId` rather than gating
 * on a global `profiles` flag so Serper usage is naturally scoped to a tenant
 * the caller already belongs to (and so future per-workspace quotas slot in).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  let parsed: ReturnType<typeof serperSearchBodySchema.parse>;
  try {
    parsed = serperSearchBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation_error",
            message: "Invalid input",
            details: e.flatten(),
          },
        },
        { status: 400 },
      );
    }
    throw e;
  }

  const role = await getWorkspaceRole(supabase, parsed.workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  if (!isSerperConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "serper_not_configured",
          message:
            "Live Play Store search is not configured on this server. Set SERPER_API_KEY to enable it.",
        },
      },
      { status: 503 },
    );
  }

  const creditCost =
    parsed.countries.length * AI_CREDIT_COSTS.serper_preview_per_country;

  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, parsed.workspaceId);
  if (!balancePre.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "wallet_error",
          message: "Could not read AI credit balance. Try again shortly.",
        },
      },
      { status: 503 },
    );
  }
  if (balancePre.remaining < creditCost) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balancePre.remaining),
      { status: 402 },
    );
  }

  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId: parsed.workspaceId,
    userId: user.id,
    amount: creditCost,
    description: "serper_preview",
    sourceType: "generation",
    meta: {
      route: ROUTE,
      keyword: parsed.keyword,
      countries: parsed.countries,
      restrictToPlayStore: parsed.restrictToPlayStore ?? false,
    },
  });

  if (!debit.ok) {
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(
          debit.required ?? creditCost,
          debit.remaining ?? 0,
        ),
        { status: 402 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "wallet_error",
          message: "Could not reserve credits. Try again shortly.",
        },
      },
      { status: 503 },
    );
  }

  const ledgerId = debit.ledgerId;

  try {
    const results = await searchPlayStore(parsed.keyword, parsed.countries, {
      restrictToPlayStore: parsed.restrictToPlayStore ?? false,
    });
    return NextResponse.json({ ok: true, results, creditsCharged: creditCost });
  } catch (e) {
    const refund = await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "serper_preview_failed",
    });
    if (!refund.ok) {
      console.error(`[${ROUTE}] refund_failed`, refund.code, { ledgerId });
    }

    if (e instanceof SerperNotConfiguredError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "serper_not_configured",
            message: "Live Play Store search is not configured on this server.",
          },
        },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : "Search failed";
    console.error(`[${ROUTE}]`, msg);
    return NextResponse.json(
      { ok: false, error: { code: "search_error", message: msg } },
      { status: 502 },
    );
  }
}
