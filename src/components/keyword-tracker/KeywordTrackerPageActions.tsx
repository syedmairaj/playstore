"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { KeywordValidatorCard } from "@/components/keyword-tracker/KeywordValidatorCard";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import type { SupportedCountryCode } from "@/lib/countries";
import { useKeywordTrackerValidatorBridge } from "@/lib/client/keyword-tracker-validator-bridge";
import { cn } from "@/lib/utils";

type Props = {
  workspaceId: string;
  apps: WorkspaceAppListRow[];
};

/** Top-right page actions — Validate Keyword opens the validator slide-over. */
export function KeywordTrackerPageActions({ workspaceId, apps }: Props) {
  const t = useTranslations("keywordTracker");
  const locale = useLocale();
  const router = useRouter();
  const isRtl = locale === "ar";
  const [validatorOpen, setValidatorOpen] = useState(false);

  const defaultCountry: SupportedCountryCode = locale === "ar" ? "sa" : "us";
  const bridge = useKeywordTrackerValidatorBridge([defaultCountry]);

  const appId = bridge.scopeAppId ?? apps[0]?.id;
  const selectedCountries = bridge.selectedCountries.length
    ? bridge.selectedCountries
    : [defaultCountry];

  return (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center gap-2",
          isRtl && "flex-row-reverse",
        )}
        dir={isRtl ? "rtl" : "ltr"}
        role="group"
        aria-label={t("actions.groupLabel")}
      >
        <Button
          type="button"
          size="sm"
          onClick={() => setValidatorOpen(true)}
          className={cn(
            "flex h-9 items-center gap-2 px-4",
            "border border-zinc-700 bg-[#0c1018] text-zinc-200",
            "hover:border-emerald-500/40 hover:bg-emerald-500/[0.07] hover:text-emerald-200",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
            "transition-all duration-150",
          )}
        >
          <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          {t("actions.validateKeyword")}
        </Button>
      </div>

      <KeywordValidatorCard
        workspaceId={workspaceId}
        appId={appId}
        vaultLocale={locale === "ar" ? "ar" : "en"}
        selectedCountries={selectedCountries}
        isOpen={validatorOpen}
        onClose={() => setValidatorOpen(false)}
        onKeywordStaged={() => router.refresh()}
      />
    </>
  );
}
