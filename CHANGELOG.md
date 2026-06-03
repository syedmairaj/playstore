# PlayStore.xyz — Full Project Changelog

> **Purpose:** This file is the authoritative record of every feature built,
> every file changed, and the DB schema. If a context window resets or something
> disappears, start here to reconstruct the current state.
>
> **Update rule:** Every session that changes code must append a new entry at
> the top. Run `git add CHANGELOG.md && git commit --amend --no-edit` or a
> fresh commit after updating this file.

---

## Session 2026-05-28 — Google Play Integration + Queue/Archive Panels

### Root Cause of Regressions
The `Write` tool in Cowork/Claude sessions writes to a temporary outputs
scratch folder (`/Users/.../outputs/`), NOT the workspace mount. Files written
via `Write` would silently disappear on session end. **Fix:** always use `bash`
with `cat > /sessions/.../mnt/playstore/...` for writing new files. Edits to
existing files via the `Edit` tool are safe — they write directly to the mount.

### Features Added This Session

#### 1. Google Play Console OAuth Integration (Direct Store Connect)
Allows workspace owners/admins to connect their Google Play Console account
per-workspace, so listing updates can be published directly from the app.

**New files (written via bash — confirmed on disk):**
- `lib/play-store/google-play-oauth.ts` — AES-256-GCM encrypt/decrypt for
  refresh tokens; `saveRefreshToken`, `getRefreshToken`, `getConnectedAccount`,
  `deleteConnectedAccount`, `getOAuth2ClientForWorkspace`, `getAccessTokenForWorkspace`
- `lib/play-store/publish-listing-to-play-store.ts` — Full Google Play Edits
  API flow: `edits.insert` → `edits.listings.update` → `edits.commit`
- `app/api/integrations/google-play/connect/route.ts` — GET (initiate OAuth,
  set CSRF cookies) + DELETE (disconnect account)
- `app/api/integrations/google-play/callback/route.ts` — Exchange code for
  tokens, save to DB, redirect with flash param
- `app/api/integrations/google-play/status/route.ts` — Returns connected
  state, authorized email, connected date
- `app/api/workspaces/[workspaceId]/apps/[appId]/publish-listing/route.ts` —
  POST: validates workspace/app/package, calls publishListingToPlayStore

**Modified files:**
- `components/settings/integrations-tab.tsx` — Full rewrite with
  `ConnectedStoresSection`: status fetch, connect/disconnect UI, flash messages
- `components/settings/SettingsTabs.tsx` — Added `workspaceId` and `canAdmin`
  props to `<IntegrationsTab>`
- `components/listing/play-console-export-dialog.tsx` — Added publish state
  machine (idle→confirm→publishing→success/error) with direct API call
- `components/ListingOptimizer.tsx` — Fetches Google Play status on mount,
  wires to export dialog
- `messages/en.json` — Added `settings.integrations.connectedStores*` keys
- `messages/ar.json` — Same keys in Arabic

**Required env vars:**
```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://yourdomain.com/api/integrations/google-play/callback
GOOGLE_OAUTH_ENCRYPTION_KEY=<64 hex chars, 32 bytes>
```

**DB table (migration already applied):**
```sql
-- supabase/migrations/20260528100000_connected_accounts.sql
connected_accounts(
  id uuid PK,
  workspace_id uuid FK workspaces,
  provider text,                    -- "google_play"
  authorized_email text,
  encrypted_refresh_token text,
  encryption_iv text,
  encryption_tag text,
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(workspace_id, provider)
)
```

---

#### 2. Active Optimization Queue + History Archive (Reviews Page)
Below the Common Issues panel, two new sections:
- **Active Optimization Queue** — backlog items not yet implemented
- **Optimization History Archive** — items marked as implemented, with revert

**Status:** Built in this session (see entries below for files changed)

---

## Session 2026-05-25 — Reviews AI Analysis + Backlog (git: 0737465)

### Features (committed in git `0737465 added new features`)

#### Common Issues Panel (Review AI Analysis)
- `components/reviews/IssueCard.tsx` — NEW: Card component with AVAILABLE →
  STAGED pipeline. "Add to Optimization Backlog" → "Open in Listing Optimizer →"
- `components/reviews/ReviewsClient.tsx` — Major rewrite: CommonIssuesPanel
  integrated, Gemini-powered review analysis, IssueCard grid
- `lib/gemini/generate-review-analysis.ts` — NEW: Gemini review clustering
- `app/api/workspaces/[workspaceId]/reviews/analyze/route.ts` — NEW: Gemini
  analysis endpoint with credit charging
- `app/api/workspaces/[workspaceId]/backlog/route.ts` — NEW: POST (add to
  backlog) + GET (fetch all backlog items)

