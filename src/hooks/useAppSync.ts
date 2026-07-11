"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useGlobalKeywordSelection } from "@/contexts/KeywordSelectionContext";
import { useKeywordCurationMode } from "@/contexts/KeywordCurationModeContext";
import type { VaultLocale } from "@/hooks/useOptimizerSync";
import { syncAppContextOnSwitch } from "@/lib/client/workspace-app-sync";

/**
 * Detects workspaceAppId changes and invalidates app-scoped caches,
 * resets cross-route selection state, and logs verification output.
 */
export function useAppSync(
  workspaceId: string,
  workspaceAppId: string | null,
  locale: VaultLocale,
): void {
  const queryClient = useQueryClient();
  const { clearAll } = useGlobalKeywordSelection();
  const { setMode } = useKeywordCurationMode();
  const previousAppIdRef = useRef<string | null>(null);
  const previousWorkspaceRef = useRef(workspaceId);

  useEffect(() => {
    if (previousWorkspaceRef.current !== workspaceId) {
      previousWorkspaceRef.current = workspaceId;
      previousAppIdRef.current = workspaceAppId;
      return;
    }

    const previousAppId = previousAppIdRef.current;
    if (previousAppId === workspaceAppId) return;

    syncAppContextOnSwitch({
      queryClient,
      workspaceId,
      locale,
      previousAppId,
      nextAppId: workspaceAppId,
      onResetModuleState: () => {
        clearAll();
        setMode("copy");
      },
    });

    previousAppIdRef.current = workspaceAppId;
  }, [
    workspaceId,
    workspaceAppId,
    locale,
    queryClient,
    clearAll,
    setMode,
  ]);
}
