# Settings Page

> **Canonical spec:** [`app-pages/settings.md`](../app-pages/settings.md)

Three-tab enterprise layout at `/app/[workspaceId]/settings`:

1. **Workspace & Apps** — name, apps, team, invites, delete workspace.
2. **Billing & Credit Usage** — wallet usage cards + `credits_ledger` table.
3. **Integrations & Alerts** — notification switches, profile, sign out.

Data: server page loads workspace wallet fields and last 50 ledger rows; optional `GET /api/workspaces/:workspaceId/credits-ledger`.
