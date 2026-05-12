# Billing & wallet (`lib/features/billing`)

- **`credit-costs.ts`** — Per-tool credit units (workspace-wide pool on `workspaces.ai_credits_remaining`).
- **`wallet.ts`** — Calls Supabase RPCs `consume_workspace_ai_credits` / `refund_workspace_ai_credits` (see `supabase/migrations/20250516000000_credits_ledger_wallet.sql`).
- **`workspace-ai-credits.ts`** — `readWorkspaceAiCreditsRemaining` (RLS read, no mutation) and shared `402` payload builder used before Gemini.

**Rule for AI routes:** after membership (and rate limit where applicable), optionally **read** remaining credits, then call `consumeWorkspaceAiCredits` **before** any external model call; on hard failure before a successful user-visible result, call `refundWorkspaceAiCredits` with the returned `ledger_id`. See `wallet.ts` for why a debit-only-after-success flow is not used without a reservation RPC.
