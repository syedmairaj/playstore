/** Cross-page Keyword Tracker ↔ Competitor Spy tracked-state sync. */
export const WORKSPACE_KEYWORDS_CHANGED_EVENT = "playstore:workspace-keywords-changed" as const;

export type WorkspaceKeywordsChangedDetail = {
  workspaceId: string;
  /** Lowercased terms removed from the watchlist (if known). */
  removedTerms?: string[];
  /** Terms newly added to the watchlist (original casing). */
  addedTerms?: string[];
};

export function dispatchWorkspaceKeywordsChanged(
  detail: WorkspaceKeywordsChangedDetail,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WORKSPACE_KEYWORDS_CHANGED_EVENT, { detail }),
  );
}
