"use client";

import { KeywordCurationModeProvider } from "@/contexts/KeywordCurationModeContext";
import { KeywordSelectionProvider } from "@/contexts/KeywordSelectionContext";

/**
 * Workspace-scoped providers that must survive route changes within the dashboard
 * (e.g. Competitor Spy → Listing Optimizer) without unmounting selection state.
 */
export function WorkspaceAppProviders({ children }: { children: React.ReactNode }) {
  return (
    <KeywordSelectionProvider>
      <KeywordCurationModeProvider>{children}</KeywordCurationModeProvider>
    </KeywordSelectionProvider>
  );
}
