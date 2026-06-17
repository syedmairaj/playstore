"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readStrengthAuditQueue,
  STRENGTH_AUDIT_UPDATED_EVENT,
} from "@/lib/client/competitor-strength-audit-store";
import type { CompetitorStrengthAuditItem } from "@/lib/competitor-spy/praise-signal-curation";

export function useCompetitorStrengthAuditQueue(
  workspaceId: string,
  competitorId: string | null | undefined,
): {
  items: CompetitorStrengthAuditItem[];
  pending: CompetitorStrengthAuditItem[];
  refresh: () => void;
} {
  const [items, setItems] = useState<CompetitorStrengthAuditItem[]>([]);

  const refresh = useCallback(() => {
    if (!competitorId) {
      setItems([]);
      return;
    }
    setItems(readStrengthAuditQueue(workspaceId, competitorId));
  }, [workspaceId, competitorId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId: string }>).detail;
      if (detail?.workspaceId === workspaceId) refresh();
    };
    window.addEventListener(STRENGTH_AUDIT_UPDATED_EVENT, handler);
    return () => window.removeEventListener(STRENGTH_AUDIT_UPDATED_EVENT, handler);
  }, [workspaceId, refresh]);

  const pending = items.filter((item) => item.status === "pending");

  return { items, pending, refresh };
}
