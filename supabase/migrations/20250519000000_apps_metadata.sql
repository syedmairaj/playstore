-- Optional ASO context and extras for workspace apps (category, short description, icon URL).
alter table public.apps
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.apps.metadata is 'JSON bag for ASO fields not modeled as columns (e.g. category, short_description, icon_url).';
