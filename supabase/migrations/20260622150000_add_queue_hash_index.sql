-- Context Gateway — accelerate queue_hash lookups as staged keyword volume grows (EN/AR).

create index if not exists workspace_keywords_queue_hash_idx
  on public.workspace_keywords using btree (queue_hash);

comment on index public.workspace_keywords_queue_hash_idx is
  'B-tree index for optimization-queue stamping and compileContext queue_hash filters.';
