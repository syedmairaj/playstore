# API

## Core Endpoints
- POST /auth/login
- POST /auth/register
- GET /workspaces
- POST /workspaces
- GET /apps
- POST /apps
- GET /keywords
- POST /keywords/track
- GET /workspaces/:workspaceId/competitors (Competitor Spy — persisted analyses)
- POST /workspaces/:workspaceId/competitors (Competitor Spy — upsert after analyze)
- DELETE /workspaces/:workspaceId/competitors/:competitorId (Competitor Spy — remove saved analysis)
- GET /reviews
- GET /listings
- POST /listings/generate
- POST /listings/optimizer-autofill
- POST /apps/suggest
- GET /scores
- GET /alerts

### GET /api/workspaces

Lists workspaces the current user belongs to (RLS). **401** if not signed in.

### POST /api/workspaces

Creates a workspace, adds the caller as **owner** (trigger), inserts the default **Primary Google Play app**, sets `profiles.onboarding_completed_at`.

**Body:** `{ "name": string }` (2–80 chars).

### GET /api/workspaces/:workspaceId/keywords

Returns keywords plus `ranks` (chronological, capped) and `latest` snapshot (primary **`keywords.market`** only). Rank rows may include **`country_code`** when snapshots are tagged. Each keyword may include **`trackedCountryCodes`** (distinct snapshot markets) and **`lastSyncedAt`** (max **`snapshot_at`** across all snapshots) for the table UI. **403** if not a member.

- **Query:** `appId` (optional workspace app uuid) — when set, only keywords for that app are returned. Omits or invalid values return all apps (same as listing the full workspace set).

### POST /api/workspaces/:workspaceId/keywords

**Body:** `{ "term": string, "market"?: string, "locale"?: string, "appId"?: uuid }` — creates a tracked keyword for Google Play ASO.

- **409** — duplicate normalized term for the same workspace **app** + **market** (`duplicate_keyword`).
- New keywords start **without** rank snapshots until the user persists a live preview via **`serper-save`** or uses **Refresh ranks** on a row.

### POST /api/workspaces/:workspaceId/keywords/serper-save

**Body:** `{ "term": string, "appId": uuid, "keywordId"?: uuid, "countries": ("us"|"sa"|"ae"|"in"|"cn")[], "results": SerperPreviewCountry[], "primaryCountry"?: same }` — persists **`keyword_rank_snapshots`** rows (`source = serper`, one row per entry in **`countries`**, each with matching **`country_code`**, `snapshot_at` set server-side) from the **last** client preview payload obtained via **`POST /api/serper/play-store-search`** (no additional Serper call; **no extra AI credit** on this route—preview was already charged). The keyword’s primary **`keywords.market`** is **`countries[0]`** after the server optionally moves **`primaryCountry`** to the front when it is included in **`countries`** (so the UI’s first selected market wins over preview block order). Every listed code must appear in **`results`**. Optional **`keywordId`** must belong to the workspace + **`appId`** and match **`term`** (add-then-save flow). Creates the keyword row if none exists for that app + term when **`keywordId`** is omitted. Requires the app’s **`package_name`** to resolve rank from organic results. **`results`** are validated (bounded strings, item counts, max **4** countries).

### POST /api/workspaces/:workspaceId/keywords/:keywordId/serper-refresh

Re-runs Serper for the keyword’s term (**`num: 100`** per country for a deep organic slice; preview remains **`num: 20`**). Uses **`deepRankSearch`** (mobile Serper, 50 results × 2 pages). When Serper returns fewer than **15** Play apps for a country, the server supplements with native **Google Play Store search** (`google-play-scraper`) so broad keywords (e.g. `run`) still resolve ranks from the real Play listing order. **Countries:** distinct **`country_code`** values on existing **`keyword_rank_snapshots`** for that keyword (when any exist); otherwise supported codes from **`apps.target_countries`**, or **`keywords.market`** when none match. Debits **`serper_preview_per_country` × country count** (wallet pattern; same per-country rate as other Serper-backed refresh flows; depth does not multiply credits), refunds on hard failure before snapshots are stored. Inserts **`keyword_rank_snapshots`** with `source = serper`. Ranks resolve by matching **`apps.package_name`** to Play details URLs / extracted package ids (not app titles). **503** when `SERPER_API_KEY` is missing; **400** `no_package_name` when the app has no Android id.

### POST /api/workspaces/:workspaceId/keywords/bulk

**Body:** `{ "terms": string[], "appId": uuid, "listingGenerationId": uuid, "market"?: string, "locale"?: string }` — bulk-adds keywords suggested by an AI listing run for Keyword Tracker.

- Verifies workspace membership, **app** belongs to workspace, and **listing_generation** belongs to the workspace (optional **`app_id`** on the generation must match **`appId`** when set).
- Dedupes against existing tracked terms for that app + market; skips duplicates.
- Sets **`keywords.source = 'ai_listing'`** and **`listing_generation_id`** on inserted rows (no automatic rank snapshots; use Serper preview + save or per-row refresh).
- **No AI credits** are charged for this insert path.

### GET /api/workspaces/:workspaceId/keywords/:keywordId

Returns a single keyword for the workspace with **`ranks`** (chronological ascending, up to 500 rows) and **`latest`** snapshot. Each rank row may include **`country_code`** (lowercase alpha-2 when tagged, or `null` for legacy rows) and **`best_rank`**. **`regionalRanks`** lists all tagged snapshots across markets for that keyword (same cap, ascending by time) for multi-line regional charts; omitted or empty when no per-country rows exist. Response may include **`trackedCountryCodes`** and **`lastSyncedAt`** (same semantics as the list endpoint). **401** / **403** same as list keywords; **404** if the keyword is missing from the workspace.

