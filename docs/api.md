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
- GET /competitors
- POST /competitors
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

Returns keywords plus `ranks` (chronological, capped) and `latest` snapshot. **403** if not a member.

- **Query:** `appId` (optional workspace app uuid) — when set, only keywords for that app are returned. Omits or invalid values return all apps (same as listing the full workspace set).

### POST /api/workspaces/:workspaceId/keywords

**Body:** `{ "term": string, "market"?: string, "locale"?: string, "appId"?: uuid }` — creates a tracked keyword for Google Play ASO.

- **409** — duplicate normalized term for the same workspace **app** + **market** (`duplicate_keyword`).
- New keywords start **without** rank snapshots until the user saves a Serper preview or uses **Refresh ranks** on a row.

### POST /api/workspaces/:workspaceId/keywords/serper-save

**Body:** `{ "term": string, "appId": uuid, "market": "us"|"sa"|"ae", "results": SerperPreviewCountry[] }` — persists one `keyword_rank_snapshots` row (`source = serper`) from a preview the user already obtained via **`POST /api/serper/play-store-search`** (no additional Serper debit). Creates the keyword row if it does not exist for that app + market + term. Requires the app’s **`package_name`** to resolve rank from organic results.

### POST /api/workspaces/:workspaceId/keywords/:keywordId/serper-refresh

Re-runs Serper for the keyword’s term. **Countries:** supported codes from **`apps.target_countries`** (normalized to lowercase), or **`keywords.market`** when none match. Debits **`serper_preview_per_country` × country count** (same wallet pattern as `play-store-search`), refunds on hard failure before a snapshot is stored. Inserts **`keyword_rank_snapshots`** with `source = serper`. **503** when `SERPER_API_KEY` is missing; **400** `no_package_name` when the app has no Android id.

### POST /api/workspaces/:workspaceId/keywords/bulk

**Body:** `{ "terms": string[], "appId": uuid, "listingGenerationId": uuid, "market"?: string, "locale"?: string }` — bulk-adds keywords suggested by an AI listing run for Keyword Tracker.

- Verifies workspace membership, **app** belongs to workspace, and **listing_generation** belongs to the workspace (optional **`app_id`** on the generation must match **`appId`** when set).
- Dedupes against existing tracked terms for that app + market; skips duplicates without charging.
- **AI credits:** first **5** new keywords tied to the same **`listing_generation_id`** are free; each additional new keyword costs **`keyword_track_ai_per_keyword`** (see `lib/features/billing/credit-costs.ts`). Debits via **`consume_workspace_ai_credits`** before inserts; refunds on total insert failure after debit.
- Sets **`keywords.source = 'ai_listing'`** and **`listing_generation_id`** on inserted rows (no automatic rank snapshots; use Serper preview + save or per-row refresh).
- **402** — `insufficient_credits` when the wallet cannot cover the charge.

### GET /api/workspaces/:workspaceId/keywords/:keywordId

Returns a single keyword for the workspace with **`ranks`** (chronological ascending, up to 500 rows) and **`latest`** snapshot. **401** / **403** same as list keywords; **404** if the keyword is missing from the workspace.

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

### PATCH /api/workspaces/:workspaceId/apps/:appId

**Body:** fields from `patchAppSchema` — updates `name`, `package_name`, `play_store_url`, `target_countries`, and optional **`icon_url`**. When `icon_url` is sent, the server writes **`apps.icon_url`** (nullable) and mirrors the same value into **`apps.metadata.icon_url`** for backward compatibility. Clearing `icon_url` removes it from both places when supported by the payload.

### POST /api/workspaces/:workspaceId/onboarding/complete

Marks onboarding finished (`onboarding_state.completed`) and sets `profiles.onboarding_completed_at`.

### GET/POST /api/workspaces/:workspaceId/invitations

**POST body:** `{ "email": string, "role": "admin" | "member" }` — owner/admin only.

### PATCH /api/profile

**Body:** `{ "display_name"?: string, "notification_preferences"?: object }` — authenticated user’s own profile.

### POST /api/listings/generate (Phase 1 MVP)

