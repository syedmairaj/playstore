/**
 * Context Gateway diagnostic — compares compileContext-style queries vs raw DB rows.
 *
 * Usage: node scripts/diagnose-context.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ID = "e8408dba-a0d5-49ce-a88c-6759b01b2ff1";
const QUEUE_HASH =
  "22ae6c29370ff12f9c259342f5b3d66bbf5a885b7cda7834da08c9452ea62eaa";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function section(title) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function normalizeLocale(raw) {
  return raw?.toLowerCase() === "ar" ? "ar" : "en";
}

/** Mirrors compileContextForStep in src/lib/listing/context-gateway.ts */
async function compileContextMirror(supabase, params) {
  const vaultLocale = params.vaultLocale ?? "en";
  const queueHash = params.queueHash.trim();
  const step = params.step ?? "full";
  const scope =
    step === "title" ? "keywords" : step === "short" ? "keywords_market" : "full";

  let keywordsQuery = supabase
    .from("workspace_keywords")
    .select(
      "id, keyword, locale, is_staged, confidence, difficulty, search_volume, queue_hash",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("is_staged", true)
    .eq("locale", vaultLocale);

  if (params.appId) {
    keywordsQuery = keywordsQuery.or(`app_id.eq.${params.appId},app_id.is.null`);
  }
  keywordsQuery = keywordsQuery.or(`queue_hash.eq.${queueHash},queue_hash.is.null`);

  const keywordsRes = await keywordsQuery;
  if (keywordsRes.error) {
    throw new Error(`keywords query failed: ${keywordsRes.error.message}`);
  }

  let marketSnapshots = [];
  let reviews = [];

  if (scope !== "keywords") {
    let marketQuery = supabase
      .from("workspace_market_snapshots")
      .select(
        "id, keyword, locale, rank, search_volume, country_code, snapshot_at, queue_hash",
      )
      .eq("workspace_id", params.workspaceId)
      .eq("locale", vaultLocale);
    if (params.appId) {
      marketQuery = marketQuery.or(`app_id.eq.${params.appId},app_id.is.null`);
    }
    marketQuery = marketQuery.or(`queue_hash.eq.${queueHash},queue_hash.is.null`);
    const marketRes = await marketQuery;
    if (marketRes.error) {
      throw new Error(`market query failed: ${marketRes.error.message}`);
    }
    marketSnapshots = marketRes.data ?? [];
  }

  if (scope === "full") {
    let reviewsQuery = supabase
      .from("workspace_reviews")
      .select(
        "id, review_id, review_text, score, sentiment_tag, ai_tags, is_utilized, queue_hash",
      )
      .eq("workspace_id", params.workspaceId)
      .not("sentiment_tag", "is", null);
    if (params.appId) {
      reviewsQuery = reviewsQuery.or(`app_id.eq.${params.appId},app_id.is.null`);
    }
    reviewsQuery = reviewsQuery.or(`queue_hash.eq.${queueHash},queue_hash.is.null`);
    const reviewsRes = await reviewsQuery;
    if (reviewsRes.error) {
      throw new Error(`reviews query failed: ${reviewsRes.error.message}`);
    }
    reviews = reviewsRes.data ?? [];
  }

  const keywords = (keywordsRes.data ?? []).map((row) => ({
    id: row.id,
    keyword: String(row.keyword ?? "").trim(),
    locale: normalizeLocale(row.locale),
    is_staged: Boolean(row.is_staged),
    queue_hash: row.queue_hash ?? null,
  }));

  if (keywords.length === 0) {
    const err = new Error(
      "ASO optimization requires staged keyword signals. Please add keywords to your Tracker first.",
    );
    err.code = "KEYWORD_CONTEXT_REQUIRED";
    throw err;
  }

  const signals = [
    ...keywords.map((row) => ({
      type: "keyword",
      id: row.id,
      label: row.keyword,
      locale: row.locale,
    })),
    ...marketSnapshots.map((row) => ({
      type: "market",
      id: row.id,
      label: String(row.keyword ?? "").trim(),
      locale: normalizeLocale(row.locale),
    })),
    ...reviews.map((row) => ({
      type: "review",
      id: row.id,
      label: String(row.review_text ?? "").trim().slice(0, 120),
      locale: vaultLocale,
    })),
  ];

  return {
    workspaceId: params.workspaceId,
    appId: params.appId ?? null,
    queueHash,
    vaultLocale,
    scope,
    signals,
    keywords,
    marketSnapshots,
    reviews,
  };
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  section("CONFIG");
  console.log({ workspaceId: WORKSPACE_ID, queueHash: QUEUE_HASH, supabaseUrl: url });

  section("1) DIRECT: .match({ workspace_id, queue_hash }) — exact hash only");
  const exactMatch = await supabase
    .from("workspace_keywords")
    .select("*")
    .match({ workspace_id: WORKSPACE_ID, queue_hash: QUEUE_HASH });
  console.log("error:", exactMatch.error?.message ?? null);
  console.log("count:", exactMatch.data?.length ?? 0);
  console.log("rows:", JSON.stringify(exactMatch.data, null, 2));

  section("2) DIRECT: all staged keywords for workspace (any queue_hash)");
  const stagedAll = await supabase
    .from("workspace_keywords")
    .select("id, keyword, locale, is_staged, queue_hash, app_id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("is_staged", true);
  console.log("error:", stagedAll.error?.message ?? null);
  console.log("count:", stagedAll.data?.length ?? 0);
  const hashBreakdown = {};
  for (const row of stagedAll.data ?? []) {
    const h = row.queue_hash ?? "(null)";
    hashBreakdown[h] = (hashBreakdown[h] ?? 0) + 1;
  }
  console.log("queue_hash breakdown:", hashBreakdown);
  console.log("sample:", JSON.stringify((stagedAll.data ?? []).slice(0, 5), null, 2));

  section("3) compileContext mirror — full scope, vaultLocale=en");
  try {
    const compiled = await compileContextMirror(supabase, {
      workspaceId: WORKSPACE_ID,
      queueHash: QUEUE_HASH,
      vaultLocale: "en",
      step: "full",
    });
    console.log("SUCCESS");
    console.log(JSON.stringify(compiled, null, 2));
  } catch (error) {
    console.log("FAILED:", error.code ?? error.message);
  }

  section("4) compileContext mirror — title scope (pipeline preflight), vaultLocale=en");
  try {
    const titleScope = await compileContextMirror(supabase, {
      workspaceId: WORKSPACE_ID,
      queueHash: QUEUE_HASH,
      vaultLocale: "en",
      step: "title",
    });
    console.log("SUCCESS — signals:", titleScope.signals.length);
    console.log(JSON.stringify(titleScope, null, 2));
  } catch (error) {
    console.log("FAILED:", error.code ?? error.message);
  }

  section("5) compileContext mirror — full scope, vaultLocale=ar");
  try {
    const ar = await compileContextMirror(supabase, {
      workspaceId: WORKSPACE_ID,
      queueHash: QUEUE_HASH,
      vaultLocale: "ar",
      step: "full",
    });
    console.log("SUCCESS — signals:", ar.signals.length);
  } catch (error) {
    console.log("FAILED:", error.code ?? error.message);
  }

  section("6) NOTE on trackedKeywordSignals: []");
  console.log(
    "compileContext feeds the Context Gateway audit gate. trackedKeywordSignals in logs",
  );
  console.log(
    "comes from the HTTP request body (optimization queue synthesis), NOT compileContext.",
  );
  console.log(
    "If compileContext finds keywords here but trackedKeywordSignals is empty,",
  );
  console.log(
    "the client is not sending trackedKeywordSignals / targetKeywords in the POST body.",
  );

  section("DONE");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
