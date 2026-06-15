import type { AddOptimizationQueueInput } from "@/lib/optimization-queue/optimization-queue.types";

type StagingAddBody = {
  signalType: string;
  content: string;
  source?: string;
  sourceContext?: string;
  sourceContextId?: string;
  metadata?: Record<string, unknown>;
};

function asSource(
  raw: string | undefined,
): AddOptimizationQueueInput["source"] {
  const s = String(raw ?? "manual");
  if (s === "keyword_spotlight") return "market_intel";
  if (
    s === "keyword_tracker" ||
    s === "competitor_spy" ||
    s === "review_analysis" ||
    s === "market_intel"
  ) {
    return s;
  }
  return "manual";
}

/** Mirror explicit staging/add payloads into the optimization queue. */
export function mapStagingPayloadToQueueInputs(
  body: StagingAddBody,
): AddOptimizationQueueInput[] {
  const source = asSource(body.source);
  const meta = body.metadata ?? {};
  const items: AddOptimizationQueueInput[] = [];

  if (body.signalType === "keyword") {
    const term = body.content.trim();
    if (term) {
      const rawSource = String(body.source ?? "");
      const isMarketIntel =
        source === "market_intel" || rawSource === "keyword_spotlight";
      const isTracker =
        !isMarketIntel && (source === "keyword_tracker" || source === "manual");
      items.push({
        type: isMarketIntel ? "keyword_gap" : "market_keyword",
        category: isTracker ? "tracker" : "opportunity",
        content: term,
        source: isTracker ? "keyword_tracker" : isMarketIntel ? "market_intel" : source,
        sourceContext: body.sourceContext,
        sourceContextId: body.sourceContextId,
        metadata: {
          ...meta,
          category: isTracker ? "tracker" : "opportunity",
          source_origin: isTracker
            ? "keyword_tracker"
            : isMarketIntel
              ? "market_intel"
              : source,
          ...(isMarketIntel ? { from_keyword_spotlight: true } : {}),
        },
      });
    }
    return items;
  }

  if (body.signalType === "review_issue") {
    const issue = body.content.trim();
    if (issue) {
      items.push({
        type: "review_pain_point",
        category: "review",
        content: issue,
        source: "review_analysis",
        sourceContext: body.sourceContext,
        sourceContextId: body.sourceContextId,
        metadata: { ...meta, category: "review", source_origin: "review_analysis" },
      });
    }
    return items;
  }

  if (body.signalType === "optimization_insight") {
    const keywords = meta.keywords;
    if (Array.isArray(keywords)) {
      for (const kw of keywords) {
        const term =
          typeof kw === "string"
            ? kw.trim()
            : typeof kw === "object" && kw && "term" in kw
              ? String((kw as { term: string }).term).trim()
              : "";
        if (!term) continue;
        items.push({
          type: "competitor_keyword",
          category: "opportunity",
          content: term,
          source: "competitor_spy",
          sourceContext: body.sourceContext,
          sourceContextId: body.sourceContextId,
          metadata: {
            ...meta,
            category: "opportunity",
            source_origin: "competitor_spy",
            competitor_gap_category:
              typeof kw === "object" && kw && "category" in kw
                ? (kw as { category: string }).category
                : meta.category,
          },
        });
      }
    }
    return items;
  }

  if (body.signalType === "competitor_weakness") {
    const vulns = meta.vulnerabilities;
    if (Array.isArray(vulns)) {
      for (const v of vulns) {
        const term = typeof v === "string" ? v.trim() : "";
        if (!term) continue;
        items.push({
          type: "competitor_weakness",
          category: "strength",
          content: term,
          source: "competitor_spy",
          sourceContext: body.sourceContext,
          sourceContextId: body.sourceContextId,
          metadata: { ...meta, category: "strength", source_origin: "competitor_spy" },
        });
      }
    }
    const kws = meta.keywords;
    if (Array.isArray(kws)) {
      for (const kw of kws) {
        const term = typeof kw === "string" ? kw.trim() : "";
        if (!term) continue;
        items.push({
          type: "competitor_keyword",
          category: "opportunity",
          content: term,
          source: "competitor_spy",
          sourceContext: body.sourceContext,
          sourceContextId: body.sourceContextId,
          metadata: { ...meta, category: "opportunity", source_origin: "competitor_spy" },
        });
      }
    }
    return items;
  }

  return items;
}
