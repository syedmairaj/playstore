/**
 * Core platform: identity, tenancy, billing primitives.
 * Import paths stay stable — code may still live under `lib/workspace`, `lib/plan-limits`, etc.
 * New core-only modules should prefer `lib/features/core/<name>/` over scattered roots.
 */
export { getWorkspaceRole, type WorkspaceRole } from "@/lib/workspace/membership";
export { normalizePlan, PLAN_META, type PlanId } from "@/lib/plan-limits";
export { PRICING } from "@/constants/pricing";
