import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: workspace },
    { data: apps },
    { data: members },
    invRes,
    { count: keywordCount },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id,name,plan,onboarding_state")
      .eq("id", workspaceId)
      .single(),
    supabase
      .from("apps")
      .select("id,name,package_name,play_store_url,target_countries")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_members")
      .select("user_id,role,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase.from("workspace_invitations").select("id,email,role,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    supabase
      .from("keywords")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    user
      ? supabase
          .from("profiles")
          .select("display_name,notification_preferences")
          .eq("id", user.id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const invitations = invRes.error ? [] : (invRes.data ?? []);

  const memberIds = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } =
    memberIds.length > 0
      ? await supabase.from("profiles").select("id,display_name").in("id", memberIds)
      : { data: [] as { id: string; display_name: string | null }[] };

  const nameByUser = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.display_name as string) ?? ""]),
  );

  const membersWithNames = (members ?? []).map((m) => ({
    user_id: m.user_id as string,
    role: m.role as string,
    display_name: nameByUser.get(m.user_id as string) || "Teammate",
  }));

  const myRole =
    membersWithNames.find((m) => m.user_id === user?.id)?.role ?? "member";

  return (
    <SettingsTabs
      workspaceId={workspaceId}
      myRole={myRole}
      workspace={{
        id: workspace?.id as string,
        name: (workspace?.name as string) ?? "",
        plan: (workspace?.plan as string) ?? "free",
      }}
      apps={(apps ?? []) as { id: string; name: string; package_name: string | null }[]}
      members={membersWithNames}
      invitations={
        invitations as { id: string; email: string; role: string; created_at: string }[]
      }
      profile={
        (profile ?? {
          display_name: "",
          notification_preferences: {},
        }) as {
          display_name: string | null;
          notification_preferences?: Record<string, unknown>;
        }
      }
      keywordCount={keywordCount ?? 0}
    />
  );
}
