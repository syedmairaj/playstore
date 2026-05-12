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

### POST /api/workspaces/:workspaceId/keywords

**Body:** `{ "term": string, "market"?: string, "locale"?: string, "appId"?: uuid }` — creates a tracked keyword for Google Play ASO.

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

Lists apps in the workspace.

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

**Body:** fields from `patchAppSchema` — updates app metadata (`name`, `package_name`, `play_store_url`, `target_countries`).

### POST /api/workspaces/:workspaceId/onboarding/complete

Marks onboarding finished (`onboarding_state.completed`) and sets `profiles.onboarding_completed_at`.

### GET/POST /api/workspaces/:workspaceId/invitations

**POST body:** `{ "email": string, "role": "admin" | "member" }` — owner/admin only.

### PATCH /api/profile

**Body:** `{ "display_name"?: string, "notification_preferences"?: object }` — authenticated user’s own profile.

### POST /api/listings/generate (Phase 1 MVP)

Next.js route implementing `POST /listings/generate`. Requires **signed-in user**, **Gemini**, **Supabase user client** (RLS) for persistence, and **service role** only for rate-limit RPC + `usage_logs`. Uses **`listing_generation`** credits from `lib/features/billing/credit-costs.ts` (default **5** per run, including regenerate with `userInstruction`). The handler reads `ai_credits_remaining` (no mutation), then calls `consume_workspace_ai_credits` **before** Gemini; on generation failure it calls `refund_workspace_ai_credits`, so the **net charge matches a successful listing payload** returned to the client. Persisted rows store `listing_generations.credits_ledger_id` when insert succeeds.

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
    "persisted": true
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

**200 response**

```json
{
  "ok": true,
  "data": { "text": "…", "field": "keywords" },
  "meta": {
    "model": "gemini-2.5-flash",
    "creditsCharged": 3,
    "creditsRemaining": 42
  }
}
```

For `field: "keywords"`, `text` is **comma-separated** keywords (normalized server-side). Success `meta` includes **`creditsCharged`** (same as `listing_optimizer_autofill` in `credit-costs.ts`) and **`creditsRemaining`**: workspace AI credit balance **after** the debit (so the client can show “credits used • remaining” without an extra fetch).

**Errors**

Same pattern as `POST /api/listings/generate`: `400` validation, `401` unauthorized, `403` forbidden, `402` insufficient credits (`insufficient_credits` + `remaining` / `required`), `429` rate limit (key `listing_optimizer_autofill:<user_id>`), `500` / `503` generation or config.

### AI workspace credits (summary)

`POST /api/listings/generate`, `POST /api/listings/optimizer-autofill`, and `POST /api/apps/suggest` share: read `workspaces.ai_credits_remaining` (RLS, non-mutating), then **`consume_workspace_ai_credits`** (locked debit) **before** Gemini, then **`refund_workspace_ai_credits`** on model/route failure so **net balance aligns with success**. Costs are centralized in `lib/features/billing/credit-costs.ts` (`listing_generation` **5**, `listing_optimizer_autofill` **3**, `add_app_field_suggest` **3**). A debit-only-after-success pattern without a reservation RPC would not be concurrency-safe against unpaid parallel model calls; see `lib/features/billing/wallet.ts`.

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
