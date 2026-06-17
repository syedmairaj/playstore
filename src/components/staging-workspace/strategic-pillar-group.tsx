"use client";

import { cn } from "@/lib/utils";
import { ACTIVE_CONTEXT_SECTION_ZONE } from "@/components/staging-workspace/active-context-tokens";

export type StrategicPillarId =
  | "keyword_growth"
  | "conversion_uplift"
  | "competitive_defense";

type StrategicPillarGroupProps = {
  pillarId: StrategicPillarId;
  title: string;
  description?: string;
  isRtl?: boolean;
  showTopRule?: boolean;
  children: React.ReactNode;
};

/**
 * Visual-only strategic pillar wrapper — groups Active Context modules
 * without changing data-fetch or signal routing.
 */
export function StrategicPillarGroup({
  pillarId,
  title,
  description,
  isRtl = false,
  showTopRule = false,
  children,
}: StrategicPillarGroupProps) {
  return (
    <section
      data-strategic-pillar={pillarId}
      className={cn(showTopRule && ACTIVE_CONTEXT_SECTION_ZONE)}
      aria-label={title}
    >
      <header
        className={cn(
          "mb-4",
          isRtl ? "text-right font-arabic" : "text-left",
        )}
      >
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-xl text-[10px] font-normal leading-relaxed text-white/22">
            {description}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col">{children}</div>
    </section>
  );
}