### DELETE /api/workspaces/:workspaceId/keywords/:keywordId

Deletes the keyword when it belongs to the workspace (**403** if not a member, **404** if not found). Cascades `keyword_rank_snapshots`.

### POST /api/workspaces/:workspaceId/keywords/:keywordId/ranks

**Body:** `{ "rank": number | null, "source"?: string }` — appends a rank snapshot; may create **workspace_alerts** when thresholds are crossed.

### GET /api/workspaces/:workspaceId/alerts

Query `?unread=1` filters to `read_at IS NULL`.

### PATCH /api/workspaces/:workspaceId/alerts

**Body:** `{ "alertIds": uuid[] }` — sets `read_at` for those alerts in the workspace.

### PATCH /api/workspaces/:workspaceId

**Body:** `{ "name"?: string, "onboarding_state"?: object, "plan"?: "starter"|"pro"|"agency" }` — owner/admin; **plan** changes restricted to **owner** in the API handler.

### DELETE /api/workspaces/:workspaceId

Deletes the workspace (**owner** only). Cascades related rows.

### GET /api/workspaces/:workspaceId/apps

Lists apps in the workspace (`id`, `name`, `metadata`, and `icon_url` when the column exists).

### POST /api/workspaces/:workspaceId/apps

Creates an app when the workspace is under its plan app limit.

**Body (JSON)**

- `name` (string, required, 1–120 chars) — display name.
- `package_name` (string, optional) — Android application id; must match reverse-DNS rules when provided (e.g. `com.example.myapp`).
- `metadata` (object, optional) — JSON bag stored on the row:
  - `category` (string, optional, ≤120)
  - `short_description` (string, optional, ≤500)
  - `icon_url` (string, optional, ≤2000, must be `http`/`https`)

**201 response**

```json
{
  "ok": true,
  "app": {
    "id": "uuid",
    "name": "…",
    "package_name": "com.example.app",
    "play_store_url": null,
    "target_countries": ["US"],
    "metadata": { "category": "Productivity" },
    "icon_url": "https://…",
    "created_at": "…"
  }
}
```

**Errors**

- `400` — validation (invalid package or metadata).
- `401` / `403` — same as other workspace routes; `403` with `plan_app_limit` when at app slot limit.

### POST /api/apps/suggest

AI suggestion for **one** add-app form field (`app_name` or `short_description`). Uses **`add_app_field_suggest`** credits from `lib/features/billing/credit-costs.ts` (default **3**). The handler reads `ai_credits_remaining` (no mutation), then calls `consume_workspace_ai_credits` **before** Gemini (row-locked debit); on generation failure it calls `refund_workspace_ai_credits`, so the **net charge matches a successful suggestion**.

**Request JSON**

- `workspaceId` (uuid, required) — workspace the user belongs to.
- `field` (`"app_name"` | `"short_description"`).
- `context` (object, optional fields): `appName`, `category`, `packageName`, `shortDescriptionHint` — all strings, trimmed server-side; used to build the ASO-oriented prompt.

**200 response**

```json
{
  "ok": true,
  "data": { "text": "…", "field": "app_name" },
  "meta": {
    "model": "gemini-2.5-flash",
    "creditsCharged": 3,
    "creditsRemaining": 42
  }
}
```

**Errors**

Same pattern as `POST /api/listings/optimizer-autofill`: `400` validation, `401` unauthorized, `403` forbidden, `402` insufficient credits, `429` rate limit (key `add_app_field_suggest:<user_id>`), `500` / `503` generation or config.

### POST /api/workspaces/:workspaceId/reviews/:reviewId/draft-reply

AI draft of a public Play Store developer reply for one review (Reviews dashboard). Uses **`reviews_ai_reply`** credits from `lib/features/billing/credit-costs.ts` (default **1**). Debits **before** Gemini; refunds on generation failure.

**Request JSON**

- `reviewText` (string, required) — review body (max 8000 chars).
- `rating` (integer 1–5, required).
- `replyLanguage` (`"en"` | `"ar"` | `"hi"`, required) — output language (typically derived from review locale: `us-en` → `en`, `ae-ar` → `ar`, `in-hi` → `hi`).
- `appName`, `userName` (optional strings) — context for the prompt.

**200 response**

```json
{
  "ok": true,
  "data": { "reply": "…", "reviewId": "…" },
  "meta": {
    "model": "gemini-2.5-flash",
    "creditsCharged": 1,
    "creditsRemaining": 41
  }
}
```

**Errors:** `400` validation, `401` / `403`, `402` insufficient credits, `429` rate limit (`reviews_ai_reply:<user_id>`), `500` / `503` generation or config.

### POST /api/workspaces/:workspaceId/reviews/:reviewId/reply

Generates (or accepts) a developer reply and optionally **publishes** it to Google Play. Uses **`reviews_ai_reply`** credits (default **1**). Debits **before** Gemini; refunds on generation failure or when Play publish is attempted and fails (not when publish is skipped for missing credentials).

**Request JSON** — same fields as `draft-reply`, plus:

- `replyText` (optional) — when set, skips Gemini and uses this text.
- `packageName` (optional) — Android app id for publish; or pass `appId` (workspace app uuid) to resolve `apps.package_name`.
- `appId` (optional uuid) — workspace app used to resolve `package_name`.

**200 response**

