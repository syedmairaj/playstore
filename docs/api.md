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

### PATCH /api/workspaces/:workspaceId/apps/:appId

**Body:** fields from `patchAppSchema` — updates app metadata (`name`, `package_name`, `play_store_url`, `target_countries`).

### POST /api/workspaces/:workspaceId/onboarding/complete

Marks onboarding finished (`onboarding_state.completed`) and sets `profiles.onboarding_completed_at`.

### GET/POST /api/workspaces/:workspaceId/invitations

**POST body:** `{ "email": string, "role": "admin" | "member" }` — owner/admin only.

### PATCH /api/profile

**Body:** `{ "display_name"?: string, "notification_preferences"?: object }` — authenticated user’s own profile.

### POST /api/listings/generate (Phase 1 MVP)

Next.js route implementing `POST /listings/generate`. Requires **signed-in user**, **Gemini**, **Supabase user client** (RLS) for persistence, and **service role** only for rate-limit RPC + `usage_logs`.

**Request JSON**

- `workspaceId` (uuid, required) — must be a workspace the user belongs to.
- `appName` (string, required)
- `category` (string, required)
- `targetKeywords` (string[] or comma-separated string, required, max 40 terms)
- `appFeatures` (string, required)
- `toneStyle` (enum: `professional` | `friendly` | `bold` | `minimal`)

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
    "model": "gemini-2.0-flash",
    "promptVersion": "listing-optimizer-v1",
    "persisted": true
  }
}
```

**Errors**

- `400` — `validation_error` or invalid JSON (`bad_request`).
- `401` — `unauthorized` when session missing.
- `403` — `forbidden` when `workspaceId` is not accessible.
- `429` — `rate_limited` (per **user** per minute; see `RATE_LIMIT_MAX`).
- `500` — `generation_error` (e.g. model or parse failure).
- `503` — `config` when Supabase or Gemini is not configured.

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
