/**
 * Unified Stage Button Component
 *
 * Enhanced StageButton that integrates with unified state management.
 * Handles:
 * - Auto-archive on successful staging
 * - Real-time Optimizer synchronization
 * - Centralized error handling
 * - RTL/LTR layout support
 * - Language-aware notifications
 */

"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import {
  createOnStageSuccessHandler,
  triggerOptimizerSync,
  buildStagingMetadata,
  getLocaleMessage,
  type OnStageSuccessParams,
  type SignalType,
  type UnifiedStagingStateOptions,
} from "@/lib/staging/unified-staging-state";

interface UnifiedStageButtonProps {
  // Staging configuration
  signalType: SignalType;
  signalId: string; // Unique ID for this signal (keyword, issue ID, alert ID, etc.)
  content: string; // Primary content to stage
  source: string; // Source identifier (keyword_tracker, review_analysis, competitor_spy, api)
  sourceAppId?: string;
  sourceContext?: string;
  sourceContextId?: string;

  // Workspace context
  workspaceId: string;

  // Metadata
  metadata?: Record<string, unknown>;
  language?: string;

  // State management callbacks
  onStageSuccess?: (params: OnStageSuccessParams) => Promise<void> | void;
  onStageError?: (error: Error) => Promise<void> | void;
  onArchiveItem?: (signalId: string) => void; // Move item to archive in local UI

  // Optimizer synchronization
  optimizerMutate?: (key: string | string[]) => Promise<any>;
  syncOptimizer?: boolean; // Whether to sync Optimizer after staging

  // UI configuration
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;

  // Accessibility
  disabled?: boolean;
}

