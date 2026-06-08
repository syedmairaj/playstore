/**
 * Refactored Stage Button - Uses stageSignal Utility
 *
 * This button:
 * 1. Validates payload before submission
 * 2. Uses unified stageSignal() for all modules
 * 3. Shows "Saving..." → "✓ Staged" success state
 * 4. Provides module-specific error logging for debugging
 * 5. Supports all 6 modules with consistent interface
 */

"use client";

import { useState } from "react";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "next-intl";
import { Check, ChevronRight, AlertCircle } from "lucide-react";
import { stageSignal, StageSignalRequest } from "@/lib/staging-vault/stageSignal";
import { createClient } from "@/lib/supabase/client";

type SignalType = "keyword" | "review_issue" | "competitor_weakness" | "optimization_insight";
type SignalSource =
  | "keyword_spotlight"
  | "keyword_tracker"
  | "review_analysis"
  | "competitor_spy"
  | "manual"
  | "api";

type SourceContext =
  | "common_issues_theme"
  | "competitor_weakness"
  | "competitor_sentiment"
  | "keyword_spotlight"
  | "keyword_tracker_alert"
  | "market_opportunity"
  | "listing_analysis"
  | "manual";

interface StageButtonRefactoredProps {
  // ── Core Signal Data ──────────────────────────────────────────────────
  signalType: SignalType;
  content: string;
  source: SignalSource;
  sourceContext: SourceContext;
  sourceContextId: string;
  workspaceId: string;

  // ── Optional Data ─────────────────────────────────────────────────────
  sourceAppId?: string;
  metadata?: Record<string, any>;
  language?: string;
  onStaged?: (signal: { id: string }) => void;

  // ── UI Props ──────────────────────────────────────────────────────────
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  label?: string;

  // ── Module Name (for error logging) ───────────────────────────────────
  module?: "reviews" | "keyword_tracker" | "competitor_spy" | "market_intel" | "alerts" | "spotlight";
}

type ButtonState = "idle" | "loading" | "success" | "error";