```json
{
  "ok": true,
  "data": {
    "reply": "…",
    "reviewId": "gp:…",
    "published": false,
    "publishSkipped": true,
    "publishSkipReason": "no_google_play_credentials"
  },
  "meta": { "model": "gemini-2.5-flash", "creditsCharged": 1, "creditsRemaining": 40 }
}
```

`publishSkipReason` may be `no_google_play_credentials` (stub — reply still returned), `no_package_name`, or omitted when `published` is true.

**Play Console publish env (server)** — at least one of:

- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — service account JSON string (Play Console API access).
- `GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64` — same JSON, base64-encoded.
- `GOOGLE_APPLICATION_CREDENTIALS` — path to a service account key file (ADC).

Service account must be invited in Play Console with permission to reply to reviews. Scope: `https://www.googleapis.com/auth/androidpublisher`.

**Errors:** same as `draft-reply`, plus `502` `publish_error` when credentials exist but Android Publisher `reviews.reply` fails.

### GET|POST /api/workspaces/:workspaceId/listing-improvements

Persists review rows queued for the **AI Listing Optimizer** (Reviews dashboard “Add to listing”). **No AI credits.**

**POST body:** `{ reviewId, reviewText, userName, score (1–5), sentimentTag?, appId?, packageName? }` — requires **`appId` or `packageName`**; upserts on `(workspace_id, review_id)` and resets `is_utilized` to false.

**GET query:** `?unutilized=1` — only rows with `is_utilized = false` (for optimizer consumption and Reviews UI state).

**200:** POST `{ ok: true }`; GET `{ ok: true, items: [{ id, reviewId, reviewText, userName, score, sentimentTag, appId, packageName, isUtilized, createdAt }] }`.

**Errors:** `400` validation, `401` / `403`, `404` app not found, `503` `schema_unavailable` when migration not applied.

### GET|POST /api/workspaces/:workspaceId/reviews/sync

Fetches public Play Store reviews via `google-play-scraper` for a workspace app’s `package_name` and store country (from query/body or first `apps.target_countries`, default `us`). **No AI credits.** Does not persist yet (no `reviews` table in live schema) — returns `data.reviews` for client-side replacement of demo data.

**POST body / GET query:** `appId` (uuid, required), `num` (optional, 1–200, default 100), `country` (optional 2-letter), `lang` (optional).

**200 response:** `{ ok, data: { reviews, appId, packageName, country, persisted: false }, meta: { count } }`.

**Errors:** `400` `no_package_name`, `404` app not found, `401` / `403`.

### PATCH /api/workspaces/:workspaceId/apps/:appId

**Body:** fields from `patchAppSchema` — updates `name`, `package_name`, optional **`canonical_package_id`** (production Play Store id for live Serper rank lookups), `play_store_url`, `target_countries`, and optional **`icon_url`**. When `icon_url` is sent, the server writes **`apps.icon_url`** (nullable) and mirrors the same value into **`apps.metadata.icon_url`** for backward compatibility. Clearing `icon_url` removes it from both places when supported by the payload.

### POST /api/workspaces/:workspaceId/onboarding/complete

Marks onboarding finished (`onboarding_state.completed`) and sets `profiles.onboarding_completed_at`.

### GET/POST /api/workspaces/:workspaceId/invitations

**POST body:** `{ "email": string, "role": "admin" | "member" }` — owner/admin only.

### PATCH /api/profile

**Body:** `{ "display_name"?: string, "notification_preferences"?: object }` — authenticated user’s own profile.

### POST /api/listings/generate (Phase 1 MVP)

Next.js route implementing `POST /listings/generate`. Requires **signed-in user**, **Gemini**, **Supabase user client** (RLS) for persistence, and **service role** only for rate-limit RPC + `usage_logs`. **Workspace handshake:** body **`workspaceId`** (required) must match optional header **`X-Workspace-Id`**; the orchestrator verifies membership before any model call. On failure returns **409** `workspace_handshake_failed` with **`refreshWorkspace: true`** — the client should call `refreshWorkspaceContext()` (Keyword Tracker + billing usage) before re-enabling Generate. Uses **`listing_generation`** credits from `lib/features/billing/credit-costs.ts` (default **5** per run, including regenerate with `userInstruction`). The handler reads `ai_credits_remaining` (no mutation), then calls `consume_workspace_ai_credits` **before** Gemini; on generation failure it calls `refund_workspace_ai_credits`, so the **net charge matches a successful listing payload** returned to the client. Persisted rows store `listing_generations.credits_ledger_id` when insert succeeds. Optional body **`appId`** (workspace app uuid) is saved on **`listing_generations.app_id`** so Keyword Tracker can load “latest AI listing” keywords per app; success **`meta.generationId`** returns the new row id when persistence succeeds, with **`meta.savedAt`** (ISO timestamp from `listing_generations.created_at`) and **`meta.persisted`** (boolean). When ASO score JSON fails validation but listing copy succeeds, **`meta.asoScorePartial`** is set so the UI can show a localized notice; persisted `output_json` may include **`asoScoreDegraded: true`** without numeric score fields.

**Modular pipeline billing:** intermediate steps (`title`, `short`, `long` first generate) are free. **`isRegenerate: true`** on modular block steps triggers server-side `consume_modular_listing_regenerate` **after** successful generation and validation (first **3** per workspace free via `workspaces.trial_regenerations_used`, then **1** credit each). **`finalize`** debits **`listing_generation`** (**5**) credits before generation (refunded on hard failure). Short-step output must validate as `{ variations: [{ type: "growth"|"conversion"|"utility", text: string }] }` × 3 — validation failures return **400** with `fieldErrors` and do not debit credits or consume trial slots. **Long step** uses the ASO Industry Standard pipeline: stylistic prompts (no character-count constraints), `safeAssemble` (hook/closing truncate + `ASO_BOILERPLATE_FOOTER` pad), top **5** pruned context signals, **8s** budget. Length issues return **warnings** — never **500**. Optimizer synthesis is pruned to ≤5,000 characters (EN/AR).

