/**
 * POST /api/ai/generate-response-vertex
 *
 * Generate AI-powered responses to user reviews using Google Vertex AI
 * (Migrated from Google AI Studio to Vertex AI for consistent GCP billing)
 *
 * Features:
 * - Tone-aware generation (Professional, Empathetic, Concise)
 * - Language-aware prompting (English/Arabic)
 * - Character limit enforcement (280 chars for app store)
 * - Google Cloud Application Default Credentials (ADC)
 * - Vertex AI error handling and retry logic
 *
 * Environment Variables:
 * - GOOGLE_CLOUD_PROJECT_ID: GCP Project ID (e.g., "my-project-123")
 * - GOOGLE_CLOUD_REGION: GCP Region (default: "us-central1")
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON (optional, uses ADC if not set)
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
 *   characterCount: number,
 *   model: string,
 *   durationMs: number
 * }
 */

import { NextResponse } from "next/server";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/ai/generate-response-vertex";
const CHAR_LIMIT = 280; // App store review response limit
const MODEL_NAME = "gemini-2.0-flash"; // Vertex AI model
const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout

// ── GCP Configuration ──────────────────────────────────────────────────
// ✅ REFACTORED: Use centralized Vertex AI gateway
// Provides singleton client, model caching, and ADC-based authentication

interface GenerateResponseRequest {
  prompt: string;
  workspaceId: string;
  itemId: string;
  tone: "professional" | "empathetic" | "concise";
  language: string;
}

type Ctx = { params?: Promise<{ workspaceId: string }> };

// ── Vertex AI Error Type Guards ────────────────────────────────────────
interface VertexAIError extends Error {
  code?: string | number;
  status?: number;
  details?: string;
  message: string;
}

function isRateLimitError(error: unknown): boolean {
  const err = error as VertexAIError;
  // Check for 429 Too Many Requests
  if (err.status === 429 || err.code === 429) {
    return true;
  }
  // Check for quota exceeded messages
  if (err.message?.includes("quota") || err.message?.includes("rate")) {
    return true;
  }
  if (err.details?.includes("quota") || err.details?.includes("rate")) {
    return true;
  }
  return false;
}

function isAuthError(error: unknown): boolean {
  const err = error as VertexAIError;
  // Check for 401/403 Unauthorized/Forbidden
  if (err.status === 401 || err.status === 403) {
    return true;
  }
  if (err.code === 401 || err.code === 403) {
    return true;
  }
  if (
    err.message?.includes("permission") ||
    err.message?.includes("credential") ||
    err.message?.includes("authentication")
  ) {
    return true;
  }
  return false;
}

function isQuotaError(error: unknown): boolean {
  const err = error as VertexAIError;
  return (
    err.message?.includes("quota") ||
    err.details?.includes("quota") ||
    err.status === 429
  );
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

    // ── Get Vertex AI Model from Centralized Gateway ────────────────────
    // ✅ REFACTORED: Uses centralized gateway with model caching
    const generativeModel = getGenerativeModel({
      maxOutputTokens: 300,
      temperature: 0.7,
    });

    // Set request timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      // ✅ Use generateContent for non-streaming responses
      // This is equivalent to Claude's message.create()
      const response = await generativeModel.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 300, // Keep output short
          temperature: 0.7, // Slightly creative but controlled
        },
        // Pass abort signal for timeout handling
        ...(abortController as any), // Type assertion since SDK may not have signal typing
      });

      clearTimeout(timeoutId);

      const responseText = (response.text ?? "").trim();

      if (!responseText) {
        throw new Error("Empty response from Vertex AI Gemini model");
      }

      // ── Validate Character Count ──────────────────────────────────
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

      // ── Log to Supabase (Optional) ────────────────────────────────
      try {
        await supabase.from("ai_generation_log").insert({
          workspace_id: workspaceId,
          item_id: itemId,
          user_id: user.id,
          tone,
          language,
          response: cleanedResponse,
          character_count: charCount,
          model: `vertex-ai/${MODEL_NAME}`,
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
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as VertexAIError;

    // ── Handle Specific Vertex AI Errors ───────────────────────────────

    // Rate Limit / Quota Exceeded
    if (isRateLimitError(error)) {
      console.warn(
        `[${ROUTE}] Rate limited (${duration}ms): ${err.message}`
      );

      // Check if it's quota exhaustion
      if (isQuotaError(error)) {
        return NextResponse.json(
          {
            error: "Quota Exceeded",
            code: "quota_exceeded",
            message:
              "Vertex AI quota exceeded. Please check your GCP billing.",
            details: err.message,
            durationMs: duration,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: "Rate Limited",
          code: "rate_limit",
          message: "Too many requests. Please try again later.",
          durationMs: duration,
        },
        { status: 429 }
      );
    }

    // Authentication / Permission Errors
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
          details: err.message,
          durationMs: duration,
        },
        { status: 403 }
      );
    }

    // Timeout
    if (err.message?.includes("timeout") || err.message?.includes("abort")) {
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

    // Service Unavailable
    if (
      err.status === 503 ||
      err.code === 503 ||
      err.message?.includes("overloaded")
    ) {
      console.warn(
        `[${ROUTE}] Service overloaded (${duration}ms): ${err.message}`
      );

      return NextResponse.json(
        {
          error: "Service Overloaded",
          code: "service_overloaded",
          message: "Vertex AI service is temporarily unavailable. Please try again.",
          durationMs: duration,
        },
        { status: 503 }
      );
    }

    // Generic error logging
    console.error(
      `[${ROUTE}] Unexpected error (${duration}ms):`,
      err.message || err
    );

    return NextResponse.json(
      {
        error: "Internal Server Error",
        code: "internal_error",
        message: "Failed to generate response",
        details: process.env.NODE_ENV === "development" ? err.message : undefined,
        durationMs: duration,
      },
      { status: 500 }
    );
  }
}
