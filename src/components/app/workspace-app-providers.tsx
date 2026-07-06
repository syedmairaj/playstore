"use client";

import { KeywordCurationModeProvider } from "@/contexts/KeywordCurationModeContext";
import { KeywordSelectionProvider } from "@/contexts/KeywordSelectionContext";
import { WorkspaceCreditsProvider } from "@/contexts/WorkspaceCreditsContext";

/**
 * Workspace-scoped providers that must survive route changes within the dashboard
 * (e.g. Competitor Spy → Listing Optimizer) without unmounting selection state.
 */
export function WorkspaceAppProviders({
  children,
  initialCreditsBalance,
}: {
  children: React.ReactNode;
  initialCreditsBalance: number;
}) {
  return (
    <WorkspaceCreditsProvider initialBalance={initialCreditsBalance}>
      <KeywordSelectionProvider>
        <KeywordCurationModeProvider>{children}</KeywordCurationModeProvider>
      </KeywordSelectionProvider>
    </WorkspaceCreditsProvider>
  );
}
