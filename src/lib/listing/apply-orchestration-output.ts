import type { ActiveContextStrategyMode } from "@/lib/optimization-queue/resolve-strategy-mode";
import {
  orchestrationProtocolSchema,
  type OrchestrationProtocol,
} from "@/lib/listing/orchestration-protocol.schema";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/** Join expansion blocks when assembled text is missing or too short. */
export function assembleExpansionFullDescription(
  expansion: OrchestrationProtocol["modules"]["expansion"],
): string {
  const { hook, features, trustClosing } = expansion.blocks;
  const featureSections = features.categories
    .map((cat) => {
      const bullets = cat.bullets.map((b) => `• ${b}`).join("\n");
      return `${cat.label}\n${bullets}`;
    })
    .join("\n\n");

  return [hook.content.trim(), featureSections, trustClosing.content.trim(), trustClosing.cta.trim()]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

export function parseOrchestrationProtocol(raw: unknown): OrchestrationProtocol | null {
  const parsed = orchestrationProtocolSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Maps discrete orchestration modules onto legacy root fields for Play Console export
 * and backward-compatible UI tabs.
 */
export function applyOrchestrationToListingOutput(
  data: ListingGenerationOutput,
  orchestration: OrchestrationProtocol,
  strategyMode: ActiveContextStrategyMode = "defensive",
): ListingGenerationOutput {
  const { anchor, conversion, expansion } = orchestration.modules;

  const primaryVariation =
    conversion.shortVariations.find((v) => v.variationId === "primary") ??
    conversion.shortVariations.find(
      (v) =>
        v.variationId ===
        (strategyMode === "offensive" ? "offensive" : "defensive"),
    ) ??
    conversion.shortVariations[0];

  const assembled =
    expansion.assembledFullDescription.trim().length > 0
      ? expansion.assembledFullDescription.trim()
      : assembleExpansionFullDescription(expansion);

  return {
    ...data,
    title: anchor.title.trim().slice(0, 30),
    shortDescription: primaryVariation.shortDescription.trim().slice(0, 80),
    fullDescription: assembled.slice(0, 4000),
    orchestration,
  };
}

/** Extract orchestration from raw model JSON (tolerates partial nesting). */
export function extractOrchestrationFromParsed(parsed: unknown): OrchestrationProtocol | null {
  const root = asRecord(parsed);
  if (!root) return null;
  return parseOrchestrationProtocol(root.orchestration);
}

export type OrchestrationModuleId = "anchor" | "conversion" | "expansion";

/** Merge a freshly regenerated module into the previous orchestration snapshot. */
export function mergeOrchestrationModule(
  previous: OrchestrationProtocol,
  fresh: OrchestrationProtocol,
  moduleId: OrchestrationModuleId,
): OrchestrationProtocol {
  return {
    protocolVersion: fresh.protocolVersion,
    modules: {
      anchor: moduleId === "anchor" ? fresh.modules.anchor : previous.modules.anchor,
      conversion:
        moduleId === "conversion" ? fresh.modules.conversion : previous.modules.conversion,
      expansion:
        moduleId === "expansion" ? fresh.modules.expansion : previous.modules.expansion,
    },
  };
}
