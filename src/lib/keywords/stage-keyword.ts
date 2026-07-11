import type { SupabaseClient } from "@supabase/supabase-js";

export const RANK_MONITORING_STATUS = {
  trackingPending: "tracking_pending",
  active: "active",
  paused: "paused",
} as const;

export type RankMonitoringStatus =
  (typeof RANK_MONITORING_STATUS)[keyof typeof RANK_MONITORING_STATUS];

export type StageKeywordInput = {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
  term: string;
  market: string;
  locale?: string;
  source?: string;
};

export type StageKeywordResult = {
  keywordId: string;
  term: string;
  market: string;
  appId: string;
  keywordTracker: {
    created: boolean;
    alreadyExists: boolean;
  };
  rankMonitoring: {
    upserted: boolean;
    status: RankMonitoringStatus;
  };
};

function normalizeMarket(market: string): string {
  return market.trim().toLowerCase();
}

function localeForMarket(market: string, locale?: string): string {
  if (locale?.trim()) return locale.trim();
  return market === "sa" || market === "ae" ? "ar-SA" : "en-US";
}

async function findExistingKeywordId(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
  term: string;
  market: string;
}): Promise<string | null> {
  const { data, error } = await params.supabase
    .from("keywords")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("app_id", params.appId)
    .eq("market", params.market)
    .ilike("term", params.term.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.id as string) ?? null;
}

/**
 * Saves a keyword to Keyword Tracker (`keywords`) and upserts the Wins Dashboard
 * rank monitoring queue (`rank_monitoring`).
 */
export async function stageKeyword(
  input: StageKeywordInput,
): Promise<StageKeywordResult> {
  const {
    supabase,
    workspaceId,
    appId,
    source = "keyword_validator",
  } = input;
  const term = input.term.trim();
  const market = normalizeMarket(input.market);
  const locale = localeForMarket(market, input.locale);

  if (term.length < 2) {
    throw new Error("Keyword term must be at least 2 characters.");
  }

  const { data: appRow, error: appErr } = await supabase
    .from("apps")
    .select("id")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (appErr) throw new Error(appErr.message);
  if (!appRow) throw new Error("App not found in this workspace.");

  let keywordId = await findExistingKeywordId({
    supabase,
    workspaceId,
    appId,
    term,
    market,
  });

  let keywordCreated = false;

  if (!keywordId) {
    const { data: inserted, error: insertErr } = await supabase
      .from("keywords")
      .insert({
        workspace_id: workspaceId,
        app_id: appId,
        term,
        market,
        locale,
        source,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      const dup =
        insertErr?.code === "23505" ||
        /duplicate key|keywords_unique_term/i.test(insertErr?.message ?? "");
      if (dup) {
        keywordId = await findExistingKeywordId({
          supabase,
          workspaceId,
          appId,
          term,
          market,
        });
      } else {
        throw new Error(insertErr?.message ?? "Failed to create tracked keyword.");
      }
    } else {
      keywordId = inserted.id as string;
      keywordCreated = true;
    }
  }

  if (!keywordId) {
    throw new Error("Could not resolve keyword row for rank monitoring.");
  }

  const now = new Date().toISOString();
  const { data: existingMonitor, error: selectMonitorErr } = await supabase
    .from("rank_monitoring")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .eq("keyword_id", keywordId)
    .eq("market", market)
    .maybeSingle();

  if (selectMonitorErr) throw new Error(selectMonitorErr.message);

  if (existingMonitor?.id) {
    const { error: updateErr } = await supabase
      .from("rank_monitoring")
      .update({
        status: RANK_MONITORING_STATUS.trackingPending,
        source,
        updated_at: now,
      })
      .eq("id", existingMonitor.id as string);
    if (updateErr) throw new Error(updateErr.message);
  } else {
    const { error: insertMonitorErr } = await supabase.from("rank_monitoring").insert({
      workspace_id: workspaceId,
      app_id: appId,
      keyword_id: keywordId,
      market,
      status: RANK_MONITORING_STATUS.trackingPending,
      source,
      updated_at: now,
    });
    if (insertMonitorErr) throw new Error(insertMonitorErr.message);
  }

  return {
    keywordId,
    term,
    market,
    appId,
    keywordTracker: {
      created: keywordCreated,
      alreadyExists: !keywordCreated,
    },
    rankMonitoring: {
      upserted: true,
      status: RANK_MONITORING_STATUS.trackingPending,
    },
  };
}

/** Clears cached Wins Dashboard payload so Live Rank Tracking picks up new keywords. */
export async function invalidateRankWinsCacheForApp(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
): Promise<void> {
  await supabase
    .from("market_rank_wins_cache")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId);
}
