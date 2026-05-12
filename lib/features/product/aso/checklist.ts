import type { FeatureFlagMap } from "@/lib/features/flags/resolve";

export type AsoChecklistInput = {
  appsCount: number;
  keywordCount: number;
  hasSnapshots: boolean;
  listingDraftCount: number;
  alertRuleCount: number;
};

export type AsoCheckItem = {
  label: string;
  done: boolean;
  href: string;
};

export function buildAsoChecklist(
  input: AsoChecklistInput,
  labels: {
    checkApps: string;
    checkKeywords: string;
    checkSnapshots: string;
    checkListing: string;
    checkAlerts: string;
  },
  workspacePath: string,
): { score: number; checks: AsoCheckItem[] } {
  const base = `/app/${workspacePath}`;
  const checks: AsoCheckItem[] = [
    { label: labels.checkApps, done: input.appsCount > 0, href: `${base}/settings` },
    { label: labels.checkKeywords, done: input.keywordCount > 0, href: `${base}/keywords` },
    { label: labels.checkSnapshots, done: input.hasSnapshots, href: `${base}/keywords` },
    { label: labels.checkListing, done: input.listingDraftCount > 0, href: `${base}/optimizer` },
    { label: labels.checkAlerts, done: input.alertRuleCount > 0, href: `${base}/alerts` },
  ];
  const score = checks.filter((c) => c.done).length * 20;
  return { score, checks };
}

/** Gate product modules that are not ready for GA without touching checklist math. */
export function isModuleEnabled(flags: FeatureFlagMap, key: keyof FeatureFlagMap): boolean {
  return flags[key];
}
