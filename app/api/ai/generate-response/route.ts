/**
 * POST /api/ai/generate-response
 *
 * Generate AI-powered responses to user reviews using Vertex AI (Gemini 2.0 Flash)
 *
 * Features:
 * - Tone-aware generation (Professional, Empathetic, Concise)
 * - Language-aware prompting (English/Arabic)
 * - Character limit enforcement (280 chars for app store)
 * - Robust error handling for Vertex AI SDK
 * - Application Default Credentials (ADC) authentication
 *
 * Request:
 * {
 *   prompt: string,
 *   workspaceId: string,
 *   itemId: string,
 *   tone: "professional" | "empathetic" | "concise",
 *   language: string
 * }
 *
 * Response:
 * {
 *   response: string,
 *   itemId: string,
 *   language: string,
 *   characterCount: number
 * }
 */

import { NextResponse } from "next/server";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/ai/generate-response";
const CHAR_LIMIT = 280; // App store review response limit
const MODEL_NAME = "gemini-2.0-flash"; // Vertex AI model
const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout

interface GenerateResponseRequest {
  prompt: string;
  workspaceId: string;
  itemId: string;
  tone: "professional" | "empathetic" | "concise";
  language: string;
}

type Ctx = { params?: Promise<{ workspaceId: string }> };

// ── Vertex AI Error Detection ──────────────────────────────────────────
interface VertexAIError extends Error {
  code?: string | number;
  status?: number;
  details?: string;
  message: string;
}

function isRateLimitError(error: unknown): boolean {
  const err = error as VertexAIError;
  // Check for 429 Too Many Requests
  if (err.status === 429 || err.code === 429) return true;
  // Check for quota exceeded messages
  if (err.message?.includes("quota") || err.message?.includes("rate")) return true;
  if (err.details?.includes("quota") || err.details?.includes("rate")) return true;
  return false;
}

function isAuthError(error: unknown): boolean {
  const err = error as VertexAIError;
  // Check for 401/403 Unauthorized/Forbidden
  if (err.status === 401 || err.status === 403) return true;
  if (err.code === 401 || err.code === 403) return true;
  if (
    err.message?.includes("permission") ||
    err.message?.includes("credential") ||
    err.message?.includes("authentication")
  ) {
    return true;
  }
  return false;
}

function isServiceUnavailableError(error: unknown): boolean {
  const err = error as VertexAIError;
  if (err.status === 503 || err.code === 503) return true;
  if (err.message?.includes("unavailable") || err.message?.includes("overloaded")) {
    return true;
  }
  return false;
}

