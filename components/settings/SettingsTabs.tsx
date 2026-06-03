"use client";

import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AddAppModal } from "@/components/app/add-app-modal";
import { BillingTab } from "@/components/settings/billing-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import type {
  CreditsLedgerEntry,
  SettingsApp,
  SettingsInvitation,
  SettingsMember,
  SettingsTabId,
} from "@/components/settings/settings-types";
import { WorkspaceTab } from "@/components/settings/workspace-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { useAppLimits } from "@/hooks/use-app-limits";
import { precheckAddApp } from "@/lib/client/precheck-add-app";
import { maxAppSlotsForPlan, normalizePlan, PLAN_META, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";

export function SettingsTabs(props: {
  workspaceId: string;
  myRole: string;
  workspace: { id: string; name: string; plan: string };
  apps: SettingsApp[];
  members: SettingsMember[];
  invitations: SettingsInvitation[];
  profile: {
    display_name: string | null;
    notification_preferences?: Record<string, unknown>;
  };
  keywordCount: number;
  creditsRemaining: number;
  creditsAllocation: number;
  ledgerEntries: CreditsLedgerEntry[];
}) {
  const router = useRouter();
  const t = useTranslations("settings");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const appLimits = useAppLimits(props.workspaceId);
  const [tab, setTab] = useState<SettingsTabId>("workspace");
  const [wsName, setWsName] = useState(props.workspace.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [displayName, setDisplayName] = useState(props.profile.display_name ?? "");
  const [prefs, setPrefs] = useState({
    emailAlerts: Boolean(props.profile.notification_preferences?.emailAlerts ?? true),
    weeklySummary: Boolean(props.profile.notification_preferences?.weeklySummary ?? false),
    alertThreshold: Number(props.profile.notification_preferences?.alertThreshold ?? 3),
  });

  const plan = useMemo(() => normalizePlan(props.workspace.plan), [props.workspace.plan]);
  const planMeta = PLAN_META[plan];

  const canAdmin = props.myRole === "owner" || props.myRole === "admin";
  const isOwner = props.myRole === "owner";

  function tryOpenAddAppModal() {
    setError(null);
    const pre = precheckAddApp(appLimits);
    if (pre.outcome === "deny_wait") return;
    if (pre.outcome === "deny_limits_failed") {
      setError(t("errors.limitsCheck"));
      return;
    }
    if (pre.outcome === "deny_upgrade") {
      setUpgradeOpen(true);
      return;
    }
    setAddAppOpen(true);
  }

  async function saveWorkspaceName() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${props.workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wsName.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? t("errors.generic"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkspace() {
    if (!window.confirm(t("workspace.deleteConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${props.workspaceId}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? t("errors.generic"));
      router.replace("/onboarding");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${props.workspaceId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? t("errors.generic"));
      setInviteEmail("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? t("errors.generic"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function saveNotifications() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_preferences: {
            emailAlerts: prefs.emailAlerts,
            weeklySummary: prefs.weeklySummary,
            alertThreshold: prefs.alertThreshold,
          },
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? t("errors.generic"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function changePlan(next: "free" | "pro" | "growth") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${props.workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? t("errors.generic"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const creditsAllocation =
    props.creditsAllocation > 0 ? props.creditsAllocation : planMeta.aiCreditsMonthly;
  const keywordLimit = planMeta.keywordLimit;

  return (
    <div
      className={cn("mx-auto max-w-4xl space-y-6", isRtl && "font-arabic")}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        plan={appLimits.data?.plan ?? plan}
        currentCount={appLimits.data?.currentCount ?? props.apps.length}
        appLimit={appLimits.data?.limit ?? maxAppSlotsForPlan(plan)}
        workspaceId={props.workspaceId}
        onSubscriptionSuccess={() => router.refresh()}
      />
      <AddAppModal
        open={addAppOpen}
        onOpenChange={setAddAppOpen}
        workspaceId={props.workspaceId}
        limits={appLimits}
        onRequestUpgrade={() => setUpgradeOpen(true)}
        onSuccess={() => router.refresh()}
      />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{t("title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </header>

      {error ? (
        <div
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as SettingsTabId)}
        className="w-full"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <TabsList className="flex h-auto w-full flex-wrap gap-1 border-white/[0.08] bg-zinc-950/80 p-1">
          <TabsTrigger value="workspace" className="flex-1 min-w-[8rem] text-xs sm:text-sm">
            {t("tabs.workspace")}
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex-1 min-w-[8rem] text-xs sm:text-sm">
            {t("tabs.billing")}
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex-1 min-w-[8rem] text-xs sm:text-sm">
            {t("tabs.integrations")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspace">
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/40 p-5 shadow-sm sm:p-6">
            <WorkspaceTab
              workspaceId={props.workspaceId}
              wsName={wsName}
              onWsNameChange={setWsName}
              canAdmin={canAdmin}
              isOwner={isOwner}
              busy={busy}
              apps={props.apps}
              members={props.members}
              invitations={props.invitations}
              inviteEmail={inviteEmail}
              inviteRole={inviteRole}
              onInviteEmailChange={setInviteEmail}
              onInviteRoleChange={setInviteRole}
              onSaveWorkspaceName={saveWorkspaceName}
              onSendInvite={sendInvite}
              onDeleteWorkspace={deleteWorkspace}
              onAddApp={tryOpenAddAppModal}
              addAppDisabled={appLimits.isLoading || appLimits.isError}
            />
            {appLimits.data && !appLimits.data.allowed ? (
              <p className="mt-4 text-xs text-amber-400/90">
                {appLimits.data.message ?? t("workspace.upgradeApps")}
              </p>
            ) : null}
            {appLimits.data ? (
              <p className="mt-2 text-xs text-zinc-600">
                {t("workspace.appSlots", {
                  count: appLimits.data.currentCount,
                  limit:
                    appLimits.data.limit === UNLIMITED_APP_SLOTS
                      ? t("workspace.unlimited")
                      : String(appLimits.data.limit),
                })}
              </p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/40 p-5 shadow-sm sm:p-6">
            <BillingTab
              workspaceId={props.workspaceId}
              plan={props.workspace.plan}
              creditsRemaining={props.creditsRemaining}
              creditsAllocation={creditsAllocation}
              keywordCount={props.keywordCount}
              keywordLimit={keywordLimit}
              ledgerEntries={props.ledgerEntries}
              isOwner={isOwner}
              busy={busy}
              onChangePlan={changePlan}
            />
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/40 p-5 shadow-sm sm:p-6">
            <IntegrationsTab
              workspaceId={props.workspaceId}
              canAdmin={canAdmin}
              prefs={prefs}
              onPrefsChange={setPrefs}
              displayName={displayName}
              onDisplayNameChange={setDisplayName}
              busy={busy}
              onSaveNotifications={saveNotifications}
              onSaveProfile={saveProfile}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