**Request JSON**

- `workspaceId` (uuid, required) — must be a workspace the user belongs to.
- `appName` (string, required)
- `category` (string, required)
- `targetKeywords` (string[] or comma-separated string, required, max 40 terms)
- `appFeatures` (string, required)
- `toneStyle` (enum: `professional` | `friendly` | `bold` | `minimal`)
- `targetArabic` (boolean, optional) — when true, the model returns Arabic store strings.
- `userInstruction` (string, optional, trimmed, max 2000) — appended to the prompt for on-demand refinements (e.g. regenerate with a different tone); same credits and rate limits as a normal run.

**200 response**

```json
{
  "ok": true,
  "data": {
    "title": "…",
    "shortDescription": "…",
    "fullDescription": "…",
    "keywordSuggestions": ["…"],
    "ctaSuggestions": ["…"],
    "asoScore": 92,
    "scoreBreakdown": {
      "title": 28,
      "shortDescription": 17,
      "longDescription": 37,
      "persuasiveness": 10
    },
    "improvementTips": ["…", "…"],
    "orchestration": {
      "protocolVersion": "1.0",
      "modules": {
        "anchor": { "moduleId": "anchor", "title": "…", "keywordAnchor": "…", "lockedKeywords": ["…"], "aiSuggestedKeywords": ["…"] },
        "conversion": { "moduleId": "conversion", "activeStrategyProfile": "defensive", "selectedVariationId": "primary", "shortVariations": [] },
        "expansion": { "moduleId": "expansion", "keywordAnchor": "…", "blocks": { "hook": {}, "features": {}, "trustClosing": {} }, "assembledFullDescription": "…" }
      }
    }
  },
  "meta": {
    "model": "gemini-2.5-flash",
    "promptVersion": "listing-optimizer-v16.0",
    "persisted": true,
    "generationId": "uuid",
    "savedAt": "2026-05-13T12:00:00.000Z"
  }
}
```

Optional **`meta.asoScorePartial`** (boolean, when `true`) means listing copy was validated but the certified ASO score block was dropped after validation.

Optional **`data.orchestration`** (v16+) — discrete three-phase modules (`anchor`, `conversion`, `expansion`) for independent UI display and per-module regenerate; root `title` / `shortDescription` / `fullDescription` are synced from the active modules server-side. Schema: `lib/listing/orchestration-protocol.schema.ts`.

**Modular generation (`generationStep`)** — Request body may include `generationStep`: `pipeline` | `title` | `short` | `long` | `hook` | `features` | `closing` | `finalize` | `full` (default `full`). **`pipeline`** is the **required entry** for initial modular generation — it runs a serialized worker orchestration (`title` → `short` → `long`) via **Upstash QStash** (not inline in the producer route). Individual `title` / `short` / `long` steps are only accepted when `isRegenerate: true`. **Step-scoped context (token-optimized):** `title` and `short` compile **top 5 keywords** only; `long` / `full` / `finalize` compile **top 5 keywords + 2 competitor (market) signals**. **`modular_phase_order_conflict` (409)** when downstream steps arrive before prior phases are persisted in `workspace_listing_drafts`. **`modular_pipeline_required` (409)** when the client attempts out-of-order step calls without `pipeline` or `isRegenerate`. **`generation_in_progress` (429)** when a Redis lock is held for the same `(workspaceId, queueHash)`.

**Async queue (QStash)** — Non-draft `POST /api/listings/generate` requests are **producers**: validate auth/credits, acquire the `(workspaceId, queueHash)` Redis lock, upsert `workspace_listing_drafts` with `generation_status: pending`, publish to **`POST /api/listings/worker`**, and return **`202 Accepted`** with `{ ok, accepted: true, jobId, status, queueHash, workspaceId }`. The browser client polls **`GET /api/listings/status?jobId=`** until `completed` or `failed`. **`isDraft: true`** remains synchronous on the producer route. Env: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `QSTASH_CALLBACK_URL` (or `NEXT_PUBLIC_APP_URL` / `VERCEL_URL`). Local dev without QStash: set `INTERNAL_WORKER_SECRET` — the producer fire-and-forgets an unsigned worker POST.

**Job lifecycle (`workspace_listing_drafts`)** — `generation_status`: `pending` → `processing` → `completed` | `failed`; `current_phase`: `title` | `short` | `long` | `full`; `generation_error` on failure; `generation_payload` / `generation_result` jsonb. Worker releases the Redis queue lock in `finally` so retries are allowed after failure.

**Context gate (ASO standard)** — Before AI generation (except `isDraft`), **`syncQueueHash`** + **`stampAndCompileListingContext`** atomically stamp `workspace_keywords.queue_hash` for the active app + optimization hash (EN/AR via `vaultLocale`), then **`compileContextForStep()`** loads staged signals. Logs `[Context Audit] Stamped keywords to queueHash:` and `[Context Audit] Signals found: N`. Hydrated keywords merge into `trackedKeywordSignals` before modular step signals. When no staged keywords exist, returns **400** with `{ "error": "KEYWORD_CONTEXT_REQUIRED", ... }`.

**`includeOptimizerContext`** — Modular client always sends `true` with sanitized `activeContext` + `trackedKeywordSignals`. The LLM system prompt includes the request **`queueHash`** synthesis anchor (`synthesisQueueHash` on server input).

