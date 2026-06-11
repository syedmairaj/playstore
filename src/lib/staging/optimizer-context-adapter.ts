/**
 * Maps universal vault JSONB (state_en / state_ar) → legacy optimizer context items
 * consumed by ListingOptimizer Active Context pillars.
 */

export type VaultLocale = "en" | "ar";

export interface OptimizerContextItem {
  id: string;
  signalType: string;
  content: string;
  source: string;
  sourceAppId?: string;
  sourceContext?: string;
  sourceContextId?: string;
  language: VaultLocale;
  stagedAt: string;
  metadata: Record<string, unknown>;
}

export interface VaultRowForContext {
  id: string;
  app_id: string;
  state_en: Record<string, unknown> | null;
  state_ar: Record<string, unknown> | null;
  updated_at: string | null;
  deleted_at: string | null;
  is_deleted: boolean | null;
}

function stateBranch(row: VaultRowForContext, locale: VaultLocale): Record<string, unknown> {
  const raw = locale === "ar" ? row.state_ar : row.state_en;
  return raw && typeof raw === "object" ? raw : {};
}

function normalizeKeywords(
  raw: unknown
): Array<{ term: string; category: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ term: string; category: string }> = [];
  for (const kw of raw) {
    if (typeof kw === "string" && kw.trim()) {
      out.push({ term: kw.trim(), category: "high_volume" });
    } else if (kw && typeof kw === "object") {
      const o = kw as Record<string, unknown>;
      const term = String(o.term ?? o.keyword ?? "").trim();
      if (!term) continue;
      out.push({
        term,
        category: String(o.category ?? "high_volume"),
      });
    }
  }
  return out;
}

/**
 * Flatten vault feature namespaces into activeItems for the optimizer UI.
 */
export function flattenVaultToActiveItems(
  rows: VaultRowForContext[],
  locale: VaultLocale
): OptimizerContextItem[] {
  const items: OptimizerContextItem[] = [];

  for (const row of rows) {
    if (row.deleted_at || row.is_deleted) continue;

    const features = (stateBranch(row, locale).features ?? {}) as Record<string, unknown>;
    const stagedAt = row.updated_at ?? new Date().toISOString();

    // review_analysis → review_issue pills
    const reviewAnalysis = features.review_analysis as Record<string, unknown> | undefined;
    if (reviewAnalysis) {
      const improvements = (
        reviewAnalysis.opportunities ??
        reviewAnalysis.improvements ??
        []
      ) as Array<Record<string, unknown>>;

      improvements.forEach((imp, idx) => {
        const issue = String(imp.issue ?? imp.theme ?? "").trim();
        if (!issue) return;
        items.push({
          id: `${row.id}:review:${idx}`,
          signalType: "review_issue",
          content: issue,
          source: "review_analysis",
          sourceAppId: row.app_id,
          language: locale,
          stagedAt,
          metadata: { ...imp, app_id: row.app_id },
        });
      });
    }

    // competitor_spy → optimization_insight + metadata.keywords for Competitor Keywords pillar
    const competitorSpy = features.competitor_spy as Record<string, unknown> | undefined;
    const competitors = (competitorSpy?.competitors ?? []) as Array<Record<string, unknown>>;

    competitors.forEach((comp, cIdx) => {
      const compName = String(comp.app_name ?? comp.name ?? "Competitor").trim();
      const keywords = normalizeKeywords(comp.keywords);
      const weaknesses = Array.isArray(comp.weaknesses) ? comp.weaknesses : [];

      if (keywords.length === 0 && weaknesses.length === 0) return;

      items.push({
        id: `${row.id}:competitor:${cIdx}`,
        signalType: "optimization_insight",
        content:
          keywords.length > 0
            ? `Competitor keywords from ${compName} (${keywords.length})`
            : `Competitor insights from ${compName}`,
        source: "competitor_spy",
        sourceAppId: row.app_id,
        sourceContext: compName,
        sourceContextId: String(comp.competitor_id ?? comp.id ?? ""),
        language: locale,
        stagedAt,
        metadata: {
          competitor_name: compName,
          keywords,
          category: "competitor_keyword",
          weaknesses,
          app_id: row.app_id,
        },
      });
    });

    // Optional legacy embedded signals (forward compat)
    const embedded = features.staged_signals as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(embedded)) {
      embedded.forEach((sig, idx) => {
        const content = String(sig.content ?? "").trim();
        if (!content) return;
        items.push({
          id: String(sig.id ?? `${row.id}:embedded:${idx}`),
          signalType: String(sig.signal_type ?? sig.signalType ?? "keyword"),
          content,
          source: String(sig.source ?? "staging_vault"),
          sourceAppId: row.app_id,
          sourceContext: sig.source_context as string | undefined,
          sourceContextId: sig.source_context_id as string | undefined,
          language: locale,
          stagedAt: String(sig.created_at ?? stagedAt),
          metadata: (sig.metadata as Record<string, unknown>) ?? {},
        });
      });
    }
  }

  return items;
}

export function flattenVaultToArchivedItems(
  rows: VaultRowForContext[],
  locale: VaultLocale
): Array<{
  id: string;
  signalType: string;
  archivedAt: string;
  archivedReason: string;
}> {
  return rows
    .filter((r) => Boolean(r.deleted_at) || r.is_deleted === true)
    .map((r) => ({
      id: r.id,
      signalType: "vault_row",
      archivedAt: r.deleted_at ?? r.updated_at ?? new Date().toISOString(),
      archivedReason: "archived",
    }));
}
