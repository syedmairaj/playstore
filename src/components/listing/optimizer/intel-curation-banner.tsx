"use client";

/**
 * IntelCurationBanner
 *
 * A high-visibility blocking banner shown above the "Generate" button when
 * an intel module (Competitor Spy, Review Insights, Market Intel) has
 * uncurated DISCOVERY signals.
 *
 * The banner:
 *   • Shows the module name and discovery count.
 *   • Provides a "Go to Curation" button that deep-links directly to the
 *     relevant module page inside the current workspace.
 *   • Can be dismissed if the user wants to ignore the warning temporarily
 *     (generation will still be blocked by the API if DISCOVERY signals remain).
 */

import { AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { PipelineDiscoveryBlocker } from "@/lib/client/pipeline-preflight";
import {
  INTEL_MODULE_DISPLAY_NAMES,
  INTEL_MODULE_CURATION_PATHS,
} from "@/lib/client/pipeline-preflight";

type Props = {
  workspaceId: string;
  blocker: PipelineDiscoveryBlocker;
  /** Called when the user clicks the dismiss (×) button. */
  onDismiss?: () => void;
  className?: string;
};

export function IntelCurationBanner({ workspaceId, blocker, onDismiss, className }: Props) {
  const t = useTranslations("optimizer.modular.curationBanner");

  const displayName = INTEL_MODULE_DISPLAY_NAMES[blocker.module];
  const curationPath = `/app/${workspaceId}${INTEL_MODULE_CURATION_PATHS[blocker.module]}`;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-orange-400/30 bg-orange-400/[0.07] px-4 py-3.5",
        className,
      )}
    >
      {/* Icon */}
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-orange-400"
        aria-hidden
      />

      {/* Body */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-orange-300">{t("title")}</p>
        <p className="mt-1 text-xs leading-relaxed text-orange-200/70">
          {t("body", { count: blocker.discoveryCount, module: displayName })}
        </p>

        {/* CTA */}
        <div className="mt-3">
          <Link
            href={curationPath}
            className="inline-flex items-center rounded-lg border border-orange-400/40 bg-orange-400/15 px-3 py-1.5 text-xs font-semibold text-orange-300 transition hover:border-orange-400/60 hover:bg-orange-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"
          >
            {t("goToCuration")}
          </Link>
        </div>
      </div>

      {/* Dismiss */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          title={t("dismiss")}
          className="shrink-0 rounded p-0.5 text-orange-400/60 transition hover:text-orange-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-400/50"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
