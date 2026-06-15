/** Shared Sonner styling for Active Context remove / archive notifications. */
export const ACTIVE_CONTEXT_TOAST_POSITION = "bottom-right" as const;
export const ACTIVE_CONTEXT_TOAST_DURATION_MS = 5000;
export const ACTIVE_CONTEXT_ARCHIVE_DURATION_MS = 5000;

export const ACTIVE_CONTEXT_TOAST_CLASS_NAMES = {
  toast:
    "border border-emerald-500/40 bg-[#0B0E14] text-white shadow-[0_8px_30px_-12px_rgba(16,185,129,0.35)]",
  actionButton:
    "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25",
  title: "text-emerald-50",
  description: "text-emerald-200/70",
} as const;
