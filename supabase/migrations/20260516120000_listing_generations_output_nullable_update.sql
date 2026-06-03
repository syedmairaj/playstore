-- Allow input-only optimizer rows (AI autofill before a full listing) and member updates to latest inputs.

alter table public.listing_generations
  alter column output_json drop not null;

comment on column public.listing_generations.output_json is
  'Gemini listing JSON (title, shortDescription, fullDescription, keywordSuggestions, ctaSuggestions). Null when the row stores optimizer inputs only (e.g. AI autofill) until a full listing run.';

create policy "listing_generations_update_owner_member"
  on public.listing_generations for update
  to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  )
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );
