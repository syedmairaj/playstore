"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SupportedCountryCode } from "@/lib/countries";
import { cn } from "@/lib/utils";

export type CompetitorSpyCountryTabsProps = {
  countries: SupportedCountryCode[];
  activeCountry: SupportedCountryCode;
  onActiveCountryChange: (code: SupportedCountryCode) => void;
  isRtl?: boolean;
  className?: string;
};

export function CompetitorSpyCountryTabs({
  countries,
  activeCountry,
  onActiveCountryChange,
  isRtl,
  className,
}: CompetitorSpyCountryTabsProps) {
  const tCountries = useTranslations("countrySelector");
  const tTabs = useTranslations("competitorSpy.countryTabs");

  if (countries.length <= 1) return null;

  return (
    <Tabs
      value={activeCountry}
      onValueChange={(v) => onActiveCountryChange(v as SupportedCountryCode)}
      className={cn("w-full", className)}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <TabsList
        className={cn(
          "flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-white/[0.08] bg-[#070a0f] p-1",
          isRtl && "font-arabic",
        )}
        aria-label={tTabs("ariaLabel")}
      >
        {countries.map((code) => {
          const label = tCountries(`countries.${code}.label` as `countries.${SupportedCountryCode}.label`);
          const flag = tCountries(`countries.${code}.flag` as `countries.${SupportedCountryCode}.flag`);
          return (
            <TabsTrigger
              key={code}
              value={code}
              className={cn(
                "min-h-9 shrink-0 gap-2 rounded-lg border border-transparent px-3 py-2 text-xs font-medium text-zinc-400 sm:text-sm",
                "data-[state=active]:border-emerald-500/30 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-100",
              )}
            >
              <span className="text-base leading-none" aria-hidden>
                {flag}
              </span>
              <span className="truncate">{label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
