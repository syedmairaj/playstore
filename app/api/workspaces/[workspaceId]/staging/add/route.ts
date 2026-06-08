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

  // ═════════════════════════════════════════════════════════════════════
  // DEBUG TRACER #1: Log incoming request
  // ═════════════════════════════════════════════════════════════════════
  console.log(`\n[${ROUTE}] 🔍 INCOMING REQUEST`);
  console.log(`  workspaceId: ${workspaceId}`);
  console.log(`  timestamp: ${new Date().toISOString()}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error(`[${ROUTE}] ❌ UNAUTHORIZED - No user`);
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  console.log(`  userId: ${user.id}`);

  // Verify workspace membership
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    console.error(`[${ROUTE}] ❌ FORBIDDEN - Not a workspace member`);
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  console.log(`  role: ${role}`);

  // Parse request body
  let body: z.infer<typeof bodySchema>;
  try {
    const rawBody = await request.json();

    // ═════════════════════════════════════════════════════════════════════
    // DEBUG TRACER #2: Log raw request body
    // ═════════════════════════════════════════════════════════════════════
    console.log(`[${ROUTE}] 🔍 REQUEST BODY (raw)`);
    console.log(`  signalType: ${rawBody.signalType}`);
    console.log(`  language: ${rawBody.language}`);
    console.log(`  source: ${rawBody.source}`);
    console.log(`  sourceContextId: ${rawBody.sourceContextId}`);
    console.log(`  metadataType: ${typeof rawBody.metadata}`);
    if (rawBody.metadata) {
      console.log(`  metadata.competitor_id: ${(rawBody.metadata as any)?.competitor_id}`);
      console.log(`  metadata keys: ${Object.keys(rawBody.metadata || {}).join(', ')}`);
    }
    console.log(`  content length: ${rawBody.content?.length || 0}`);

    body = bodySchema.parse(rawBody);

    console.log(`[${ROUTE}] ✓ Request body validation passed`);
  } catch (err) {
    if (err instanceof ZodError) {
      console.error(`[${ROUTE}] ❌ VALIDATION ERROR:`, err.errors);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation",
            message: err.errors[0]?.message ?? "Invalid request",
            details: err.errors,
          },
        },
        { status: 422 }
      );
    }
    console.error(`[${ROUTE}] ❌ PARSE ERROR:`, err);
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 }
    );
  }

  try {
    // ═════════════════════════════════════════════════════════════════════
    // DEBUG TRACER #3: About to call addSignalToVault
    // ═════════════════════════════════════════════════════════════════════
    console.log(`[${ROUTE}] 🔍 CALLING addSignalToVault with:`);
    console.log(`  workspaceId: ${workspaceId}`);
    console.log(`  body.signalType: ${body.signalType}`);
    console.log(`  body.language: ${body.language}`);
    console.log(`  body.metadata.competitor_id: ${(body.metadata as any)?.competitor_id}`);

    // Add signal to vault
    const result = await addSignalToVault(supabase, workspaceId, body);

    // ═════════════════════════════════════════════════════════════════════
    // DEBUG TRACER #4: addSignalToVault succeeded
    // ═════════════════════════════════════════════════════════════════════
    console.log(`[${ROUTE}] ✅ addSignalToVault succeeded`);
    console.log(`  signalId: ${result.id}`);
    console.log(`  message: ${result.message}`);

    return NextResponse.json({
      ok: true,
      data: {
        id: result.id,
        message: result.message,
      },
    });
  } catch (error) {
    // ═════════════════════════════════════════════════════════════════════
    // DEBUG TRACER #5: addSignalToVault failed
    // ═════════════════════════════════════════════════════════════════════
    console.error(`[${ROUTE}] ❌ addSignalToVault failed`);
    console.error(`  error: ${error}`);
    console.error(`  fullError:`, error);

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
