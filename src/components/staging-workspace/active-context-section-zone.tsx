"use client";

import { cn } from "@/lib/utils";
import { ACTIVE_CONTEXT_SECTION_ZONE } from "@/components/staging-workspace/active-context-tokens";

type ActiveContextSectionZoneProps = {
  /** When true, renders 32px gap + #2a2a2a rule + 20px pad before the section header. */
  showSectionRule?: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * Sectional gravity wrapper — defines each Active Context module as a distinct zone.
 * Full-width rule and spacing are locale-agnostic (EN/AR layout only flips text).
 */
export function ActiveContextSectionZone({
  showSectionRule = false,
  children,
  className,
}: ActiveContextSectionZoneProps) {
  return (
    <div className={cn(showSectionRule && ACTIVE_CONTEXT_SECTION_ZONE, className)}>
      {children}
    </div>
  );
}
