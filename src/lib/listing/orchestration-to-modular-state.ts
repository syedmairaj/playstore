import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";
import type { ModularListingState } from "@/lib/listing/modular-listing.types";

const VARIATION_ORDER = ["defensive", "offensive", "primary"] as const;

function formatExpansionFeatures(
  features: OrchestrationProtocol["modules"]["expansion"]["blocks"]["features"],
): string {
  return features.categories
    .map((cat) => {
      const bullets = cat.bullets.join("\n");
      return `${cat.label}\n${bullets}`;
    })
    .join("\n\n");
}

function formatTrustClosing(
  trust: OrchestrationProtocol["modules"]["expansion"]["blocks"]["trustClosing"],
): string {
  return [trust.content.trim(), trust.cta.trim()].filter(Boolean).join("\n\n");
}

/** Map Orchestration Protocol modules → modular UI state. */
export function orchestrationToModularState(
  orchestration: OrchestrationProtocol,
  overrides?: {
    title?: string;
    shortDescription?: string;
    longDescription?: string;
  },
): ModularListingState {
  const { anchor, conversion, expansion } = orchestration.modules;

  const variations = VARIATION_ORDER.map((id) => {
    const match = conversion.shortVariations.find((v) => v.variationId === id);
    return match?.shortDescription ?? "";
  }).filter(Boolean);

  const selectedIndex = Math.max(
    0,
    VARIATION_ORDER.indexOf(conversion.selectedVariationId),
  );

  const hook = expansion.blocks.hook.content.trim();
  const features = formatExpansionFeatures(expansion.blocks.features);
  const closing = formatTrustClosing(expansion.blocks.trustClosing);

  let longDescription = { hook, features, closing };
  if (overrides?.longDescription?.trim()) {
    const parts = overrides.longDescription.split(/\n\n+/);
    longDescription = {
      hook: parts[0] ?? hook,
      features: parts.length > 2 ? parts.slice(1, -1).join("\n\n") : features,
      closing: parts.length > 1 ? (parts[parts.length - 1] ?? closing) : closing,
    };
  }

  return {
    title: {
      value: (overrides?.title ?? anchor.title).trim().slice(0, 30),
      locked: anchor.lockedKeywords.length > 0,
    },
    shortDescription: {
      variations:
        variations.length >= 3
          ? (variations as [string, string, string])
          : (conversion.shortVariations.map((v) => v.shortDescription) as [
              string,
              string,
              string,
            ]),
      selectedIndex: (() => {
        if (overrides?.shortDescription) {
          const idx = variations.findIndex(
            (v) => v.trim() === overrides.shortDescription!.trim(),
          );
          if (idx >= 0) return idx;
        }
        return selectedIndex >= 0 ? selectedIndex : 2;
      })(),
    },
    longDescription,
  };
}

export function modularStateToOrchestrationPatch(
  state: ModularListingState,
  base: OrchestrationProtocol,
): OrchestrationProtocol {
  const selectedId = VARIATION_ORDER[state.shortDescription.selectedIndex] ?? "primary";
  return {
    ...base,
    modules: {
      anchor: {
        ...base.modules.anchor,
        title: state.title.value.trim().slice(0, 30),
      },
      conversion: {
        ...base.modules.conversion,
        selectedVariationId: selectedId,
        shortVariations: base.modules.conversion.shortVariations.map((v, i) => ({
          ...v,
          shortDescription:
            state.shortDescription.variations[i]?.trim().slice(0, 80) ??
            v.shortDescription,
        })) as OrchestrationProtocol["modules"]["conversion"]["shortVariations"],
      },
      expansion: {
        ...base.modules.expansion,
        blocks: {
          hook: {
            ...base.modules.expansion.blocks.hook,
            content: state.longDescription.hook.trim(),
          },
          features: base.modules.expansion.blocks.features,
          trustClosing: {
            ...base.modules.expansion.blocks.trustClosing,
            content: state.longDescription.closing.split("\n\n")[0]?.trim() ??
              base.modules.expansion.blocks.trustClosing.content,
          },
        },
      },
    },
  };
}
