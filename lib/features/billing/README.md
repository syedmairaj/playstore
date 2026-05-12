# Billing & wallet (`lib/features/billing`)

- **`credit-costs.ts`** — Per-tool credit units (workspace-wide pool on `workspaces.ai_credits_remaining`).
- **`wallet.ts`** — Calls Supabase RPCs `consume_workspace_ai_credits` / `refund_workspace_ai_credits` (see `supabase/migrations/20250516000000_credits_ledger_wallet.sql`).

**Rule for AI routes:** call `consumeWorkspaceAiCredits` **before** any external model call; on hard failure before a successful persist, call `refundWorkspaceAiCredits` with the returned `ledger_id`.
