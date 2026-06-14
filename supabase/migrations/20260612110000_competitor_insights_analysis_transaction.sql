-- Link cached review analysis to the credits_ledger debit that paid for it.
-- Required for CreditGate: Listing Optimizer must not expose review-derived
-- Active Context without a valid, non-refunded spend row.

alter table public.competitor_insights
  add column if not exists analysis_transaction_id uuid
    references public.credits_ledger (id) on delete set null;

comment on column public.competitor_insights.analysis_transaction_id is
  'credits_ledger debit id for the paid Gemini run that produced this cache row.';

create index if not exists competitor_insights_analysis_tx_idx
  on public.competitor_insights (workspace_id, analysis_transaction_id)
  where analysis_transaction_id is not null;
