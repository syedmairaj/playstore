/**
 * Context Gateway diagnostic — compares compileContext vs raw workspace_keywords rows.
 *
 * Usage (TypeScript — requires tsx):
 *   npx tsx --require ./scripts/register-server-only.cjs scripts/diagnose-context.ts
 *
 * Usage (no tsx — mirrors compileContext logic in plain Node):
 *   node scripts/diagnose-context.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  compileContext,
  compileContextForStep,
  KeywordContextRequiredError,
} from "@/lib/listing/context-gateway";

const WORKSPACE_ID = "e8408dba-a0d5-49ce-a88c-6759b01b2ff1";
const QUEUE_HASH =
  "22ae6c29370ff12f9c259342f5b3d66bbf5a885b7cda7834da08c9452ea62eaa";

function loadEnvFile(filename: string): void {
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function section(title: string): void {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

async function main(): Promise<void> {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  section("CONFIG");
  console.log({ workspaceId: WORKSPACE_ID, queueHash: QUEUE_HASH, supabaseUrl: url });

  section("1) DIRECT: workspace_keywords exact match (workspace_id + queue_hash)");
  const exactMatch = await supabase
    .from("workspace_keywords")
    .select("*")
    .match({ workspace_id: WORKSPACE_ID, queue_hash: QUEUE_HASH });

  console.log("error:", exactMatch.error?.message ?? null);
  console.log("count:", exactMatch.data?.length ?? 0);
  console.log("rows:", JSON.stringify(exactMatch.data, null, 2));

  section("2) DIRECT: workspace_keywords staged for workspace (all queue_hash values)");
  const stagedAll = await supabase
    .from("workspace_keywords")
    .select("id, keyword, locale, is_staged, queue_hash, app_id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("is_staged", true);

  console.log("error:", stagedAll.error?.message ?? null);
  console.log("count:", stagedAll.data?.length ?? 0);
  const hashBreakdown = new Map<string, number>();
  for (const row of stagedAll.data ?? []) {
    const h = (row.queue_hash as string | null) ?? "(null)";
    hashBreakdown.set(h, (hashBreakdown.get(h) ?? 0) + 1);
  }
  console.log("queue_hash breakdown:", Object.fromEntries(hashBreakdown));
  console.log(
    "sample (first 5):",
    JSON.stringify((stagedAll.data ?? []).slice(0, 5), null, 2),
  );

  section("3) DIRECT: compileContext-style filter (staged + locale=en + queue_hash OR null)");
  const gatewayStyle = await supabase
    .from("workspace_keywords")
    .select("id, keyword, locale, is_staged, queue_hash, app_id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("is_staged", true)
    .eq("locale", "en")
    .or(`queue_hash.eq.${QUEUE_HASH},queue_hash.is.null`);

  console.log("error:", gatewayStyle.error?.message ?? null);
  console.log("count:", gatewayStyle.data?.length ?? 0);
  console.log(
    "sample (first 5):",
    JSON.stringify((gatewayStyle.data ?? []).slice(0, 5), null, 2),
  );

  section("4) compileContext() — full scope, vaultLocale=en");
  try {
    const compiled = await compileContext(supabase, {
      workspaceId: WORKSPACE_ID,
      queueHash: QUEUE_HASH,
      vaultLocale: "en",
    });
    console.log("SUCCESS");
    console.log(
      JSON.stringify(
        {
          signalCount: compiled.signals.length,
          keywordCount: compiled.keywords.length,
          marketCount: compiled.marketSnapshots.length,
          reviewCount: compiled.reviews.length,
          keywords: compiled.keywords.map((k) => ({
            keyword: k.keyword,
            locale: k.locale,
            queue_hash: k.queue_hash,
          })),
          signals: compiled.signals,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof KeywordContextRequiredError) {
      console.log("FAILED: KeywordContextRequiredError — zero keywords after gateway filters");
      console.log(error.message);
    } else {
      console.log("FAILED:", error);
    }
  }

  section("5) compileContextForStep() — title scope (keywords only)");
  try {
    const titleScope = await compileContextForStep(supabase, {
      workspaceId: WORKSPACE_ID,
      queueHash: QUEUE_HASH,
      vaultLocale: "en",
      step: "title",
    });
    console.log("SUCCESS — keyword signals:", titleScope.signals.length);
    console.log(JSON.stringify(titleScope, null, 2));
  } catch (error) {
    console.log("FAILED:", error);
  }

  section("6) compileContext — vaultLocale=ar (EN/AR branch check)");
  try {
    const compiledAr = await compileContext(supabase, {
      workspaceId: WORKSPACE_ID,
      queueHash: QUEUE_HASH,
      vaultLocale: "ar",
    });
    console.log("SUCCESS — signals:", compiledAr.signals.length);
  } catch (error) {
    console.log("FAILED:", error instanceof Error ? error.message : error);
  }

  section("DONE");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
