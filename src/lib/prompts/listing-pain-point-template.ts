/**
 * Utility-first Pain-Point → Solution framing for modular listing generation.
 * Injected into short + long system prompts to prioritize conversion copy.
 */
export const MODULAR_PAIN_POINT_SOLUTION_TEMPLATE = [
  "PAIN-POINT → SOLUTION FRAME (utility-first, mandatory):",
  "1. Name the user's #1 friction in plain language (from staged issues / APP CONTEXT).",
  "2. Show how the app removes that friction on day one — concrete feature, not hype.",
  "3. Close with a measurable outcome (time saved, accuracy, peace of mind).",
  "Lead with utility: the utility-focused short variation must be the strongest install hook.",
  "FORBIDDEN: vague promises without tying back to a named pain point.",
].join("\n");

export function buildPainPointSolutionUserBlock(params: {
  primaryPain: string;
  appName: string;
  anchorShort?: string;
}): string {
  return [
    "UTILITY-FOCUSED STRATEGY (prioritized):",
    MODULAR_PAIN_POINT_SOLUTION_TEMPLATE,
    "",
    `Primary pain point: ${params.primaryPain}`,
    `App: ${params.appName}`,
    params.anchorShort?.trim()
      ? `Anchor short (stay consistent): ${params.anchorShort.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
