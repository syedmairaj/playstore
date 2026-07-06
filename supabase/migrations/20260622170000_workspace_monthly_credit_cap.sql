-- User-defined monthly credit budget cap (Integrations & Alerts settings).
alter table public.workspaces
  add column if not exists monthly_credit_cap int;

comment on column public.workspaces.monthly_credit_cap is
  'Optional workspace monthly credit spend cap; alerts at 80% usage. Null = disabled.';

-- Extend workspace_alerts.type for credit budget warnings.
alter table public.workspace_alerts
  drop constraint if exists workspace_alerts_type_check;

alter table public.workspace_alerts
  add constraint workspace_alerts_type_check
  check (type in ('rank_drop', 'rank_threshold', 'aso_rank_improvement', 'credit_budget_warning'));
