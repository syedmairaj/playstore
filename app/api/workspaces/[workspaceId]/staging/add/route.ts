/**
 * POST /api/workspaces/[workspaceId]/staging/add
 *
 * Add a signal to workspace staging vault.
 * Replaces navigational 'Send to Optimizer' pattern.
 *
 * Non-blocking: Returns immediately after queueing.
 * Toast notification shown on client for UX confirmation.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { addSignalToVault } from "@/lib/staging-vault/staging-vault-service";

const ROUTE = "POST /api/workspaces/[workspaceId]/staging/add";

const bodySchema = z.object({
  signalType: z.enum(["keyword", "review_issue", "competitor_weakness", "optimization_insight"]),
  content: z.string().min(1).max(5000),
  source: z
    .enum([
      "keyword_spotlight",
      "keyword_tracker",
      "review_analysis",
      "competitor_spy",
      "manual",
      "api",
    ])
    .optional(),
  sourceAppId: z.string().uuid().optional(),
  sourceContext: z.string().optional(),
  sourceContextId: z.string().optional(),
  language: z.string().default("en"),
  metadata: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
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
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  // Verify workspace membership
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  // Parse request body
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation",
            message: err.errors[0]?.message ?? "Invalid request",
          },
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 }
    );
  }

  try {
    // Add signal to vault
    const result = await addSignalToVault(supabase, workspaceId, body);

    return NextResponse.json({
      ok: true,
      data: {
        id: result.id,
        message: result.message,
      },
    });
  } catch (error) {
    console.error(`[${ROUTE}] Error:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "staging_error",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
