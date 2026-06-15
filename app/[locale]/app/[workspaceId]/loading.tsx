/**
 * Intra-workspace route transitions (e.g. Keywords → Listing Optimizer) keep the
 * dashboard shell mounted. Returning null avoids a full-page skeleton that hides
 * client-side React Query cache — cached optimizer data can render immediately.
 */
export default function WorkspaceLoading() {
  return null;
}
