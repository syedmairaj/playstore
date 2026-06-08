import type { SerperPreviewCountry } from "@/lib/keywords/serper-preview-types";
import { serperPreviewRowMatchesWorkspacePackage } from "@/lib/keywords/serper-snapshot-rank-resolve";

/**
 * Heuristic: is the workspace app a live, indexable Play Store listing?
 *
 * - Missing `package_name` → not live (no Play profile to rank).
 * - Explicit `metadata.play_store_published` / `published` / `not_published` flags win.
 * - When Serper preview exists with organic rows but the workspace package never
 *   appears, treat as not published / not indexed (show N/A, not "20+").
 * - Otherwise, a non-empty package id is treated as live (optimistic default).
 */
export function inferWorkspaceAppPlayLive(
  packageName: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  preview: SerperPreviewCountry[] | null | undefined,
): boolean {
  const pkg = packageName?.trim();
  if (!pkg) return false;

  const meta = metadata ?? {};
  if (meta.play_store_published === false || meta.published === false) return false;
  if (meta.not_published === true || meta.unpublished === true) return false;
  if (meta.play_store_published === true || meta.published === true) return true;

  if (preview?.length) {
    let hasOrganic = false;
    let foundWorkspace = false;
    for (const block of preview) {
      if (block.error) continue;
      if (block.items.length > 0) hasOrganic = true;
      for (const it of block.items) {
        if (serperPreviewRowMatchesWorkspacePackage(pkg, it)) {
          foundWorkspace = true;
          break;
        }
      }
      if (foundWorkspace) break;
    }
    if (hasOrganic && !foundWorkspace) return false;
  }

  return true;
}
