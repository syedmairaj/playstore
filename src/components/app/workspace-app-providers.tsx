"use client";

import { useLocale } from "next-intl";
import { KeywordCurationModeProvider } from "@/contexts/KeywordCurationModeContext";
import { KeywordSelectionProvider } from "@/contexts/KeywordSelectionContext";
import { WorkspaceCreditsProvider } from "@/contexts/WorkspaceCreditsContext";
import {
  WorkspaceAppContextProvider,
  useWorkspaceApp,
} from "@/contexts/WorkspaceAppContext";
import { useAppSync } from "@/hooks/useAppSync";
import type { VaultLocale } from "@/hooks/useOptimizerSync";

function WorkspaceAppSyncRunner() {
  const { workspaceId, workspaceAppId } = useWorkspaceApp();
  const locale = useLocale() as VaultLocale;
  useAppSync(workspaceId, workspaceAppId, locale);
  return null;
}

/**
 * Workspace-scoped providers that must survive route changes within the dashboard
 * (e.g. Competitor Spy → Listing Optimizer) without unmounting selection state.
 */
export function WorkspaceAppProviders({
  children,
  workspaceId,
  initialCreditsBalance,
}: {
  children: React.ReactNode;
  workspaceId: string;
  initialCreditsBalance: number;
}) {
  return (
    <WorkspaceCreditsProvider initialBalance={initialCreditsBalance}>
      <WorkspaceAppContextProvider workspaceId={workspaceId}>
        <KeywordSelectionProvider>
          <KeywordCurationModeProvider>
            <WorkspaceAppSyncRunner />
            {children}
          </KeywordCurationModeProvider>
        </KeywordSelectionProvider>
      </WorkspaceAppContextProvider>
    </WorkspaceCreditsProvider>
  );
}
