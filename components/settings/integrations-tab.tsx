"use client";

import { useTranslations } from "next-intl";
import { SignOutButton } from "@/components/app/SignOutButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function IntegrationsTab({
  prefs,
  onPrefsChange,
  displayName,
  onDisplayNameChange,
  busy,
  onSaveNotifications,
  onSaveProfile,
}: {
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
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  busy: boolean;
  onSaveNotifications: () => void;
  onSaveProfile: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <div className="space-y-10">
      <section>
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
