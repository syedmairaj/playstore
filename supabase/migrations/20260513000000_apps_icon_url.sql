-- HTTPS app listing icon URL (application validates https://); mirrors metadata.icon_url when PATCH applies.
alter table public.apps add column if not exists icon_url text;

comment on column public.apps.icon_url is
  'Optional app listing icon URL (HTTPS). Preferred over apps.metadata.icon_url when both exist.';
