"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle, Loader2, Store } from "lucide-react";
import { SignOutButton } from "@/components/app/SignOutButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateBudgetCap } from "@/lib/client/update-budget-cap";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnectionStatus = "idle" | "checking" | "connected" | "disconnected" | "error";

// ── ConnectedStoresSection ─────────────────────────────────────────────────

function ConnectedStoresSection({ workspaceId, canAdmin }: { workspaceId: string; canAdmin?: boolean }) {
  const t = useTranslations("settings.integrations");
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [authorizedEmail, setAuthorizedEmail] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashType, setFlashType] = useState<"success" | "error">("success");
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Flash from OAuth redirect ──────────────────────────────────────────────
  useEffect(() => {
    const success = searchParams.get("integration_success");
    const error = searchParams.get("integration_error");

    if (success === "google_play") {
      setFlash(t("flashConnected"));
      setFlashType("success");
    } else if (error === "access_denied") {
      setFlash(t("flashCancelled"));
      setFlashType("error");
    } else if (error) {
      setFlash(t("flashFailed"));
      setFlashType("error");
    }
  }, [searchParams, t]);

  // ── Load connection status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;
    setStatus("checking");

    fetch(`/api/integrations/google-play/status?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) => r.json())
      .then((json: { ok: boolean; connected?: boolean; authorizedEmail?: string | null; connectedAt?: string | null }) => {
        if (cancelled) return;
        if (json.ok) {
          setStatus(json.connected ? "connected" : "disconnected");
          setAuthorizedEmail(json.authorizedEmail ?? null);
          setConnectedAt(json.connectedAt ?? null);
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => { cancelled = true; };
  }, [workspaceId]);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  async function handleDisconnect() {
    if (!window.confirm(t("disconnectConfirm"))) return;
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/integrations/google-play/connect?workspaceId=${encodeURIComponent(workspaceId)}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setStatus("disconnected");
        setAuthorizedEmail(null);
        setConnectedAt(null);
        setFlash(t("flashDisconnected"));
        setFlashType("success");
      } else {
        setFlash(json.error ?? t("errorLoadStatus"));
        setFlashType("error");
      }
    } catch {
      setFlash(t("errorLoadStatus"));
      setFlashType("error");
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const connectedDate = connectedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(connectedAt))
    : null;

  return (
    <section className="border-t border-white/[0.06] pt-8">
      <div className="flex items-center gap-2">
        <Store className="size-4 text-zinc-400" aria-hidden />
        <h2 className="text-sm font-semibold text-zinc-100">{t("connectedStoresTitle")}</h2>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{t("connectedStoresHint")}</p>

      {/* Flash banner */}
      {flash && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            flashType === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
          role="status"
        >
          {flashType === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          ) : (
            <XCircle className="size-4 shrink-0" aria-hidden />
          )}
          {flash}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-950/40 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: icon + label */}
          <div className="flex items-center gap-3">
            {/* Google Play icon */}
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none">
                <path d="M3.18 23.76a2 2 0 0 0 2.19-.22l12.67-7.32-2.83-2.83L3.18 23.76z" fill="#EA4335"/>
                <path d="M20.82 10.03 17.04 7.8 13.96 10.88l3.08 3.08 3.78-2.23a1.99 1.99 0 0 0 0-3.7z" fill="#FBBC05"/>
                <path d="M3.18.24a2 2 0 0 0-.18.87v21.78c0 .31.06.6.18.87l.1.09 12.2-12.2v-.29L3.28.15l-.1.09z" fill="#4285F4"/>
                <path d="M15.04 8.03 3.18.24l-.1.09 12.2 12.2.09-.09L17.04 9.8l-2-1.77z" fill="#34A853"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">{t("googlePlay")}</p>
              {status === "checking" && (
                <p className="flex items-center gap-1 text-xs text-zinc-500">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  {t("checkingConnection")}
                </p>
              )}
              {status === "connected" && (
                <p className="text-xs text-emerald-400">
                  {authorizedEmail ? `${authorizedEmail} · ` : ""}
                  {connectedDate ? t("connectedSince", { date: connectedDate }) : t("connected")}
                </p>
              )}
              {status === "disconnected" && (
                <p className="text-xs text-zinc-500">{t("notConnected")}</p>
              )}
              {status === "error" && (
                <p className="text-xs text-red-400">{t("errorLoadStatus")}</p>
              )}
            </div>
          </div>

          {/* Right: action button */}
          {canAdmin && (
            <div>
              {status === "connected" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disconnecting}
                  onClick={handleDisconnect}
                  className="border-white/[0.12] text-zinc-300 hover:border-red-500/40 hover:text-red-400"
                >
                  {disconnecting ? (
                    <>
                      <Loader2 className="me-1.5 size-3.5 animate-spin" aria-hidden />
                      {t("disconnecting")}
                    </>
                  ) : (
                    t("disconnect")
                  )}
                </Button>
              ) : status === "disconnected" ? (
                <Button
                  type="button"
                  size="sm"
                  asChild
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  <a href={`/api/integrations/google-play/connect?workspaceId=${encodeURIComponent(workspaceId)}`}>
                    {t("connect")}
                  </a>
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {!canAdmin && (
          <p className="mt-3 text-xs text-zinc-600">{t("connectNote")}</p>
        )}
      </div>
    </section>
  );
}

// ── IntegrationsTab ───────────────────────────────────────────────────────────

export function IntegrationsTab({
  workspaceId,
  canAdmin,
  prefs,
  onPrefsChange,
  monthlyCreditCap,
  onMonthlyCreditCapChange,
  displayName,
  onDisplayNameChange,
  busy,
  onSaveNotifications,
  onSaveProfile,
}: {
  workspaceId: string;
  canAdmin?: boolean;
  prefs: {
    emailAlerts: boolean;
    weeklySummary: boolean;
    alertThreshold: number;
  };
  onPrefsChange: (prefs: {
    emailAlerts: boolean;
    weeklySummary: boolean;
    alertThreshold: number;
  }) => void;
  monthlyCreditCap: number | null;
  onMonthlyCreditCapChange: (cap: number | null) => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  busy: boolean;
  onSaveNotifications: () => void;
  onSaveProfile: () => void;
}) {
  const t = useTranslations("settings");
  const [capSaving, setCapSaving] = useState(false);
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [capError, setCapError] = useState(false);

  async function handleSaveCreditCap() {
    if (!canAdmin) return;
    setCapSaving(true);
    setCapMessage(null);
    setCapError(false);
    const result = await updateBudgetCap(workspaceId, monthlyCreditCap);
    setCapSaving(false);
    if (result.ok) {
      setCapMessage(t("integrations.monthlyCreditCapSaved"));
    } else {
      setCapError(true);
      setCapMessage(result.message);
    }
  }

  return (
    <div className="space-y-10">
      {/* Connected Stores */}
      <ConnectedStoresSection workspaceId={workspaceId} canAdmin={canAdmin} />

      {/* Notifications */}
      <section className="border-t border-white/[0.06] pt-8">
        <h2 className="text-sm font-semibold text-zinc-100">{t("integrations.alertsTitle")}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t("integrations.alertsHint")}</p>
        <div className="mt-5 space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-zinc-950/40 px-4 py-3">
            <label htmlFor="email-alerts" className="text-start text-sm text-zinc-200">
              {t("integrations.emailAlerts")}
            </label>
            <Switch
              id="email-alerts"
              checked={prefs.emailAlerts}
              onCheckedChange={(emailAlerts) => onPrefsChange({ ...prefs, emailAlerts })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-zinc-950/40 px-4 py-3">
            <label htmlFor="weekly-summary" className="text-start text-sm text-zinc-200">
              {t("integrations.weeklySummary")}
            </label>
            <Switch
              id="weekly-summary"
              checked={prefs.weeklySummary}
              onCheckedChange={(weeklySummary) => onPrefsChange({ ...prefs, weeklySummary })}
            />
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-zinc-950/40 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="alert-threshold" className="text-start text-sm text-zinc-200">
                {t("integrations.alertThreshold")}
              </label>
              <Input
                id="alert-threshold"
                type="number"
                min={1}
                max={20}
                className="w-20 border-white/[0.1] bg-zinc-950/80 text-zinc-100"
                value={prefs.alertThreshold}
                onChange={(e) =>
                  onPrefsChange({
                    ...prefs,
                    alertThreshold: Number.parseInt(e.target.value, 10) || 3,
                  })
                }
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{t("integrations.alertThresholdHint")}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-zinc-950/40 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="monthly-credit-cap" className="text-start text-sm text-zinc-200">
                {t("integrations.monthlyCreditCap")}
              </label>
              <Input
                id="monthly-credit-cap"
                type="number"
                min={1}
                max={1000000}
                placeholder="—"
                disabled={!canAdmin}
                className="w-28 border-white/[0.1] bg-zinc-950/80 text-zinc-100"
                value={monthlyCreditCap ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) {
                    onMonthlyCreditCapChange(null);
                    return;
                  }
                  const parsed = Number.parseInt(raw, 10);
                  onMonthlyCreditCapChange(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{t("integrations.monthlyCreditCapHint")}</p>
            {canAdmin ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={capSaving || busy}
                onClick={() => void handleSaveCreditCap()}
                className="mt-3 border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]"
              >
                {capSaving ? t("integrations.monthlyCreditCapSaving") : t("integrations.monthlyCreditCapSave")}
              </Button>
            ) : null}
            {capMessage ? (
              <p
                className={`mt-2 text-xs ${capError ? "text-red-400" : "text-emerald-400"}`}
                role="status"
              >
                {capMessage}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          disabled={busy}
          onClick={onSaveNotifications}
          className="mt-4 bg-emerald-600 hover:bg-emerald-500"
        >
          {t("integrations.saveAlerts")}
        </Button>
      </section>

      {/* Account */}
      <section className="border-t border-white/[0.06] pt-8">
        <h2 className="text-sm font-semibold text-zinc-100">{t("integrations.accountTitle")}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t("integrations.accountHint")}</p>
        <div className="mt-4 max-w-md space-y-3">
          <label className="text-xs font-medium text-zinc-500">{t("integrations.displayName")}</label>
          <Input
            className="border-white/[0.1] bg-zinc-950/80 text-zinc-100"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
          />
          <Button
            type="button"
            disabled={busy}
            onClick={onSaveProfile}
            variant="outline"
            className="border-white/[0.12] text-zinc-200"
          >
            {t("integrations.saveProfile")}
          </Button>
        </div>
        <p className="mt-4 text-xs text-zinc-500">{t("integrations.passwordHint")}</p>
        <div className="mt-6 border-t border-white/[0.06] pt-4">
          <SignOutButton className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm" />
        </div>
      </section>
    </div>
  );
}
