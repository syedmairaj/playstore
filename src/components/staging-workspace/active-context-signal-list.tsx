"use client";

import React from "react";
import { cn } from "@/lib/utils";

export const ACTIVE_CONTEXT_MAX_VISIBLE_ROWS = 6;

type ActiveContextSignalListProps = {
  children: React.ReactNode;
  rowHeight: number;
  maxVisibleRows?: number;
  className?: string;
};

/** Scrollable signal list with ultra-light row dividers. */
export function ActiveContextSignalList({
  children,
  rowHeight,
  maxVisibleRows = ACTIVE_CONTEXT_MAX_VISIBLE_ROWS,
  className,
}: ActiveContextSignalListProps) {
  const items = React.Children.toArray(children);

  return (
    <div
      className={cn("w-full overflow-y-auto", className)}
      style={{ maxHeight: maxVisibleRows * (rowHeight + 4) }}
    >
      {items.map((child, index) => (
        <div
          key={index}
          className={cn(
            index < items.length - 1 && "border-b border-white/[0.04]",
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
