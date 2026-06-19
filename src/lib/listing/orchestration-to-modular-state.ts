import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";
import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import {
  SHORT_VARIATION_TYPES,
  orchestrationVariationIdForType,
  orderShortVariations,
  shortVariationText,
  shortVariationTypeFromOrchestrationId,
  type ShortVariationItem,
} from "@/lib/listing/modular-short-variations";

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

  const variationsFromOrch: ShortVariationItem[] = conversion.shortVariations.map(
    (v, index) => ({
      type: shortVariationTypeFromOrchestrationId(v.variationId, index),
      text: v.shortDescription.trim().slice(0, 80),
    }),
  );
  const variations = orderShortVariations(variationsFromOrch);

  const selectedType = shortVariationTypeFromOrchestrationId(
    conversion.selectedVariationId,
    2,
  );
  const selectedIndex = Math.max(0, SHORT_VARIATION_TYPES.indexOf(selectedType));

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
        variations.filter((v) => v.text.trim()).length >= 3
          ? variations
          : orderShortVariations(
              conversion.shortVariations.map((v, index) => ({
                type: shortVariationTypeFromOrchestrationId(v.variationId, index),
                text: v.shortDescription.trim().slice(0, 80),
              })),
            ),
      selectedIndex: (() => {
        if (overrides?.shortDescription) {
          const idx = variations.findIndex(
            (v) => shortVariationText(v) === overrides.shortDescription!.trim(),
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
  const selectedType =
    state.shortDescription.variations[state.shortDescription.selectedIndex]?.type ??
    "utility";
  const selectedId = orchestrationVariationIdForType(selectedType);
  return {
    ...base,
    modules: {
      anchor: {
        ...base.modules.anchor,
        title: state.title.value.trim().slice(0, 30),
      },
      conversion: {
        ...base.modules.conversion,
        selectedVariationId: selectedId as "defensive" | "offensive" | "primary",
        shortVariations: base.modules.conversion.shortVariations.map((v, i) => {
          const item =
            state.shortDescription.variations.find(
              (row) => orchestrationVariationIdForType(row.type) === v.variationId,
            ) ?? state.shortDescription.variations[i];
          return {
            ...v,
            shortDescription: item ? shortVariationText(item) : v.shortDescription,
          };
        }) as OrchestrationProtocol["modules"]["conversion"]["shortVariations"],
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