**`meta.isSignalEnhanced`** — `true` when staged Keyword Tracker / Active Context signals were applied.

**`meta.draftPersisted` / `meta.draftUpdatedAt`** — Set when the step successfully upserted `workspace_listing_drafts`. The Listing Optimizer gates **Finalize** until title, short, and long phases are generated **and** persisted.

**Pre-flight:** after Zod validation and workspace handshake, the handler validates **`queueHash`** against the active Keyword Tracker vault **before** rate limits, idempotency locks, or credits — **except** for `isDraft` preview requests. Structured preflight log: `listing_generate_preflight` JSON with signal count + keywords. Sparse Review/Market/Competitor context with tracker keywords present yields warning **`context_gap`** and a reduced **`warnings.healthScore`** (Listing Health panel).

**Client timeout** — modular browser clients POST the producer, then poll job status for up to **300s** (600s when `skipTimeout`). Legacy **120s** abort applies only to the initial POST handshake.

**Platform duration** — `export const maxDuration = 60` on `POST /api/listings/generate` (producer). `POST /api/listings/worker` uses **`maxDuration = 300`** for Gemini orchestration.

**Client retries** — browser clients (`modular-listing-generate-client`, `generate-optimized-listing`) use exponential backoff (3 attempts, 1s base) on **500/502/503/504** to reduce failures from latent LLM gateways.

**Instant Draft (`isDraft: true`)** — Skips Redis, vault synthesis, and credit debit. Returns a deterministic **Core ASO Template** listing in &lt; 3s for UI preview on Listing Optimizer load. The UI calls this automatically when app identity fields are present.

**Optimized pipeline (`USE_OPTIMIZED_PIPELINE=true`)** — Background `signal-compressor` writes a 5-point **Context Package** to Redis (`ctxpkg:v1:{workspaceId}:{locale}:{appId}`) when queue signals change. **Finalize** reads **only** this pre-computed key (never raw vault). Toggle env off to revert to legacy vault fetch. Manual recompress: `POST /api/workspaces/:workspaceId/context-package/recompress`.

**Errors**

- `400` — `validation_error`, invalid JSON (`bad_request`), **`KEYWORD_CONTEXT_REQUIRED`** when Context Gateway finds zero staged keywords in `workspace_keywords`, **`missing_keyword_context`** when orchestrator preflight finds zero tracker signals.
- `401` — `unauthorized` when session missing.
- `402` — `insufficient_credits` when the workspace balance is below **`listing_generation`** cost (from pre-read and/or `consume_workspace_ai_credits`).
- `403` — `forbidden` when `workspaceId` is not accessible.
- `409` — **`vault_queue_hash_mismatch`** when client `queueHash` does not match server vault; refresh Keyword Tracker and retry. **`workspace_handshake_failed`** when body/header workspace ids disagree or membership is stale (`refreshWorkspace: true`). **`context_package_unavailable`** when optimized pipeline is on and Redis Context Package is missing at finalize. **`modular_phase_order_conflict`** when the **worker** execute path detects missing persisted phases after a write (internal consistency). **`modular_pipeline_required`** when individual modular steps are sent without `generationStep: pipeline` or `isRegenerate: true`. Downstream steps blocked while the worker is still running return **`202 WAITING_FOR_PHASES`** on the producer — not `409`.
- `422` — `invalid_model_output` when Gemini JSON fails schema validation after server-side length clamping (rare); client may retry with stricter instructions. **`context_serialization_failed`** when optimizer context exceeds safe serialization limits.
- `429` — `rate_limited` (per **user** per minute; see `RATE_LIMIT_MAX`). **`generation_in_progress`** when the same `(workspaceId, queueHash)` already has an in-flight generation (Redis lock, 300s TTL). **`duplicate_request`** when the workspace idempotency lock (4s) is held.
- `500` — `generation_error` (e.g. model or parse failure).
- `202` — **`accepted`** async job enqueued (`jobId`, `status: pending`). **`WAITING_FOR_PHASES`** when prerequisite phases are not persisted yet — producer read check only; body `{ status: "pending", message: "Pipeline phases are still processing", code: "WAITING_FOR_PHASES", jobId?, missingPhases? }` (not a 500). Worker uses `executionMode: "execute"`; producer uses `executionMode: "read"` on the orchestrator before enqueue.
- `503` — `config` when Supabase or Gemini is not configured; **`queue_publish_failed`** when QStash publish fails.

### POST /api/listings/worker

**Auth:** QStash signature (`upstash-signature`) or `X-Internal-Worker-Secret` (local dev).

**Body:** `{ "jobId": "uuid" }`

Runs `runListingGenerationWorkerJob` — loads `generation_payload`, sets `processing`, executes `runListingGenerationOrchestrator` (serialized `title` → `short` → `long` for `pipeline`; `full` / `finalize` as single phases), debits credits post-success, stores `generation_result`, releases Redis lock on completion or failure.

**200:** `{ ok: true, jobId }` — **500** `{ ok: false, error: { code: "worker_failed", message } }` (job row already marked `failed`).

### GET /api/listings/status

**Auth:** Signed-in workspace member.

**Query:** `jobId` (uuid, required)

**200:**

```json
{
  "ok": true,
  "jobId": "uuid",
  "workspaceId": "uuid",
  "queueHash": "…",
  "status": "processing",
  "currentPhase": "short",
  "phases": { "title": true, "short": false, "long": false, "full": false },
  "error": null,
  "result": null,
  "draftUpdatedAt": "2026-06-22T12:00:00.000Z"
}
```

When `status` is `completed`, `result` contains the same shape the synchronous route returned (`generationStep`, `modularData` / `data`, `meta`).

