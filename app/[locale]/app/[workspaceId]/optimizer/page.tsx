import { ListingOptimizer } from "@/components/ListingOptimizer";

export default async function WorkspaceOptimizerPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <ListingOptimizer workspaceId={workspaceId} embedded />;
}