Next.js route implementing `POST /listings/generate`. Requires **signed-in user**, **Gemini**, **Supabase user client** (RLS) for persistence, and **service role** only for rate-limit RPC + `usage_logs`. Uses **`listing_generation`** credits from `lib/features/billing/credit-costs.ts` (default **5** per run, including regenerate with `userInstruction`). The handler reads `ai_credits_remaining` (no mutation), then calls `consume_workspace_ai_credits` **before** Gemini; on generation failure it calls `refund_workspace_ai_credits`, so the **net charge matches a successful listing payload** returned to the client. Persisted rows store `listing_generations.credits_ledger_id` when insert succeeds. Optional body **`appId`** (workspace app uuid) is saved on **`listing_generations.app_id`** so Keyword Tracker can load “latest AI listing” keywords per app; success **`meta.generationId`** returns the new row id when persistence succeeds, with **`meta.savedAt`** (ISO timestamp from `listing_generations.created_at`) and **`meta.persisted`** (boolean).

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
    "ctaSuggestions": ["…"]
  },
  "meta": {
    "model": "gemini-2.5-flash",
    "promptVersion": "listing-optimizer-v3",
    "persisted": true,
    "generationId": "uuid",
    "savedAt": "2026-05-13T12:00:00.000Z"
  }
}
```

**Errors**

- `400` — `validation_error` or invalid JSON (`bad_request`).
- `401` — `unauthorized` when session missing.
- `402` — `insufficient_credits` when the workspace balance is below **`listing_generation`** cost (from pre-read and/or `consume_workspace_ai_credits`).
- `403` — `forbidden` when `workspaceId` is not accessible.
- `422` — `invalid_model_output` when Gemini JSON fails schema validation after server-side length clamping (rare); client may retry with stricter instructions.
- `429` — `rate_limited` (per **user** per minute; see `RATE_LIMIT_MAX`).
- `500` — `generation_error` (e.g. model or parse failure).
- `503` — `config` when Supabase or Gemini is not configured.

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

`POST /api/listings/generate`, `POST /api/listings/optimizer-autofill`, `POST /api/apps/suggest`, and **`POST /api/serper/play-store-search`** share: read `workspaces.ai_credits_remaining` (RLS, non-mutating) when a debit applies, then **`consume_workspace_ai_credits`** (locked debit) **before** the external call, then **`refund_workspace_ai_credits`** on hard failure (e.g. Serper route exception) so **net balance aligns with success**. Costs are centralized in `lib/features/billing/credit-costs.ts` (`listing_generation` **5**, `listing_optimizer_autofill` **3**, `add_app_field_suggest` **3**, `keyword_track_ai_per_keyword` **2** with **5** free keywords per `listing_generation_id` — see `KEYWORD_TRACK_AI_FREE_PER_GENERATION`; Serper live preview **`serper_preview_per_country` × country count**, default **1** credit per selected market). A debit-only-after-success pattern without a reservation RPC would not be concurrency-safe against unpaid parallel model calls; see `lib/features/billing/wallet.ts`.

### POST /api/serper/play-store-search

Live Google Play Store SERP preview powered by **Serper.dev**. The Serper API key is server-only (`SERPER_API_KEY`); it is never sent to or returned to the browser.

**Auth:** Signed-in workspace member (gated by `getWorkspaceRole` against the supplied `workspaceId`).

**Credits:** When `SERPER_API_KEY` is present, the handler reads `ai_credits_remaining`, then **`consume_workspace_ai_credits`** for **`serper_preview_per_country` × `countries.length`** (default **1** credit per market — `lib/features/billing/credit-costs.ts`) **before** calling Serper. If `searchPlayStore` throws, **`refund_workspace_ai_credits`** reverses that debit. Per-country errors returned inside `results[].error` do **not** refund (the batch completed). **`503` `serper_not_configured`** returns before any debit.

**Request JSON**

- `workspaceId` (uuid, required) — workspace the caller belongs to.
- `keyword` (string, required, 2–160 chars) — search term, e.g. `meditation timer`.
- `countries` (string[], required, 1–3 items) — ISO-3166 alpha-2 codes; allowed values: `us`, `sa`, `ae`.
- `restrictToPlayStore` (boolean, optional) — wraps the Google query as `site:play.google.com/store/apps "<q>"`. Used by Competitor Spy.

Each country is fanned out in parallel via `Promise.all` against `https://google.serper.dev/search` (`{ q, gl, hl, num }`). Country → `gl`/`hl` defaults: `us→us/en`, `sa→sa/ar`, `ae→ae/en` (see `lib/serper.ts`). Organic results are filtered down to `play.google.com/store/apps/details` URLs and deduped by `id` query (package name).

**200 response**

```json
{
  "ok": true,
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

Per-country failures (timeout, non-2xx, JSON parse) are surfaced as `error` on that country entry so partial results still render — the HTTP request still succeeds (**200**) and credits remain charged. The route returns a non-2xx JSON error for validation failures, auth, insufficient credits, wallet read/consume errors, missing Serper key, or when `searchPlayStore` throws (after refund).

**Errors**

- `400` — `validation_error` or invalid JSON.
- `401` — `unauthorized` (no session).
- `403` — `forbidden` (workspace not accessible).
- `402` — `insufficient_credits` (`remaining` / `required`) when the workspace balance is below the preview cost.
- `502` — `search_error` (Serper threw / unrecoverable); debit refunded when the failure is a thrown error from `searchPlayStore`.
- `503` — `serper_not_configured` (server has no `SERPER_API_KEY`). Clients show a "live preview not configured" toast. No credits are debited when the key is missing.
- `503` — `wallet_error` when the workspace credit balance cannot be read or the debit RPC fails unexpectedly (no charge on read failure before consume; consume failures occur after a successful read).

### GET /api/admin/financial-export

**Auth:** Signed-in user with **`profiles.is_admin`** (same gate as `/admin/*`).

**Query:** `format` — `csv` \| `json` (default `json`).

**Behavior:** Loads the **current UTC calendar month** via `admin_financial_snapshot` (server-side RPC; no service role in the browser). Returns a downloadable **JSON** summary + daily rows, or **CSV** with the same window. **401** / **403** when not allowed; **400** when `format` is invalid.

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
