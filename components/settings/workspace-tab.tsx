"use client";

import { MoreHorizontal, Plus, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SettingsApp, SettingsInvitation, SettingsMember } from "@/components/settings/settings-types";
import { cn } from "@/lib/utils";

function appIsActive(app: SettingsApp): boolean {
  return Boolean(app.package_name?.trim() || app.play_store_url?.trim());
}

export function WorkspaceTab({
  workspaceId,
  wsName,
  onWsNameChange,
  canAdmin,
  isOwner,
  busy,
  apps,
  members,
  invitations,
  inviteEmail,
  inviteRole,
  onInviteEmailChange,
  onInviteRoleChange,
  onSaveWorkspaceName,
  onSendInvite,
  onDeleteWorkspace,
  onAddApp,
  addAppDisabled,
}: {
  workspaceId: string;
  wsName: string;
  onWsNameChange: (name: string) => void;
  canAdmin: boolean;
  isOwner: boolean;
  busy: boolean;
  apps: SettingsApp[];
  members: SettingsMember[];
  invitations: SettingsInvitation[];
  inviteEmail: string;
  inviteRole: "admin" | "member";
  onInviteEmailChange: (email: string) => void;
  onInviteRoleChange: (role: "admin" | "member") => void;
  onSaveWorkspaceName: () => void;
  onSendInvite: () => void;
  onDeleteWorkspace: () => void;
  onAddApp: () => void;
  addAppDisabled: boolean;
}) {
  const t = useTranslations("settings");

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-sm font-semibold text-zinc-100">{t("workspace.nameTitle")}</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            className="flex-1 border-white/[0.1] bg-zinc-950/80 text-zinc-100"
            value={wsName}
            onChange={(e) => onWsNameChange(e.target.value)}
            disabled={!canAdmin || busy}
          />
          <Button
            type="button"
            disabled={!canAdmin || busy}
            onClick={onSaveWorkspaceName}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            {t("workspace.save")}
          </Button>
        </div>
      </section>

      <section id="workspace-apps">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{t("workspace.appsTitle")}</h2>
            <p className="mt-1 text-xs text-zinc-500">{t("workspace.appsHint")}</p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={addAppDisabled}
            onClick={onAddApp}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            {t("workspace.addApp")}
          </Button>
        </div>

        <ul className="mt-4 space-y-2">
          {apps.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/[0.1] px-4 py-10 text-center text-sm text-zinc-500">
              {t("workspace.noApps")}
            </li>
          ) : (
            apps.map((app) => {
              const active = appIsActive(app);
              return (
                <li
                  key={app.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-zinc-950/50 px-4 py-3 sm:flex-nowrap"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {app.icon_url ? (
                      <Image
                        src={app.icon_url}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded-xl border border-white/[0.08] object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-zinc-500">
                        <Smartphone className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-100">{app.name}</p>
                      <p className="truncate font-mono text-xs text-zinc-500">
                        {app.package_name ?? t("workspace.noPackage")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 capitalize",
                      active
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-600/50 bg-zinc-800/50 text-zinc-400",
                    )}
                  >
                    {active ? t("workspace.statusActive") : t("workspace.statusInactive")}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-zinc-400 hover:text-zinc-100"
                        aria-label={t("workspace.appActions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="border-white/[0.1] bg-zinc-900">
                      <DropdownMenuItem asChild>
                        <Link href={`/app/${workspaceId}/listing-optimizer?appId=${app.id}`}>
                          {t("workspace.openOptimizer")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/app/${workspaceId}/keywords`}>
                          {t("workspace.openKeywords")}
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{t("workspace.teamTitle")}</h2>
            <p className="mt-1 text-xs text-zinc-500">{t("workspace.teamHint")}</p>
          </div>
          {canAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/[0.12] bg-transparent text-zinc-200 hover:bg-white/[0.04]"
              disabled={busy || !inviteEmail.includes("@")}
              onClick={onSendInvite}
            >
              {t("workspace.inviteMember")}
            </Button>
          ) : null}
        </div>

        <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="font-medium text-zinc-100">{m.display_name}</span>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs capitalize text-zinc-400">
                {m.role}
              </span>
            </li>
          ))}
        </ul>

        {canAdmin ? (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-950/40 p-4">
            <p className="text-xs text-zinc-500">{t("workspace.inviteHint")}</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input
                type="email"
                placeholder={t("workspace.invitePlaceholder")}
                className="flex-1 border-white/[0.1] bg-zinc-950/80 text-zinc-100"
                value={inviteEmail}
                onChange={(e) => onInviteEmailChange(e.target.value)}
              />
              <select
                className="rounded-md border border-white/[0.1] bg-zinc-950/80 px-3 py-2 text-sm text-zinc-200"
                value={inviteRole}
                onChange={(e) => onInviteRoleChange(e.target.value as "admin" | "member")}
              >
                <option value="member">{t("workspace.roleMember")}</option>
                <option value="admin">{t("workspace.roleAdmin")}</option>
              </select>
            </div>
          </div>
        ) : null}

        {invitations.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("workspace.pendingInvites")}
            </h3>
            <ul className="mt-2 space-y-1">
              {invitations.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-sm text-zinc-400"
                >
                  <span>{i.email}</span>
                  <span className="text-xs capitalize">{i.role}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {isOwner ? (
        <section className="border-t border-white/[0.06] pt-8">
          <h2 className="text-sm font-semibold text-red-400">{t("workspace.dangerTitle")}</h2>
          <p className="mt-2 text-sm text-zinc-500">{t("workspace.dangerHint")}</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onDeleteWorkspace}
            className="mt-3 border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          >
            {t("workspace.deleteWorkspace")}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
