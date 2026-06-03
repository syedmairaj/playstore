import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { generateReviewReplyDraft } from "@/lib/gemini/generate-review-reply";
import { resolveGeminiModel } from "@/lib/gemini/gemini-defaults";
import { logGeminiApiKeyDiagnostics } from "@/lib/gemini/log-gemini-env";
import { logAdminAiTransaction } from "@/lib/admin/log-ai-transaction";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { publishPlayStoreReply } from "@/lib/play-store/publish-play-store-reply";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/usage-log";
import { reviewReplyBodySchema } from "@/lib/validation/review-reply-body";
import { fetchProfileAccountStatus, isProfileAccessBlocked, suspendedAccountJsonResponse } from "@/lib/auth/profile-access";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/workspaces/[workspaceId]/reviews/[reviewId]/reply";

function rateLimitMax(): number {
  const raw = process.env.RATE_LIMIT_MAX;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

type Ctx = { params: Promise<{ workspaceId: string; reviewId: string }> };

async function resolvePackageName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  input: { packageName?: string; appId?: string },
): Promise<string | null> {
  if (input.packageName?.trim()) return input.packageName.trim();
  if (!input.appId) return null;

  const { data, error } = await supabase
    .from("apps")
    .select("package_name")
    .eq("workspace_id", workspaceId)
    .eq("id", input.appId)
    .maybeSingle();

  if (error || !data?.package_name || typeof data.package_name !== "string") {
    return null;
  }
  const pkg = data.package_name.trim();
  return pkg || null;
}

export async function POST(request: NextRequest, context: Ctx) {
  logGeminiApiKeyDiagnostics();
  const started = Date.now();
  const clientIp = getClientIp(request);
  const { workspaceId, reviewId } = await context.params;

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error";
    return NextResponse.json(
      { ok: false, error: { code: "config", message } },
      { status: 503 },
    );
  }

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

  const accountStatus = await fetchProfileAccountStatus(supabase, user.id);
  if (isProfileAccessBlocked(accountStatus)) {
    return NextResponse.json(suspendedAccountJsonResponse(), { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input;
  try {
    input = reviewReplyBodySchema.parse(body);
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

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible" } },
      { status: 403 },
    );
  }

  const rate = await consumeRateLimit(
    admin,
    `reviews_ai_reply:${user.id}`,
    rateLimitMax(),
  );
  if (!rate.allowed) {
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: "rate_limited",
      meta: { count: rate.count, user_id: user.id, review_id: reviewId },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "rate_limited",
          message: "Too many requests. Try again in a minute.",
        },
      },
      { status: 429 },
    );
  }

  const model = resolveGeminiModel();
  const creditCost = AI_CREDIT_COSTS.reviews_ai_reply;

  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
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

  let ledgerId: string | null = null;
  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: "Review AI Reply Response Generation",
    sourceType: "generation",
    meta: { route: ROUTE, tool: "reviews_ai_reply", model, review_id: reviewId },
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

  ledgerId = debit.ledgerId;

  const refundDebit = async (reason: string) => {
    if (!ledgerId) return;
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason,
    });
  };

  try {
    let reply = input.replyText?.trim() ?? "";
    if (!reply) {
      const generated = await generateReviewReplyDraft({
        reviewText: input.reviewText,
        rating: input.rating,
        replyLanguage: input.replyLanguage,
        appName: input.appName,
        userName: input.userName,
      });
      reply = generated.reply;
      void logAdminAiTransaction({
        providerService: "gemini",
        userId: user.id,
        workspaceId,
        featureSlug: "reviews_ai_reply",
        model,
        usage: generated.usage,
        creditsCharged: creditCost,
      });
    }

    const packageName = await resolvePackageName(supabase, workspaceId, {
      packageName: input.packageName,
      appId: input.appId,
    });

    let published = false;
    let publishSkipped = false;
    let publishSkipReason: string | undefined;

    if (packageName) {
      const publish = await publishPlayStoreReply({
        packageName,
        reviewId,
        replyText: reply,
      });

      if (!publish.ok) {
        await refundDebit("Play Store reply publish failed after debit");
        await logUsage(admin, {
          route: ROUTE,
          clientIp,
          success: false,
          durationMs: Date.now() - started,
          errorMessage: publish.error,
          meta: { user_id: user.id, workspace_id: workspaceId, review_id: reviewId },
        });
        return NextResponse.json(
          {
            ok: false,
            error: { code: "publish_error", message: publish.error },
          },
          { status: 502 },
        );
      }

      if (publish.published) {
        published = true;
      } else if (publish.skipped) {
        publishSkipped = true;
        publishSkipReason = publish.reason;
      }
    } else {
      publishSkipped = true;
      publishSkipReason = "no_package_name";
    }

    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        review_id: reviewId,
        model,
        published,
        publish_skipped: publishSkipped,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        reply,
        reviewId,
        published,
        publishSkipped,
        publishSkipReason,
      },
      meta: {
        model: input.replyText ? null : model,
        creditsCharged: creditCost,
        creditsRemaining: debit.balanceAfter,
      },
    });
  } catch (e) {
    await refundDebit(
      "Review AI reply generation or publish failed before a saved result",
    );
    const message =
      e instanceof Error ? e.message : "Reply generation failed unexpectedly";
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: message.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId, review_id: reviewId },
    });
    const status = message.includes("GEMINI_API_KEY") ? 503 : 500;
    return NextResponse.json(
      { ok: false, error: { code: "generation_error", message } },
      { status },
    );
  }
}