export function StageButtonRefactored({
  signalType,
  content,
  source,
  sourceContext,
  sourceContextId,
  workspaceId,
  sourceAppId,
  metadata = {},
  language,
  onStaged,
  className = "",
  variant = "primary",
  size = "md",
  label,
  module = "unknown",
}: StageButtonRefactoredProps) {
  const [state, setState] = useState<ButtonState>("idle");
  const { showToast } = useToast();
  const locale = useLocale();

  const effectiveLanguage = (language || locale) as "en" | "ar";
  const isRtl = effectiveLanguage.startsWith("ar");

  // ── Get Button Label ──────────────────────────────────────────────────
  const getLabel = (): string => {
    if (label) return label;

    const labels: Record<SignalType, Record<string, string>> = {
      keyword: {
        en: "Stage to Vault",
        ar: "إضافة إلى الخزنة",
      },
      review_issue: {
        en: "Stage Issue",
        ar: "إضافة المشكلة",
      },
      competitor_weakness: {
        en: "Send to Optimizer",
        ar: "إضافة إلى مُحسّن القوائم",
      },
      optimization_insight: {
        en: "Stage Insight",
        ar: "إضافة الفكرة",
      },
    };

    const key = effectiveLanguage === "ar" ? "ar" : "en";
    return labels[signalType]?.[key] || "Stage";
  };

  // ── Validate Payload Before Submission ────────────────────────────────
  const validatePayload = (): { valid: boolean; error?: string } => {
    // Required fields
    if (!workspaceId) {
      return { valid: false, error: "Missing workspaceId" };
    }

    if (!content || content.trim().length === 0) {
      return { valid: false, error: "Signal content is empty" };
    }

    if (content.length > 5000) {
      return { valid: false, error: `Content exceeds 5000 chars (got ${content.length})` };
    }

    if (!sourceContext || sourceContext.length === 0) {
      return { valid: false, error: "Missing sourceContext" };
    }

    if (!sourceContextId || sourceContextId.length === 0) {
      return { valid: false, error: "Missing sourceContextId" };
    }

    // Validate sourceAppId if provided
    if (sourceAppId) {
      // Must be valid UUID format or empty
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(sourceAppId)) {
        return { valid: false, error: `Invalid sourceAppId format: "${sourceAppId}"` };
      }
    }

    // Validate metadata is object
    if (metadata && typeof metadata !== "object") {
      return { valid: false, error: `Metadata must be object, got ${typeof metadata}` };
    }

    return { valid: true };
  };

  const handleStage = async () => {
    if (state !== "idle") return;

    // ── Validate Payload ──────────────────────────────────────────────
    const validation = validatePayload();
    if (!validation.valid) {
      const errorMsg = `[${module.toUpperCase()}] Validation Error: ${validation.error}`;
      console.error("[StageButton]", errorMsg);
      console.error("[StageButton] Payload:", {
        workspaceId,
        signalType,
        source,
        sourceContext,
        sourceContextId,
        contentLength: content.length,
        metadata,
      });

      showToast({
        type: "error",
        title: isRtl ? "خطأ في التحقق" : "Validation Error",
        message: validation.error || "Invalid payload",
        duration: 4000,
      });
      return;
    }

    setState("loading");

    try {
      // ── Build stageSignal Request ──────────────────────────────────
      const supabase = await createClient();

      const request: StageSignalRequest = {
        workspace_id: workspaceId,
        signal_type: signalType,
        source,
        source_context: sourceContext,
        source_context_id: sourceContextId,
        content: content.trim(),
        language: effectiveLanguage,
        source_app_id: sourceAppId,
        metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
      };

      // ── Log Complete Payload for Verification ──────────────────────
      console.log(`[StageButton] [${module.toUpperCase()}] ═══════════════════════════════════`);
      console.log(`[StageButton] [${module.toUpperCase()}] PAYLOAD VERIFICATION (Before DB Write)`);
      console.log(`[StageButton] [${module.toUpperCase()}] ═══════════════════════════════════`);
      console.log(`[StageButton] [${module.toUpperCase()}] workspace_id:`, request.workspace_id);
      console.log(`[StageButton] [${module.toUpperCase()}] signal_type:`, request.signal_type);
      console.log(`[StageButton] [${module.toUpperCase()}] source:`, request.source);
      console.log(`[StageButton] [${module.toUpperCase()}] source_context:`, request.source_context);
      console.log(`[StageButton] [${module.toUpperCase()}] source_context_id:`, request.source_context_id);
      console.log(`[StageButton] [${module.toUpperCase()}] language:`, request.language);
      console.log(`[StageButton] [${module.toUpperCase()}] content (length=${request.content.length}):`, request.content);

      // Parse content if it's JSON
      try {
        const parsedContent = JSON.parse(request.content);
        console.log(`[StageButton] [${module.toUpperCase()}] content (parsed):`, parsedContent);
        if (parsedContent.keywords && Array.isArray(parsedContent.keywords)) {
          console.log(`[StageButton] [${module.toUpperCase()}] ✓ Keywords found in content:`, parsedContent.keywords);
        }
      } catch (e) {
        console.log(`[StageButton] [${module.toUpperCase()}] content is not JSON`);
      }

      console.log(`[StageButton] [${module.toUpperCase()}] metadata:`, request.metadata);
      if (request.metadata?.keywords) {
        console.log(`[StageButton] [${module.toUpperCase()}] ✓ Keywords found in metadata (${request.metadata.keywords.length} items):`, request.metadata.keywords);
      }

      console.log(`[StageButton] [${module.toUpperCase()}] source_app_id:`, request.source_app_id || "(not set)");
      console.log(`[StageButton] [${module.toUpperCase()}] ═══════════════════════════════════`);

      // ── Call stageSignal Utility ───────────────────────────────────
      const result = await stageSignal(supabase, request);

      console.log(`[StageButton] [${module.toUpperCase()}] ═══════════════════════════════════`);
      console.log(`[StageButton] [${module.toUpperCase()}] SUCCESS - Signal Stored in Vault`);
      console.log(`[StageButton] [${module.toUpperCase()}] ═══════════════════════════════════`);
      console.log(`[StageButton] [${module.toUpperCase()}] signal_id:`, result.id);
      console.log(`[StageButton] [${module.toUpperCase()}] signal_type:`, result.signal.signal_type);
      console.log(`[StageButton] [${module.toUpperCase()}] source_context:`, result.signal.source_context);
      console.log(`[StageButton] [${module.toUpperCase()}] created_at:`, result.signal.created_at);
      console.log(`[StageButton] [${module.toUpperCase()}] content (first 200 chars):`, result.signal.content?.substring(0, 200));
      if (result.signal.metadata) {
        console.log(`[StageButton] [${module.toUpperCase()}] metadata keys:`, Object.keys(result.signal.metadata));
        if (result.signal.metadata.keywords && Array.isArray(result.signal.metadata.keywords)) {
          console.log(`[StageButton] [${module.toUpperCase()}] ✓ Retrieved keywords from metadata (${result.signal.metadata.keywords.length}):`, result.signal.metadata.keywords);
        }
      }
      console.log(`[StageButton] [${module.toUpperCase()}] ═══════════════════════════════════`);

      // ── Show Success State ─────────────────────────────────────────
      setState("success");

      const successMsg = isRtl
        ? `تم إضافة "${content.substring(0, 30)}${content.length > 30 ? "..." : ""}"`
        : `Staged: "${content.substring(0, 30)}${content.length > 30 ? "..." : ""}"`;

      showToast({
        type: "success",
        title: isRtl ? "تمت الإضافة بنجاح" : "Successfully Staged",
        message: successMsg,
        duration: 3000,
      });

      onStaged?.(result.signal);

      // Reset after delay
      setTimeout(() => setState("idle"), 2000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error(`[StageButton] [${module.toUpperCase()}] FAILED:`, {
        error: errorMsg,
        workspace_id: workspaceId,
        signal_type: signalType,
        source_context: sourceContext,
        source_context_id: sourceContextId,
      });

      setState("error");

      showToast({
        type: "error",
        title: isRtl ? "فشل في الإضافة" : "Failed to Stage",
        message: errorMsg,
        duration: 5000,
      });

      // Reset after delay
      setTimeout(() => setState("idle"), 2000);
    }
  };

  // ── Variant Styles ────────────────────────────────────────────────────
  const variantStyles: Record<string, string> = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-600",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-900 disabled:bg-gray-200",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-700 border border-gray-300 disabled:hover:bg-transparent",
  };

  // ── Size Styles ───────────────────────────────────────────────────────
  const sizeStyles: Record<string, string> = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-2 text-sm",
    lg: "px-4 py-2.5 text-base",
  };

  // ── State Colors ──────────────────────────────────────────────────────
  let stateStyles = variantStyles[variant];
  if (state === "loading") {
    stateStyles = "bg-blue-500 text-white";
  } else if (state === "success") {
    stateStyles = "bg-green-600 text-white";
  } else if (state === "error") {
    stateStyles = "bg-red-600 text-white";
  }

  return (
    <button
      onClick={handleStage}
      disabled={state !== "idle"}
      dir={isRtl ? "rtl" : "ltr"}
      className={`
        flex items-center justify-center gap-2
        font-medium rounded transition-all duration-200
        disabled:opacity-75 disabled:cursor-not-allowed
        ${stateStyles}
        ${sizeStyles[size]}
        ${className}
      `}
      title={getLabel()}
      aria-label={getLabel()}
    >
      {state === "loading" && (
        <>
          <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
          <span>{isRtl ? "جاري الإضافة..." : "Staging..."}</span>
        </>
      )}

      {state === "success" && (
        <>
          <Check className="w-4 h-4" />
          <span>{isRtl ? "تمت الإضافة" : "Staged"}</span>
        </>
      )}

      {state === "error" && (
        <>
          <AlertCircle className="w-4 h-4" />
          <span>{isRtl ? "فشل" : "Failed"}</span>
        </>
      )}

      {state === "idle" && (
        <>
          <span>{getLabel()}</span>
          {!isRtl && <ChevronRight className="w-4 h-4" />}
        </>
      )}
    </button>
  );
}

export default StageButtonRefactored;
