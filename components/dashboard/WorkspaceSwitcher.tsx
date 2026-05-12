"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

export function WorkspaceSwitcher({
  currentId,
  workspaces,
}: {
  currentId: string;
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (workspaces.length <= 1) {
    return null;
  }

  return (
    <div className="relative px-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-left text-xs font-medium text-white/90 hover:bg-white/[0.08]"
      >
        <span className="truncate">Switch workspace</span>
        <span className="text-white/40">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <ul className="absolute left-3 right-3 z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-white/12 bg-[#12151c] py-1 shadow-xl shadow-black/40">
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
                className={`block w-full truncate px-3 py-2 text-left text-xs ${
                  w.id === currentId
                    ? "bg-[#22C55E]/15 font-semibold text-[#22C55E]"
                    : "text-white/75 hover:bg-white/[0.06]"
                }`}
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
