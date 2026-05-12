import { createClient } from "@/lib/supabase/server";
import { loadWorkspaceKeywords } from "@/lib/keywords/load-workspace-keywords";
import { KeywordsPanel } from "@/components/keywords/KeywordsPanel";

export default async function KeywordsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const loaded = await loadWorkspaceKeywords(supabase, workspaceId);
  const keywords = loaded.ok ? loaded.keywords : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-neutral-900">Keywords</h1>
        <p className="text-sm text-neutral-600">
          Track terms for Google Play. Record rank snapshots to build history and
          light alerts when movement matters.
        </p>
      </header>
      <KeywordsPanel workspaceId={workspaceId} initialKeywords={keywords} />
    </div>
  );
}
