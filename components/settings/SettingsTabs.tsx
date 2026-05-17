"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { AddAppModal } from "@/components/app/add-app-modal";
import { SignOutButton } from "@/components/app/SignOutButton";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { useAppLimits } from "@/hooks/use-app-limits";
import { precheckAddApp } from "@/lib/client/precheck-add-app";
import { maxAppSlotsForPlan, normalizePlan, PLAN_META, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";

const TABS = [
  "Workspace",
  "Team",
  "Billing",
  "Integrations",
  "Notifications",
  "Account",
] as const;

type TabId = (typeof TABS)[number];

export function SettingsTabs(props: {
  workspaceId: string;
  myRole: string;
  workspace: { id: string; name: string; plan: string };
  apps: { id: string; name: string; package_name: string | null }[];
  members: { user_id: string; role: string; display_name: string }[];
  invitations: { id: string; email: string; role: string; created_at: string }[];
  profile: {
    display_name: string | null;
    notification_preferences?: Record<string, unknown>;
  };
  keywordCount: number;
}) {
  const router = useRouter();
  const appLimits = useAppLimits(props.workspaceId);
  const [tab, setTab] = useState<TabId>("Workspace");
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
    weeklySummary: Boolean(
      props.profile.notification_preferences?.weeklySummary ?? false,
    ),
    alertThreshold: Number(props.profile.notification_preferences?.alertThreshold ?? 3),
  });

  const plan = useMemo(
    () => normalizePlan(props.workspace.plan),
    [props.workspace.plan],
  );
  const meta = PLAN_META[plan];

  function tryOpenAddAppModal() {
    setError(null);
    const pre = precheckAddApp(appLimits);
    if (pre.outcome === "deny_wait") return;
    if (pre.outcome === "deny_limits_failed") {
      setError("Could not verify app limits. Check your connection or refresh the page.");
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
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkspace() {
    if (
      !window.confirm(
        "Delete this workspace and all data? This cannot be undone. Owner only.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${props.workspaceId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      router.replace("/onboarding");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      setInviteEmail("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const canAdmin = props.myRole === "owner" || props.myRole === "admin";
  const isOwner = props.myRole === "owner";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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
        <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Workspace preferences, team, billing, and your account.
        </p>
      </header>

      {error ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 pb-px sm:gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium transition sm:px-4 ${
              tab === t
                ? "border border-b-0 border-neutral-200 bg-white text-indigo-700"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        {tab === "Workspace" ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Workspace name</h2>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <input
                  className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  disabled={!canAdmin || busy}
                />
                <button
                  type="button"
                  disabled={!canAdmin || busy}
                  onClick={saveWorkspaceName}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-300"
                >
                  Save
                </button>
              </div>
            </div>
            <div id="workspace-apps">
              <h2 className="text-sm font-semibold text-neutral-900">Apps</h2>
              <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                {props.apps.length === 0 ? (
                  <li className="px-4 py-6 text-sm text-neutral-500">No apps yet.</li>
                ) : (
                  props.apps.map((a) => (
                    <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                      <span className="font-medium text-neutral-900">{a.name}</span>
                      <span className="font-mono text-xs text-neutral-500">
                        {a.package_name ?? "—"}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50/80 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Add new app
                </h3>
                {appLimits.isLoading ? (
                  <p className="mt-2 text-xs text-neutral-500">Checking plan limits…</p>
                ) : appLimits.isError ? (
                  <p className="mt-2 text-xs text-red-600">
                    Could not verify app limits. You can retry after refreshing the page.
                  </p>
                ) : appLimits.data ? (
                  <p className="mt-2 text-xs text-neutral-600">
                    Apps in this workspace:{" "}
                    <span className="font-semibold text-neutral-900">
                      {appLimits.data.currentCount}
                      {appLimits.data.limit === UNLIMITED_APP_SLOTS
                        ? " (unlimited)"
                        : ` / ${appLimits.data.limit}`}
                    </span>{" "}
                    on {PLAN_META[normalizePlan(appLimits.data.plan)].label}.
                  </p>
                ) : null}
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={appLimits.isLoading || appLimits.isError}
                    onClick={tryOpenAddAppModal}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-neutral-300"
                  >
                    Add app
                  </button>
                </div>
                {appLimits.data && !appLimits.data.allowed ? (
                  <p className="mt-2 text-xs text-amber-800">
                    {appLimits.data.message ?? "Upgrade your plan to add more apps."}
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Usage & limits</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Keywords tracked:{" "}
                <span className="font-semibold text-neutral-900">
                  {props.keywordCount}
                </span>{" "}
                / {meta.keywords} on {meta.label}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                App slots are enforced per workspace (Free: 1, Pro: 5, Growth: unlimited).
              </p>
            </div>
            {isOwner ? (
              <div className="border-t border-neutral-100 pt-6">
                <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Permanently delete this workspace and related data.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={deleteWorkspace}
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                >
                  Delete workspace
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "Team" ? (
          <div className="space-y-8">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Members</h2>
              <ul className="mt-3 divide-y divide-neutral-100">
                {props.members.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <span className="font-medium text-neutral-900">{m.display_name}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize">
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {canAdmin ? (
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Invite teammate</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  We store a pending invite. They join once they sign up with the same email.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <select
                    className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy || !inviteEmail.includes("@")}
                    onClick={sendInvite}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-neutral-300"
                  >
                    Send invite
                  </button>
                </div>
              </div>
            ) : null}
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Pending invites</h2>
              {props.invitations.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">No pending invites.</p>
              ) : (
                <ul className="mt-3 divide-y divide-neutral-100">
                  {props.invitations.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2 py-2 text-sm">
                      <span>{i.email}</span>
                      <span className="text-xs capitalize text-neutral-500">{i.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === "Billing" ? (
          <div className="space-y-4 text-sm text-neutral-700">
            <p>
              Current plan:{" "}
              <span className="font-semibold text-neutral-900">{meta.label}</span> (
              ${meta.priceMonthly}/mo)
            </p>
            <p className="text-neutral-600">
              Payment method, invoices, and usage-based billing will connect to Stripe in a
              future release.
            </p>
            <Link
              href="/pricing"
              className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              View plans & upgrade
            </Link>
            {isOwner ? (
              <div className="pt-4">
                <label className="text-xs font-medium text-neutral-500">Change plan (owner)</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["free", "pro", "growth"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={busy || plan === p}
                      onClick={async () => {
                        setBusy(true);
                        const res = await fetch(`/api/workspaces/${props.workspaceId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ plan: p }),
                        });
                        const json = (await res.json()) as { ok: boolean };
                        setBusy(false);
                        if (json.ok) router.refresh();
                      }}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium capitalize hover:bg-neutral-50 disabled:border-indigo-300 disabled:bg-indigo-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "Integrations" ? (
          <ul className="space-y-4">
            {[
              ["Google Play Connect", "OAuth & listing sync", "Soon"],
              ["Slack alerts", "Post ranking changes to a channel", "Soon"],
              ["Zapier", "Automate exports and alerts", "Soon"],
            ].map(([title, body, badge]) => (
              <li
                key={title as string}
                className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50/80 px-4 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{title}</p>
                  <p className="text-xs text-neutral-600">{body}</p>
                </div>
                <span className="text-xs font-medium text-neutral-400">{badge}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "Notifications" ? (
          <div className="max-w-md space-y-5">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Email alerts</span>
              <input
                type="checkbox"
                checked={prefs.emailAlerts}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, emailAlerts: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Weekly summary</span>
              <input
                type="checkbox"
                checked={prefs.weeklySummary}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, weeklySummary: e.target.checked }))
                }
              />
            </label>
            <div>
              <label className="text-sm">Rank drop alert threshold (positions)</label>
              <input
                type="number"
                min={1}
                max={20}
                className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                value={prefs.alertThreshold}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    alertThreshold: Number.parseInt(e.target.value, 10) || 3,
                  }))
                }
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={saveNotifications}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save preferences
            </button>
          </div>
        ) : null}

        {tab === "Account" ? (
          <div className="max-w-md space-y-6">
            <div>
              <label className="text-sm font-medium text-neutral-800">Display name</label>
              <input
                className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={saveProfile}
                className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Save profile
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Password changes use Supabase Auth — sign out and use “Forgot password” on the
              login screen, or manage from your email provider link.
            </p>
            <div className="border-t border-neutral-100 pt-4">
              <p className="text-sm font-semibold text-red-800">Delete account</p>
              <p className="mt-1 text-xs text-neutral-600">
                Contact support to remove your account during beta.
              </p>
            </div>
            <div className="border-t border-neutral-100 pt-4">
              <p className="text-sm font-medium text-neutral-800">Session</p>
              <div className="mt-3">
                <SignOutButton />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
