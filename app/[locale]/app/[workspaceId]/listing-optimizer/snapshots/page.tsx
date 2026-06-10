/**
 * Experiment Snapshots Page
 *
 * Standalone page for A/B Experiment Snapshots feature.
 * Located under: AppMenu > AI Listing Optimizer > Snapshots
 *
 * Features:
 * - Create baseline snapshot of current listing
 * - Create variants for A/B testing
 * - Record weekly metrics
 * - Compare baseline vs variant performance
 * - Publish winning variant
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { ExperimentSnapshotsPage } from "@/components/experiments/experiment-snapshots-page";

interface SnapshotsPageProps {
  params: Promise<{ locale: string; workspaceId: string }>;
}

export default async function Page({ params }: SnapshotsPageProps) {
  const { workspaceId, locale } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // Permission check
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    notFound();
  }

  // Get workspace info
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .single();

  if (!workspace) {
    notFound();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Experiment Snapshots
        </h1>
        <p className="text-sm text-zinc-400">
          Create and manage A/B test variants for listing optimization
        </p>
      </div>

      {/* Main Content */}
      <ExperimentSnapshotsPage
        workspaceId={workspaceId}
        locale={locale}
      />
    </div>
  );
}

export async function generateMetadata({
  params,
}: SnapshotsPageProps) {
  return {
    title: "Experiment Snapshots",
    description: "Create and manage A/B test variants for listing optimization",
  };
}