export function UnifiedStageButton({
  signalType,
  signalId,
  content,
  source,
  sourceAppId,
  sourceContext,
  sourceContextId,
  workspaceId,
  metadata,
  language = "en",
  onStageSuccess,
  onStageError,
  onArchiveItem,
  optimizerMutate,
  syncOptimizer = true,
  variant = "primary",
  size = "sm",
  className,
  label,
  disabled = false,
}: UnifiedStageButtonProps) {
  const [loading, setLoading] = useState(false);
  const [staged, setStaged] = useState(false);
  const { showToast } = useToast();

  const isRtl = ["ar", "he", "fa", "ur"].includes(language);

  // Create unified handler
  const handleStageSuccess = createOnStageSuccessHandler({
    onStageSuccess: async (params: OnStageSuccessParams) => {
      // Step 1: Move item to archive in local UI
      onArchiveItem?.(signalId);

      // Step 2: Execute custom callback
      if (onStageSuccess) {
        await onStageSuccess(params);
      }

      // Step 3: Sync Optimizer if enabled
      if (syncOptimizer) {
        try {
          await triggerOptimizerSync({
            workspaceId,
            mutate: optimizerMutate,
            onSyncSuccess: () => {
              showToast({
                type: "success",
                title: getLocaleMessage(language, "sync_success"),
                message: `${content} added to active context`,
                duration: 2000,
              });
            },
            onSyncError: (error) => {
              console.warn("[UnifiedStageButton] Optimizer sync warning:", error);
              // Don't fail if optimizer sync fails - staging was successful
              showToast({
                type: "info",
                title: "Staged to vault",
                message: "Optimizer sync pending",
                duration: 2000,
              });
            },
          });
        } catch (syncError) {
          console.error("[UnifiedStageButton] Optimizer sync failed:", syncError);
        }
      }
    },
    onStageError,
  });

  const handleStage = async () => {
    // DEBUG: Very first line - button click detected
    console.log("🎯 [UnifiedStageButton] Stage button clicked, triggering action...");
    alert("✅ Button clicked! Starting staging process...");

    if (loading || staged || disabled) {
      console.warn(
        "[UnifiedStageButton] Guard condition blocked stage action:",
        { loading, staged, disabled }
      );
      alert("⚠️ Guard condition triggered: button already loading, staged, or disabled");
      return;
    }

    console.log("[UnifiedStageButton] Passing guard conditions, initializing...");
    setLoading(true);

    try {
      // DEBUG: Before building metadata
      console.log("[UnifiedStageButton] Building staging metadata...", {
        signalType,
        signalId,
        content,
        source,
      });

      // Build metadata
      const stagingMetadata = buildStagingMetadata({
        signalType,
        language,
        customFields: metadata,
      });

      console.log("[UnifiedStageButton] Metadata built successfully:", stagingMetadata);

      // DEBUG: Before API call
      const apiUrl = `/api/workspaces/${workspaceId}/staging/add`;
      const apiPayload = {
        signalType,
        content,
        source,
        sourceAppId,
        sourceContext,
        sourceContextId,
        language,
        metadata: stagingMetadata,
      };

      console.log("[UnifiedStageButton] API Call Details:", {
        url: apiUrl,
        method: "POST",
        payload: apiPayload,
      });

      alert("🔄 API Call started... Sending request to staging endpoint");

      // Make API call
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });

      console.log("[UnifiedStageButton] API Response received:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      alert(`✅ API Call successful! Status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[UnifiedStageButton] API Error Response Body:", errorText);
        throw new Error(
          `Failed to stage: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Parse response
      const responseData = await response.json();
      console.log("[UnifiedStageButton] API Response data:", responseData);

      // Mark as staged
      console.log("[UnifiedStageButton] Marking button as staged...");
      setStaged(true);

      // DEBUG: Before archive callback
      console.log("[UnifiedStageButton] Executing onArchiveItem callback...", {
        signalId,
      });
      onArchiveItem?.(signalId);
      console.log("[UnifiedStageButton] onArchiveItem callback completed");

      // Execute unified handler
      console.log("[UnifiedStageButton] Executing handleStageSuccess callback...");
      await handleStageSuccess({
        payload: {
          signalType,
          signalId,
          source,
          metadata: stagingMetadata,
          language,
        },
        reason: "staged",
        timestamp: new Date(),
      });
      console.log("[UnifiedStageButton] handleStageSuccess callback completed");

      // Success notification
      const successMessage = getLocaleMessage(language, "moved_to_archive");
      console.log("[UnifiedStageButton] Showing success toast:", successMessage);

      showToast({
        type: "success",
        title: successMessage,
        message: content,
        duration: 2000,
      });

      console.log("✅ [UnifiedStageButton] Staging completed successfully!");
      alert("🎉 Staging completed successfully! Item moved to archive.");
    } catch (error) {
      console.error("[UnifiedStageButton] Error during staging:", error);
      console.error("[UnifiedStageButton] Error stack:", (error as Error)?.stack);

      alert(
        `❌ Error during staging: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      const err = error instanceof Error ? error : new Error(String(error));
      if (onStageError) {
        console.log("[UnifiedStageButton] Executing onStageError callback...");
        await onStageError(err);
      }

      const errorMessage = getLocaleMessage(language, "stage_error");
      console.log("[UnifiedStageButton] Showing error toast:", {
        title: errorMessage,
        message: err.message,
      });

      showToast({
        type: "error",
        title: errorMessage,
        message: err instanceof Error ? err.message : "An error occurred. Try again.",
        duration: 3000,
      });

      console.error("❌ [UnifiedStageButton] Staging failed!");
    } finally {
      console.log("[UnifiedStageButton] Cleanup: setting loading to false");
      setLoading(false);
    }
  };

  // Styling variants
  const variantStyles: Record<string, string> = {
    primary: staged
      ? "bg-emerald-500/20 hover:bg-emerald-500/20 text-emerald-300"
      : "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300",
    secondary: "bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-100",
    ghost: "bg-transparent hover:bg-white/5 text-zinc-300",
  };

  const sizeStyles: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3 py-2 text-sm",
    lg: "px-4 py-2.5 text-base",
  };

  const buttonContent = staged ? (
    <>
      <Check className="size-4 shrink-0" />
      <span>{label || getLocaleMessage(language, "moved_to_archive")}</span>
    </>
  ) : loading ? (
    <>
      <Loader2 className="size-4 animate-spin shrink-0" />
      <span>{getLocaleMessage(language, "moving_to_archive")}</span>
    </>
  ) : (
    <span>{label || getLocaleMessage(language, "stage_success")}</span>
  );

  return (
    <button
      onClick={handleStage}
      disabled={loading || staged || disabled}
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "rounded-lg font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      title={label || content}
      aria-label={label || content}
    >
      {buttonContent}
    </button>
  );
}