### GET /api/listings/draft

Rehydrate a modular listing draft from **`workspace_listing_drafts`** for the active optimization queue hash (EN/AR vault branches).

**Query:** `workspaceId` (uuid, required), `queueHash` (64-char hex, required), `appId` (uuid, optional — scopes row lookup), `vaultLocale` (`en` | `ar`, optional — EN/AR vault branch)

**200 response**

```json
{
  "ok": true,
  "draft": {
    "id": "uuid-or-null",
    "workspaceId": "uuid",
    "appId": "uuid-or-null",
    "vaultLocale": "en",
    "queueHash": "…",
    "modularState": { "title": {}, "shortDescription": {}, "longDescription": {} },
    "editedTitle": "…",
    "editedShort": "…",
    "editedLong": "…",
    "modularDraftReady": true,
    "updatedAt": "2026-06-21T12:00:00.000Z",
    "isEmpty": false,
    "persistedPhases": { "title": true, "short": true, "long": false }
  }
}
```

When no row exists, `draft.isEmpty` is `true`, `id` and `updatedAt` are `null`, and `modularDraftReady` is `false` — the client always receives a defined object (never `null`). Server logs `[Persistence Audit] Draft rehydrated from DB for queueHash:` when a row is found. Client helper: `fetchDraftState(workspaceId, queueHash, { appId?, vaultLocale? })` in `lib/client/fetch-listing-draft-client.ts`.

**Upsert-on-generate:** each successful modular `POST /api/listings/generate` step upserts `workspace_listing_drafts` on `(workspace_id, queue_hash)`, patching phase columns (`title`, `short_description`, `long_description`) and merging `modular_listing`. Writes refresh `updated_at` via DB trigger.

### POST /api/listings/optimizer-autofill

AI-assisted fill for a **single** optimizer field (keywords or features). Uses **`listing_optimizer_autofill`** credits from `lib/features/billing/credit-costs.ts` (default **3** per request). The handler reads `ai_credits_remaining` (no mutation), then calls `consume_workspace_ai_credits` **before** Gemini; on generation failure it calls `refund_workspace_ai_credits`, so the **net charge matches successful autofill text**.

**Request JSON**

- `workspaceId` (uuid, required) — workspace the user belongs to.
- `appName` (string, required, trimmed, max 200)
- `category` (string, required, trimmed, max 120)
- `field` (`"keywords"` | `"features"`)
- `language` (`"en"` | `"ar"`, optional, default `"en"`) — UI locale so Gemini prefers English or Arabic when the autofill prompt supports both.
- `appId` (uuid, optional) — when set (and valid for the workspace), the API **updates or inserts** `listing_generations` for that app so target keywords / features survive refresh (inputs-only rows may have **`output_json` null** until a full listing run).
- `toneStyle`, `keywordsDraft`, `featuresDraft` — optional; used with `appId` to merge the LLM result with the other draft field when persisting inputs.

**200 response**

```json
{
  "ok": true,
  "data": { "text": "…", "field": "keywords" },
  "meta": {
    "model": "gemini-2.5-flash",
    "creditsCharged": 3,
    "creditsRemaining": 42,
    "persistedInputs": true
  }
}
```

For `field: "keywords"`, `text` is **comma-separated** keywords (normalized server-side). Success `meta` includes **`creditsCharged`** (same as `listing_optimizer_autofill` in `credit-costs.ts`) and **`creditsRemaining`**: workspace AI credit balance **after** the debit (so the client can show “credits used • remaining” without an extra fetch). When inputs were written to `listing_generations`, **`persistedInputs`** is true.

**Errors**

Same pattern as `POST /api/listings/generate`: `400` validation, `401` unauthorized, `403` forbidden, `402` insufficient credits (`insufficient_credits` + `remaining` / `required`), `429` rate limit (key `listing_optimizer_autofill:<user_id>`), `500` / `503` generation or config.

### AI workspace credits (summary)

`POST /api/listings/generate`, `POST /api/listings/optimizer-autofill`, and `POST /api/apps/suggest` read `workspaces.ai_credits_remaining` (RLS, non-mutating) when a debit applies, then **`consume_workspace_ai_credits`** (locked debit) **before** the external call, then **`refund_workspace_ai_credits`** on hard failure so **net balance aligns with success**. Costs are centralized in `lib/features/billing/credit-costs.ts` (`listing_generation` **5**, `listing_optimizer_autofill` **3**, `add_app_field_suggest` **3**). **Serper / Keyword Tracker:** `POST /api/serper/play-store-search` debits **`serper_preview_per_country` × number of countries** by default (Keyword Tracker live preview; same wallet + refund-on-throw pattern as refresh, **before** calling Serper). When the body includes **`pricingProfile: "competitor_spy"`** (with **`restrictToPlayStore: true`**), the route uses the Competitor Spy bundle instead (**5** credits for up to **2** countries, then **+2** per additional country) via `competitorSpyAiCreditsForCountryCount` in `lib/keywords/keyword-track-ai-pricing.ts`. **`POST …/keywords/serper-save`** does **not** debit; **`POST …/keywords/:keywordId/serper-refresh`** debits **`serper_preview_per_country` × country count** (default **1** per market). A debit-only-after-success pattern without a reservation RPC would not be concurrency-safe against unpaid parallel model calls; see `lib/features/billing/wallet.ts`.

### GET /api/workspaces/:workspaceId/listings/localize

**Auth:** Workspace member.

Returns persisted localized listing copy for one workspace app.

