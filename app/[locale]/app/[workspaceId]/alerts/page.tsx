import { createClient } from "@/lib/supabase/server";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const { data: alerts } = await supabase
    .from("workspace_alerts")
    .select("id,type,title,body,severity,read_at,created_at,keyword_id,meta")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-neutral-900">Alerts</h1>
        <p className="text-sm text-neutral-600">
          Basic keyword alerts when ranks slip or fall out of the top ten.
        </p>
      </header>
      <AlertsPanel workspaceId={workspaceId} initialAlerts={alerts ?? []} />
    </div>
  );
}