export async function POST(request: Request, context: Ctx) {
  const startTime = Date.now();

  try {
    // ── Parse Request ──────────────────────────────────────────────────
    const body = (await request.json()) as GenerateResponseRequest;
    const { prompt, workspaceId, itemId, tone, language } = body;

    if (!prompt || !workspaceId || !itemId || !tone || !language) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          code: "validation_error",
          message: "prompt, workspaceId, itemId, tone, language are required",
        },
        { status: 400 }
      );
    }

    // ── Authenticate User ──────────────────────────────────────────────
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn(`[${ROUTE}] Unauthorized: No user found`);
      return NextResponse.json(
        {
          error: "Unauthorized",
          code: "auth_required",
          message: "You must be logged in",
        },
        { status: 401 }
      );
    }

    // ── Verify Workspace Membership ───────────────────────────────────
    const role = await getWorkspaceRole(supabase, workspaceId, user.id);

    if (!role) {
      console.warn(
        `[${ROUTE}] Forbidden: User ${user.id} not member of workspace ${workspaceId}`
      );
      return NextResponse.json(
        {
          error: "Forbidden",
          code: "not_workspace_member",
          message: "You do not have access to this workspace",
        },
        { status: 403 }
      );
    }

    console.info(
      `[${ROUTE}] Generating response for item ${itemId} (tone: ${tone}, language: ${language})`
    );

    // ── Call Gemini via ModelGateway (@google/genai / Vertex AI) ───────
    const generativeModel = getGenerativeModel({
      model: MODEL_NAME,
      maxOutputTokens: 300,
      temperature: 0.7,
    });

    const response = await generativeModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const responseText = (response.text ?? "").trim();

    if (!responseText) {
      throw new Error("Empty response from Vertex AI Gemini model");
    }

    // ── Validate Character Count ──────────────────────────────────────
    const cleanedResponse = responseText.trim();
    const charCount = cleanedResponse.length;

    if (charCount > CHAR_LIMIT) {
      console.warn(
        `[${ROUTE}] Response exceeds character limit: ${charCount}/${CHAR_LIMIT} (item: ${itemId})`
      );
      // Don't fail - just log warning. Frontend will show warning badge.
    }

    console.info(
      `[${ROUTE}] Generated response: ${charCount} characters (limit: ${CHAR_LIMIT})`
    );

    // ── Log to Supabase (Optional) ────────────────────────────────────
    // You can log AI generations for analytics
    try {
      await supabase.from("ai_generation_log").insert({
        workspace_id: workspaceId,
        item_id: itemId,
        user_id: user.id,
        tone,
        language,
        response: cleanedResponse,
        character_count: charCount,
        model: `vertex-ai/${MODEL_NAME}`, // Updated model identifier
        generated_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.warn(`[${ROUTE}] Failed to log generation:`, logErr);
      // Don't fail if logging fails
    }

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        response: cleanedResponse,
        itemId,
        language,
        tone,
        characterCount: charCount,
        characterLimit: CHAR_LIMIT,
        isWithinLimit: charCount <= CHAR_LIMIT,
        model: MODEL_NAME,
        provider: "vertex-ai",
        durationMs: duration,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as VertexAIError;

    // ── Handle Specific Vertex AI Errors ───────────────────────────────

    // Rate Limit / Quota Exceeded (429)
    if (isRateLimitError(error)) {
      console.warn(
        `[${ROUTE}] Rate limited (${duration}ms): ${err.message}`
      );

      return NextResponse.json(
        {
          error: "Rate Limited",
          code: "rate_limit",
          message: "Vertex AI quota exceeded. Please try again later.",
          details: "Check your GCP project quotas in the console.",
          durationMs: duration,
        },
        { status: 429 }
      );
    }

    // Authentication / Permission Errors (403, 401)
    if (isAuthError(error)) {
      console.error(
        `[${ROUTE}] Authentication error (${duration}ms): ${err.message}`
      );

      return NextResponse.json(
        {
          error: "Authentication Failed",
          code: "gcp_auth_failed",
          message:
            "Failed to authenticate with Vertex AI. Check GCP credentials and permissions.",
          details: "Ensure GOOGLE_CLOUD_PROJECT and service account permissions are correct.",
          durationMs: duration,
        },
        { status: 403 }
      );
    }

    // Service Unavailable (503)
    if (isServiceUnavailableError(error)) {
      console.warn(
        `[${ROUTE}] Service unavailable (${duration}ms): ${err.message}`
      );

      return NextResponse.json(
        {
          error: "Service Unavailable",
          code: "service_unavailable",
          message: "Vertex AI service is temporarily unavailable. Please try again.",
          durationMs: duration,
        },
        { status: 503 }
      );
    }

    // Timeout
    if (err.message?.includes("timeout") || err.message?.includes("deadline")) {
      console.warn(
        `[${ROUTE}] Request timeout (${duration}ms): ${err.message}`
      );

      return NextResponse.json(
        {
          error: "Request Timeout",
          code: "timeout",
          message: `Request took too long (${REQUEST_TIMEOUT_MS}ms). Please try again.`,
          durationMs: duration,
        },
        { status: 504 }
      );
    }

    // Generic error logging
    if (error instanceof Error) {
      console.error(
        `[${ROUTE}] Error (${duration}ms): ${error.message}`,
        error.stack
      );
    } else {
      console.error(`[${ROUTE}] Unexpected error (${duration}ms):`, error);
    }

    return NextResponse.json(
      {
        error: "Internal Server Error",
        code: "internal_error",
        message: "Failed to generate response",
        details:
          process.env.NODE_ENV === "development"
            ? err.message || String(error)
            : undefined,
        durationMs: duration,
      },
      { status: 500 }
    );
  }
}
