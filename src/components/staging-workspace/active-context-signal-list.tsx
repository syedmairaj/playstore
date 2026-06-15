"use client";

import { cn } from "@/lib/utils";

export const ACTIVE_CONTEXT_MAX_VISIBLE_ROWS = 6;

type ActiveContextSignalListProps = {
  children: React.ReactNode;
  rowHeight: number;
  maxVisibleRows?: number;
  className?: string;
};

/** Shared scrollable list container for Active Context module rows/chips. */
export function ActiveContextSignalList({
  children,
  rowHeight,
  maxVisibleRows = ACTIVE_CONTEXT_MAX_VISIBLE_ROWS,
  className,
}: ActiveContextSignalListProps) {
  return (
    <div
      className={cn("w-full space-y-0.5 overflow-y-auto px-0.5", className)}
      style={{ maxHeight: maxVisibleRows * (rowHeight + 2) }}
    >
      {children}
    </div>
  );
}