- **Query:** `appId` (uuid, required) — workspace app row.
- **200:** `{ "ok": true, "markets": [ { "market": "ae"|"in"|"mx", "label", "rtl", "title", "shortDescription", "longDescription", "keywords": string[], "updatedAt": iso } ] }`. Empty array when none saved. If the table is not migrated yet, returns `{ "ok": true, "markets": [] }`.
- **400** — missing/invalid `appId`. **401** / **403** as other workspace routes.

### POST /api/workspaces/:workspaceId/listings/localize

**Auth:** Workspace member. Uses **`localization`** credits from `lib/features/billing/credit-costs.ts` (**per market** in the request). Debits before Gemini; refunds on hard HTTP failure.

**Body:** `{ "appId"?: uuid, "title", "shortDescription", "longDescription"?, "keywords": string[], "markets": ("ae"|"in"|"mx")[], "isReGeneration"?: boolean }` — source listing fields (Play limits enforced in prompts) and one or more target markets. When **`appId`** is set and belongs to the workspace, each successful market is **upserted** into **`workspace_localized_listings`**. Set **`isReGeneration`: true** when re-running copy for an existing saved market (same debit; clearer ledger description).

**200:** `{ "ok": true, "results": [ …same shape as GET markets… ], "creditsUsed": number, "persisted": boolean, "failures"?: [ { "market", "code": "localization_failed", "message" } ] }` — partial success returns `results` for markets that succeeded plus optional `failures`.

**Errors:** `402` insufficient credits, `422` validation, `502` when all markets fail or Gemini HTTP error (full refund on HTTP error).

### DELETE /api/workspaces/:workspaceId/listings/localize

**Auth:** Workspace member.

Removes one persisted localized listing row for a workspace app.

- **Query:** `appId` (uuid, required), `market` (`ae` \| `in` \| `mx`, required).
- **200:** `{ "ok": true, "market": "ae"|"in"|"mx" }`.
- **400** — missing/invalid `appId` or `market`, or `appId` not in workspace. **401** / **403** as other workspace routes. **404** when no row exists. **503** `schema_unavailable` when migration missing.

### GET /api/workspaces/:workspaceId/competitors

**Auth:** Workspace member.

Returns saved Competitor Spy analyses for the workspace (newest first, capped at 40). Each row includes normalized insight fields (`topKeywords`, `shared`, `gaps`, `quickWinPlans`, `quickWinTerms`) plus optional `previewResults` embedded in `analysis_json` for sticky snapshot / live rank on reload.

**200:** `{ "ok": true, "competitors": [ … ] }`. If the table is not migrated yet: `{ "ok": true, "competitors": [], "unavailable": true }`.

### POST /api/workspaces/:workspaceId/competitors

**Auth:** Workspace member.

**Body:** `{ "query", "displayName", "packageId", "countries": string[], "category"?, "iconUrl"?, "analysis": { "query", "topKeywords", "shared", "quickWinPlans", "quickWinTerms", "gaps", "previewResults"? } }` — upserts on `(workspace_id, competitor_package_id)` (package id normalized lowercase). Sets `analyzed_at` server-side.

**200:** `{ "ok": true, "id": uuid, "analyzedAt": iso }`. **503** `schema_unavailable` when migration missing.

### DELETE /api/workspaces/:workspaceId/competitors/:competitorId

**Auth:** Workspace member.

Deletes one row from `workspace_competitor_analyses` by `id` scoped to `workspaceId`.

**200:** `{ "ok": true }`. **404** when not found. **503** `schema_unavailable` when migration missing.

### POST /api/serper/play-store-search

Live Google Play Store SERP preview powered by **Serper.dev**. The Serper API key is server-only (`SERPER_API_KEY`); it is never sent to or returned to the browser.

**Auth:** Signed-in workspace member (gated by `getWorkspaceRole` against the supplied `workspaceId`).

**Credits:** Reads `ai_credits_remaining`, then **`consume_workspace_ai_credits`** **before** invoking Serper. The debit amount is **`serper_preview_per_country` × `countries.length`** unless the caller sends **`pricingProfile: "competitor_spy"`** (requires **`restrictToPlayStore: true`**), in which case it is **`5 + 2 × max(0, countries.length − 2)`** (bundle for Competitor Spy). **`refund_workspace_ai_credits`** on hard failure after debit (same pattern as **`POST …/keywords/:keywordId/serper-refresh`**). **`402`** with `insufficient_credits` when the workspace balance is too low.

**Request JSON**

- `workspaceId` (uuid, required) — workspace the caller belongs to.
- `keyword` (string, required, 2–160 chars) — search term, e.g. `meditation timer`.
- `countries` (string[], required, 1–4 items) — ISO-3166 alpha-2 codes; allowed values: `us`, `sa`, `ae`, `in`, `cn`.
- `restrictToPlayStore` (boolean, optional) — wraps the Google query as `site:play.google.com/store/apps "<q>"`. Used by Competitor Spy.
- `pricingProfile` (`"competitor_spy"`, optional) — when set, selects Competitor Spy bundled pricing; must be sent with **`restrictToPlayStore: true`** (validation error otherwise).

Each country is fanned out in parallel via `Promise.all` against `https://google.serper.dev/search` (`{ q, gl, hl, num: 20 }` for this endpoint). Country → `gl`/`hl` defaults: `us→us/en`, `sa→sa/ar`, `ae→ae/en`, `in→in/en`, `cn→cn/en` (see `constants/regions.ts` / `lib/serper.ts`). Organic results are filtered down to `play.google.com/store/apps/details` URLs and deduped by `id` query (package name).

**200 response**

