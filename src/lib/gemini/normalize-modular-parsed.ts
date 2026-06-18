import type { ListingOptimizerInput } from "@/lib/types/listing";
import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";
import { buildStrategyModePromptBlock } from "@/lib/prompts/aso-strategy-mode";

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

/** Compact context for modular steps — avoids full-listing / orchestration JSON conflicts. */
export function buildModularListingContextBlock(input: ListingOptimizerInput): string {
  const targetArabic = input.targetArabic ?? false;
  const lines = [
    `App: ${input.appName}`,
    `Category: ${input.category}`,
    `Seed keywords: ${input.targetKeywords.slice(0, 25).join(", ")}`,
    `Features: ${input.appFeatures.slice(0, 2000)}`,
    targetArabic
      ? "Output language: Modern Standard Arabic suitable for Google Play MENA."
      : "Output language: English suitable for Google Play.",
    buildStrategyModePromptBlock({
      strategyMode: input.strategyMode ?? "defensive",
      topStagedIssues: input.topStagedIssues ?? [],
      trackedKeywordSignals: input.trackedKeywordSignals,
      targetArabic,
    }),
  ];

  if (input.topStagedIssues?.length) {
    lines.push(
      `Top review insights: ${input.topStagedIssues.map((i) => i.label).join("; ")}`,
    );
  }

  if (input.activeContext && activeContextHasSignals(input.activeContext)) {
    const defensive = input.activeContext.defensive
      .slice(0, 5)
      .map((s) => s.label)
      .join("; ");
    const offensive = input.activeContext.offensive
      .slice(0, 5)
      .map((s) => s.label)
      .join("; ");
    const market = input.activeContext.market
      .slice(0, 5)
      .map((s) => s.label)
      .join("; ");
    if (defensive) lines.push(`Defensive signals: ${defensive}`);
    if (offensive) lines.push(`Offensive signals: ${offensive}`);
    if (market) lines.push(`Market signals: ${market}`);
  }

  return lines.filter(Boolean).join("\n");
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

export function normalizeModularShortParsed(parsed: unknown): { variations: string[] } {
  if (Array.isArray(parsed)) {
    return { variations: readStringArray(parsed) };
  }

  const root = asRecord(parsed);
  if (!root) return { variations: [] };

  let variations = readStringArray(root.variations);
  if (variations.length === 0) {
    const modules = asRecord(root.modules);
    const conversion = modules ? asRecord(modules.conversion) : null;
    if (conversion) {
      const items = conversion.shortVariations;
      if (Array.isArray(items)) {
        variations = items
          .map((item) => {
            const row = asRecord(item);
            return row ? readString(row, "shortDescription") : "";
          })
          .filter(Boolean);
      }
    }
  }

  if (variations.length === 0 && typeof root.shortDescription === "string") {
    variations = [root.shortDescription.trim()];
  }

  return { variations };
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
