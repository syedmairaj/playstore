-- Optional weekly Cost-Per-Install for Growth Tracking (manual UAC ÷ installers).
alter table public.listing_metrics
  add column if not exists cost_per_install numeric(10, 4);

comment on column public.listing_metrics.cost_per_install is
  'Optional cost per install in workspace currency (typically USD). Source: weekly UAC spend ÷ installers from Google Ads or Play acquisition reports.';
