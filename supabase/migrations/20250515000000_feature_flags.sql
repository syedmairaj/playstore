-- Phase 1: global feature toggles (UI + routing). Override with NEXT_PUBLIC_FF_<KEY> in env (see lib/features/flags/resolve.ts).
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

comment on table public.feature_flags is 'Boolean product flags; readable by anon for marketing + app shell; writes via service role or SQL only.';

alter table public.feature_flags enable row level security;

-- Public read: flags are not tenant secrets (only on/off for product areas).
create policy "feature_flags_select_public"
  on public.feature_flags
  for select
  to anon, authenticated
  using (true);

-- No insert/update/delete for API roles (manage via migrations or service role off-RLS).
insert into public.feature_flags (key, enabled, description)
values
  ('keyword_tracker', true, 'Keyword list, snapshots, movement'),
  ('listing_optimizer', true, 'AI listing drafts (Gemini)'),
  ('workspace_dashboard', true, 'Workspace home, ASO checklist, metrics'),
  ('competitor_spy', true, 'Competitor surface (Phase 1 stub)'),
  ('review_insights', true, 'Reviews surface (Phase 1 shell)'),
  ('ranking_tracker_advanced', false, 'Depth charts, share of voice, exports'),
  ('alerts_advanced', false, 'Multi-channel, anomaly rules, schedules'),
  ('localization_playbook', false, 'Per-market EN/AR playbooks & diffs')
on conflict (key) do update set
  description = excluded.description,
  updated_at = now();
