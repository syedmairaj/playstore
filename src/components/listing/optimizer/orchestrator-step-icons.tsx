import type { ComponentType } from "react";
import type { OrchestratorStepId } from "@/lib/client/growth-orchestrator";

type IconProps = { className?: string };

function TagIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M20 12v-2.5a2.5 2.5 0 0 0-2.5-2.5H14l-6.3-6.3a1 1 0 0 0-1.4 0l-1.6 1.6a1 1 0 0 0 0 1.4L9 9.5V14a2.5 2.5 0 0 0 2.5 2.5h2.5l4.6 4.6a1 1 0 0 0 1.4 0l1.6-1.6a1 1 0 0 0 0-1.4L20 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m16.5 16.5 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TargetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    </svg>
  );
}

function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="m12 4.5 1.8 4.2 4.5.4-3.4 3 1 4.4L12 14.8 8.1 16.5l1-4.4-3.4-3 4.5-.4L12 4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AssembleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect
        x="4"
        y="11"
        width="7"
        height="7"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="13"
        y="4"
        width="7"
        height="7"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M11 14.5h2M14.5 11v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RocketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.5c2.2 2.8 3.5 6.2 3.5 9.8 0 .8-.1 1.6-.2 2.3l2.2 2.2-2.1 2.1-2.2-2.2c-.7.1-1.5.2-2.3.2-3.6 0-7-1.3-9.8-3.5 1.1-2.8 3.2-5.2 5.9-6.7L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M7.5 16.5 5 19M16.5 16.5 19 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const STEP_ICONS: Record<OrchestratorStepId, ComponentType<IconProps>> = {
  app_identity: TagIcon,
  research_keywords: SearchIcon,
  analyze_competitors: TargetIcon,
  audit_reviews: StarIcon,
  market_discovery: AssembleIcon,
  final_optimization: RocketIcon,
};

export function OrchestratorStepIcon({
  stepId,
  className,
}: {
  stepId: OrchestratorStepId;
  className?: string;
}) {
  const Icon = STEP_ICONS[stepId];
  return <Icon className={className} />;
}