```json
{
  "ok": true,
  "creditsCharged": 2,
  "creditsRemaining": 40,
  "results": [
    {
      "country": "us",
      "gl": "us",
      "hl": "en",
      "items": [
        {
          "title": "Calm – Meditation, Sleep, Relax",
          "link": "https://play.google.com/store/apps/details?id=com.calm.android",
          "packageId": "com.calm.android",
          "position": 1,
          "snippet": "Calm is the #1 app for sleep, meditation and relaxation…"
        }
      ],
      "error": null
    }
  ]
}
```

Per-country failures (timeout, non-2xx, JSON parse) are surfaced as `error` on that country entry so partial results still render — the HTTP request still succeeds (**200**). The route returns a non-2xx JSON error for validation failures, auth, missing Serper key, or when `searchPlayStore` throws.

**Errors**

- `400` — `validation_error` or invalid JSON.
- `401` — `unauthorized` (no session).
- `402` — `insufficient_credits` (balance lower than **`serper_preview_per_country` × country count**).
- `403` — `forbidden` (workspace not accessible).
- `502` — `search_error` (Serper threw / unrecoverable).
- `503` — `serper_not_configured` (server has no `SERPER_API_KEY`), or wallet read/debit failure when applicable. Clients show a "live preview not configured" toast for missing Serper key.

### GET /api/admin/financial-export

**Auth:** Signed-in user with **`profiles.is_admin`** (same gate as `/admin/*`).

**Query:** `format` — `csv` \| `json` (default `json`).

**Behavior:** Loads the **current UTC calendar month** via `admin_financial_snapshot` (server-side RPC; no service role in the browser). Returns a downloadable **JSON** summary + daily rows, or **CSV** with the same window. **401** / **403** when not allowed; **400** when `format` is invalid.

### GET /api/admin/ai-analytics/feature-leaderboard

**Auth:** Site admin (`profiles.is_admin` / `role = 'admin'` or `ADMIN_EMAILS`).

**200:** `{ "ok": true, "rows": [ { "featureSlug", "featureLabel", "totalRuns", "totalCredits", "geminiUsd", "serperUsd", "totalRawCogsUsd" } ] }` — aggregates from **`admin_ai_transaction_logs`** by `feature_slug`, sorted by `totalRawCogsUsd` descending. Human labels via `lib/admin/ai-analytics.ts` (`featureLabelForSlug`). **503** `schema_unavailable` when the table or required columns are missing — apply migrations through `20260519170000_admin_ai_transaction_logs_cogs_breakdown.sql`.

### GET /api/admin/ai-analytics/plan-margin

**Auth:** Site admin (same as feature leaderboard).

**200:** `{ "ok": true, "rows": [ { "plan", "planLabel", "workspaceCount", "assumedRevenueUsd", "apiCostUsd", "marginUsd", "marginPercent" } ] }` — groups workspaces by normalized tier (`free` \| `pro` \| `growth`); **Free** assumed MRR `$0` (margin negative when COGS &gt; 0); **Pro** / **Growth** revenue = workspace count × **`PLAN_META`** monthly USD (`$29` / `$49`); API cost sums `raw_cogs_usd` (fallback `raw_usd_cost`) per workspace in tier. **503** `schema_unavailable` when **`admin_ai_transaction_logs`** is missing columns (same migrations as feature-leaderboard).

### PATCH /api/admin/users/:userId/account-status

**Auth:** Site admin.

**Body:** `{ "status": "active" | "flagged" | "suspended" }` — updates **`profiles.account_status`** (service role). **Suspended** users receive **403** on API routes and are redirected from `/app` (see `middleware.ts` + `lib/auth/profile-access.ts`).

### GET /api/billing/usage-breakdown

**Auth:** Signed-in workspace member.

**Query:** `workspaceId` (uuid, required)

**200:**

```json
{
  "ok": true,
  "workspaceId": "uuid",
  "breakdown": [
    { "phase": "title", "totalTokens": 1240, "totalCredits": 0 },
    { "phase": "short", "totalTokens": 3180, "totalCredits": 0 },
    { "phase": "long", "totalTokens": 8420, "totalCredits": 0 },
    { "phase": "full", "totalTokens": 15200, "totalCredits": 5 }
  ]
}
```

Aggregates rows from **`listing_generation_costs`** (written after each modular Gemini phase). Phases with no rows are omitted. Token threshold warnings log at **200,000** tokens/phase (`listing_phase_token_threshold_exceeded`) without aborting generation.

### GET /api/workspaces/:workspaceId/keywords/ranking-impact

**Auth:** Signed-in workspace member.

**200:**

```json
{
  "ok": true,
  "workspaceId": "uuid",
  "averageImprovementPercent": 12.5,
  "keywordCount": 4
}
```

Average relative rank improvement (%) across tracked keywords with `recent_rank_gain` within the last 7 days (same window as the keyword tracker badge). Powers the **Ranking impact** metric on Billing & Credit Usage.

### PATCH /api/workspaces/:workspaceId (monthly credit cap)

**Body (optional field):** `{ "monthly_credit_cap": 200 }` or `{ "monthly_credit_cap": null }` to clear.

Persists to **`workspaces.monthly_credit_cap`**. Evaluates the **80%** budget alert immediately after save. Credit debits also re-evaluate via `maybeCreateCreditBudgetAlert` (alert type `credit_budget_warning`, deduped per billing month).

## Response Rules
- Use consistent JSON structure.
- Return clear error messages.
- Keep success responses simple.
- Support pagination where needed.

## API Principles
- Predictable naming.
- Minimal endpoint count.
- Easy to maintain.
- Simple validation.
- Good separation by feature.
