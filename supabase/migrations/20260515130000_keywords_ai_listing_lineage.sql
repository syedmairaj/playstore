-- Link listing generations to apps and keywords to AI listing batches (Keyword Tracker integration).

alter table public.listing_generations
  add column if not exists app_id uuid references public.apps (id) on delete set null;

create index if not exists listing_generations_workspace_app_created_idx
  on public.listing_generations (workspace_id, app_id, created_at desc);

comment on column public.listing_generations.app_id is
  'Workspace app this generation was created for; enables per-app latest AI keyword suggestions.';

alter table public.keywords
  add column if not exists source text;

alter table public.keywords
  add column if not exists listing_generation_id uuid references public.listing_generations (id) on delete set null;

create index if not exists keywords_listing_generation_idx
  on public.keywords (listing_generation_id)
  where listing_generation_id is not null;

comment on column public.keywords.source is
  'Optional origin: manual, ai_listing, etc.';

comment on column public.keywords.listing_generation_id is
  'When tracking keywords suggested by AI listing, references the generation row (free-tier quota is per generation).';
