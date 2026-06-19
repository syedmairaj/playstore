import {
  coerceShortVariationsInput,
  defaultShortVariationType,
  orderShortVariations,
  shortVariationTypeFromOrchestrationId,
} from "@/lib/listing/modular-short-variations";

export {
  buildModularAppContextBlock,
  buildModularListingContextBlock,
} from "@/lib/listing/modular-app-context";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readString(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return typeof v === "string" ? v.trim() : "";
}

function readStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeModularTitleParsed(
  parsed: unknown,
  fallbackLockedKeywords: string[],
): { title: string; lockedKeywords: string[] } {
  const root = asRecord(parsed);
  const modules = root ? asRecord(root.modules) : null;
  const anchor =
    (root ? asRecord(root.anchor) : null) ??
    (modules ? asRecord(modules.anchor) : null);

  let title = root ? readString(root, "title") : "";
  if (!title && anchor) {
    title = readString(anchor, "title");
  }

  let lockedKeywords = root ? readStringArray(root.lockedKeywords) : [];
  if (lockedKeywords.length === 0 && anchor) {
    lockedKeywords = readStringArray(anchor.lockedKeywords);
  }
  if (lockedKeywords.length === 0) {
    lockedKeywords = fallbackLockedKeywords.slice(0, 20);
  }

  if (!title) {
    title =
      fallbackLockedKeywords.slice(0, 3).join(" ").trim() ||
      readString(root ?? {}, "appName") ||
      "App";
  }

  return {
    title: title.slice(0, 30),
    lockedKeywords: lockedKeywords.slice(0, 20),
  };
}

export function normalizeModularShortParsed(parsed: unknown): {
  variations: ReturnType<typeof orderShortVariations>;
} {
  if (Array.isArray(parsed)) {
    return { variations: orderShortVariations(coerceShortVariationsInput(parsed)) };
  }

  const root = asRecord(parsed);
  if (!root) return { variations: [] };

  if (Array.isArray(root.variations)) {
    const typed = root.variations.map((item, index) => {
      if (typeof item === "string") {
        return { type: defaultShortVariationType(index), text: item.trim().slice(0, 80) };
      }
      const row = asRecord(item);
      if (!row) {
        return { type: defaultShortVariationType(index), text: "" };
      }
      const text = readString(row, "text") || readString(row, "shortDescription");
      const typeRaw = readString(row, "type") || readString(row, "variationId");
      const type = typeRaw
        ? shortVariationTypeFromOrchestrationId(typeRaw, index)
        : defaultShortVariationType(index);
      return { type, text: text.slice(0, 80) };
    });
    return { variations: orderShortVariations(typed) };
  }

  const modules = asRecord(root.modules);
  const conversion = modules ? asRecord(modules.conversion) : null;
  if (conversion && Array.isArray(conversion.shortVariations)) {
    const typed = conversion.shortVariations.map((item, index) => {
      const row = asRecord(item);
      if (!row) {
        return { type: defaultShortVariationType(index), text: "" };
      }
      const variationId = readString(row, "variationId");
      return {
        type: shortVariationTypeFromOrchestrationId(variationId, index),
        text: readString(row, "shortDescription").slice(0, 80),
      };
    });
    return { variations: orderShortVariations(typed) };
  }

  if (typeof root.shortDescription === "string") {
    return {
      variations: orderShortVariations([
        { type: "growth", text: root.shortDescription.trim().slice(0, 80) },
      ]),
    };
  }

  return { variations: [] };
}

export function normalizeModularLongParsed(parsed: unknown): {
  hook: string;
  features: string;
  closing: string;
} {
  const root = asRecord(parsed) ?? {};
  const modules = asRecord(root.modules);
  const expansion = modules ? asRecord(modules.expansion) : null;
  const blocks = expansion ? asRecord(expansion.blocks) : asRecord(root.blocks);

  const hookBlock = blocks ? asRecord(blocks.hook) : null;
  const featuresBlock = blocks ? asRecord(blocks.features) : null;
  const trustBlock = blocks ? asRecord(blocks.trustClosing) : null;

  let hook = readString(root, "hook") || (hookBlock ? readString(hookBlock, "content") : "");
  let features = readString(root, "features");
  let closing = readString(root, "closing");

  if (!features && featuresBlock) {
    const categories = featuresBlock.categories;
    if (Array.isArray(categories)) {
      features = categories
        .map((cat) => {
          const row = asRecord(cat);
          if (!row) return "";
          const label = readString(row, "label");
          const bullets = readStringArray(row.bullets).join("\n");
          return label ? `${label}\n${bullets}` : bullets;
        })
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (!closing && trustBlock) {
    closing = [readString(trustBlock, "content"), readString(trustBlock, "cta")]
      .filter(Boolean)
      .join("\n\n");
  }

  if (!hook && typeof root.fullDescription === "string") {
    hook = root.fullDescription.split("\n\n")[0]?.trim() ?? "";
  }

  return {
    hook: hook.slice(0, 1200),
    features: features.slice(0, 2400),
    closing: closing.slice(0, 800),
  };
}
