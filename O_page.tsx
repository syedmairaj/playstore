import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; locale: string }>;
}) {
  const { workspaceId } = await params;
  const t = await getTranslations("workspaceAlerts");

  const supabase = await createClient();
  const { data: alerts } = await supabase
    .from("workspace_alerts")
    .select("id,type,title,body,severity,read_at,created_at,keyword_id,meta")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-0">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          ASO Intelligence
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {t("page.title")}
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
          {t("page.subtitle")}
        </p>
      </header>

      <AlertsPanel workspaceId={workspaceId} initialAlerts={alerts ?? []} />
    </div>
  );
}