**DB tables:**
```sql
-- 20260523100000_workspace_listing_backlog.sql
workspace_listing_backlog(
  id uuid PK,
  workspace_id uuid FK,
  package_name text,
  country_code text DEFAULT 'us',
  issue_title text,
  issue_description text,
  severity text CHECK ('CRITICAL','MEDIUM','LOW'),
  impact numeric(5,4),
  added_by uuid,
  created_at timestamptz
)
UNIQUE(workspace_id, package_name, country_code, issue_title)

-- 20260524100000_workspace_listing_backlog_retention.sql
-- Adds: is_implemented boolean DEFAULT false
-- Adds: updated_at timestamptz (auto-updated by trigger)
-- Adds: cleanup_expired_backlog_items() function
-- Retention: implemented=true → purge after 30 days; false → 90 days
```

**Key behaviour:**
- `IssueCard` button → POST `/api/workspaces/[id]/backlog` → item saved to DB
- `improvementIds` array in sessionStorage tracks which cards are STAGED
  (button shows "Open in Listing Optimizer →")
- **Missing at commit time:** UI panels to display the queue and archive

---

## Session 2026-05-22 — Competitor Spy + Listing Improvements (git: a6582c8)

### Features (committed in `a6582c8 adding 2nd competitor`)

- `app/api/workspaces/[workspaceId]/listing-improvements/route.ts` — GET
  (with `?unutilized=1` filter) + POST
- DB: `workspace_listing_improvements` table with `is_utilized boolean`
  (this is a SEPARATE table from `workspace_listing_backlog`)
- Competitor Spy major update: 2nd competitor support

---

## Session 2026-05-21 — Admin COGS Dashboard (git: a0e886d, 2c6746b)

### Features
- Admin COGS breakdown: Provider COGS (Gemini/Serper/Runware), Credit Audit,
  Feature Leaderboard, Plan Margin
- `logAdminAiTransaction` added to all credit-charging routes
- `estimatedCostUsd` surfaced from Gemini `usageMetadata`

---

## Session 2026-05-20 — Keyword Tracker + Serper (git: 3b70ca0, c6d22fc)

### Features
- Keyword rank tracker with Serper live-rank preview
- `lib/play-store/country-lang-map.ts`
- Serper refresh endpoint per keyword

---

## Database Schema — Current State

### Tables (all in `public` schema)

| Table | Key columns | Purpose |
|-------|------------|---------|
| `workspaces` | id, name, plan | Workspace root |
| `apps` | id, workspace_id, package_name | Android apps per workspace |
| `workspace_listing_backlog` | id, workspace_id, package_name, issue_title, severity, impact, is_implemented | IssueCard queue — items user wants to act on |
| `workspace_listing_improvements` | id, workspace_id, review_id, is_utilized | Per-review improvements from review page |
| `connected_accounts` | id, workspace_id, provider, encrypted_refresh_token | OAuth tokens (Google Play) |
| `workspace_competitor_analyses` | id, workspace_id, package_name | Competitor spy cache |
| `keyword_rank_snapshots` | id, workspace_id, keyword_id | Serper rank history |
| `admin_ai_transaction_logs` | id, workspace_id, feature, credits, estimated_cost_usd | COGS tracking |

---

## Critical Files Map

```
components/
  reviews/
    ReviewsClient.tsx        — Main reviews page (1700+ lines)
    IssueCard.tsx            — AVAILABLE→STAGED pipeline card
    CommonIssuesPanel        — (inline in ReviewsClient, ~400 lines)
  listing/
    play-console-export-dialog.tsx — Export + one-click publish
  ListingOptimizer.tsx       — Main optimizer (fetches GP status)
  settings/
    integrations-tab.tsx     — Connected Stores + notifications + profile
    SettingsTabs.tsx         — Tab shell (passes workspaceId to IntegrationsTab)

lib/
  play-store/
    google-play-oauth.ts     — OAuth2 client + AES-256-GCM token storage
    publish-listing-to-play-store.ts — Edits API publish flow

app/api/
  integrations/google-play/
    connect/route.ts         — GET initiate OAuth, DELETE disconnect
    callback/route.ts        — OAuth code exchange
    status/route.ts          — Connection status
  workspaces/[workspaceId]/
    backlog/route.ts         — POST add issue, GET fetch all
    listing-improvements/route.ts — GET (unutilized filter) + POST
    apps/[appId]/publish-listing/route.ts — Publish to Play Console

messages/
  en.json                    — English strings
  ar.json                    — Arabic strings (full RTL support)
```

---

## How to Avoid Regressions

1. **After every session, commit:** `git add -A && git commit -m "session: <date> <feature>"`
2. **Update this CHANGELOG** with what changed and why
3. **New files must be written via bash**, not the Write tool:
   `cat > /sessions/.../mnt/playstore/path/to/file.ts << 'EOF'`
4. **Verify on disk** after writing: `wc -l /sessions/.../mnt/playstore/...`
5. **Run TypeScript check** before committing: `npx tsc --noEmit --skipLibCheck`
