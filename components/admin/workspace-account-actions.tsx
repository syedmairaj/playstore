"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AccountStatus = "active" | "flagged" | "suspended";

type WorkspaceAccountActionsProps = {
  ownerId: string;
  initialStatus?: AccountStatus;
};

export function WorkspaceAccountActions({
  ownerId,
  initialStatus = "active",
}: WorkspaceAccountActionsProps) {
  const t = useTranslations("admin.accounts");
  const [status, setStatus] = useState<AccountStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(next: AccountStatus) {
    if (busy || next === status) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${ownerId}/account-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as
        | { ok: true; accountStatus: AccountStatus }
        | { ok: false; error?: { message?: string } };
      if (!data.ok) {
        setError(data.error?.message ?? t("accountActionError"));
        return;
      }
      setStatus(data.accountStatus);
    } catch {
      setError(t("accountActionError"));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    status === "suspended"
      ? t("statusSuspended")
      : status === "flagged"
        ? t("statusFlagged")
        : t("statusActive");

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            className={cn(
              "inline-flex items-center rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50",
            )}
          >
            {t("accountActionsLabel")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => void updateStatus("flagged")}
          >
            {t("actionFlagForReview")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => void updateStatus("suspended")}
            className="text-rose-300 focus:text-rose-200"
          >
            {t("actionSuspendAccess")}
          </DropdownMenuItem>
          {status !== "active" ? (
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => void updateStatus("active")}
            >
              {t("actionRestoreAccess")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-[10px] text-slate-500">{statusLabel}</span>
      {error ? <span className="text-[10px] text-rose-400">{error}</span> : null}
    </div>
  );
}
