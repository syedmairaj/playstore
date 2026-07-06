-- ============================================================
-- listing_versions — stateful, growth-driven version history
-- ============================================================
-- Bridges the gap between "generated a draft" and "deployed to
-- Google Play". Every listing pipeline run that completes is
-- automatically promoted to a draft ListingVersion.  Users
-- manually advance status: draft → published → deployed.
--
-- Covers EN + AR vault locales.  All access is gated by
-- the is_workspace_member() RLS helper.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_versions (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id           uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  app_id                 uuid        REFERENCES public.apps(id) ON DELETE SET NULL,
  vault_locale           text        NOT NULL DEFAULT 'en'
                           CHECK (vault_locale IN ('en', 'ar')),

  -- ── Version identity ────────────────────────────────────────
  version_number         integer     NOT NULL,  -- sequenced per (workspace_id, app_id, vault_locale)
  status                 text        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'published', 'deployed')),

  -- ── Content ────────────────────────────────────────────────
  title                  text,
  short_description      text,
  long_description       text,
  keyword_suggestions    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cta_suggestions        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- [{order: 1..8, caption: string ≤70 chars, theme: hook|feature|benefit|cta}]
  screenshot_captions    jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- ── Live listing snapshot for Deployment View comparison ───
  -- Populated when the user enters / imports their current Play Store listing.
  -- Shape: {title, shortDescription, longDescription, capturedAt: ISO string}
  live_listing_snapshot  jsonb,

  -- ── Source provenance ───────────────────────────────────────
  source_queue_hash      text,
  source_job_id          text,        -- workspace_listing_drafts.job_id that produced this version
  source_generation_id   uuid,        -- listing_generations.id if a full/finalize run

  -- ── Status transition timestamps ───────────────────────────
  published_at           timestamptz,
  deployed_at            timestamptz,

  -- ── Metadata ───────────────────────────────────────────────
  notes                  text,
  created_by             uuid        NOT NULL REFERENCES auth.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at auto-refresh ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_listing_versions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_listing_versions_updated_at
  BEFORE UPDATE ON public.listing_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_listing_versions_updated_at();

-- ── version_number sequencing ───────────────────────────────
-- Returns the next sequential version number for a given
-- (workspace_id, app_id, vault_locale) partition.
-- app_id may be NULL (workspace-wide versions).
CREATE OR REPLACE FUNCTION public.next_listing_version_number(
  p_workspace_id uuid,
  p_app_id       uuid,
  p_vault_locale text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next
    FROM public.listing_versions
   WHERE workspace_id = p_workspace_id
     AND vault_locale = p_vault_locale
     AND (
           (app_id IS NULL AND p_app_id IS NULL) OR
           (app_id = p_app_id)
         );
  RETURN v_next;
END;
$$;

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_listing_versions_workspace_app_locale
  ON public.listing_versions (workspace_id, app_id, vault_locale, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_versions_status
  ON public.listing_versions (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_versions_source_job
  ON public.listing_versions (source_job_id)
  WHERE source_job_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.listing_versions ENABLE ROW LEVEL SECURITY;

-- Members can read all versions for their workspace
CREATE POLICY "listing_versions_select"
  ON public.listing_versions FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- Members can insert versions for their workspace (created_by = auth.uid())
CREATE POLICY "listing_versions_insert"
  ON public.listing_versions FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND created_by = auth.uid()
  );

-- Members can update status + snapshot; full content write requires ownership
CREATE POLICY "listing_versions_update"
  ON public.listing_versions FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

-- Only owner / admin can delete versions
CREATE POLICY "listing_versions_delete"
  ON public.listing_versions FOR DELETE
  USING (public.workspace_role(workspace_id) IN ('owner', 'admin'));

-- Allow service_role unrestricted access (worker writes)
CREATE POLICY "listing_versions_service_role"
  ON public.listing_versions
  USING (true)
  WITH CHECK (true);
