"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({
  currentId,
  workspaces,
  variant = "sidebar",
}: {
  currentId: string;
  workspaces: { id: string; name: string }[];
  variant?: "sidebar" | "navbar";
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (workspaces.length <= 1) {
    return null;
  }

  const isNavbar = variant === "navbar";

  return (
    <div className={cn("relative", isNavbar ? "" : "px-3 pb-2")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg border border-white/[0.1] bg-white/[0.05] text-left text-xs font-medium text-white/90 transition-colors hover:bg-white/[0.08]",
          isNavbar ? "px-2.5 py-2" : "w-full px-3 py-2",
        )}
      >
        <span className="truncate">{t("switchWorkspace")}</span>
        <span className="shrink-0 text-white/40">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <ul
          className={cn(
            "absolute z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-white/[0.1] bg-[#0f1319] py-1 shadow-xl shadow-black/50",
            isNavbar ? "right-0 top-full min-w-[11rem]" : "left-3 right-3",
          )}
        >
          {workspaces.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (w.id !== currentId) {
                    router.push(`/app/${w.id}`);
                    router.refresh();
                  }
                }}
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-xs",
                  w.id === currentId
                    ? "bg-[#22C55E]/12 font-semibold text-[#86efac]"
                    : "text-white/75 hover:bg-white/[0.06]",
                )}
              >
                {w.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
