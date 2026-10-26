-- 20261113_interview_experience_sources.sql — where a write-up came from, and
-- who is allowed to see it.
--
-- The interview directory is being seeded from a list of RESEARCH LEADS (a
-- title, company, role, short original summary and a source URL). Three things
-- have to be true before such a lead can live next to a student's own write-up:
--
--   a) PROVENANCE — a seeded lead and a user's account of their own drive must
--      never be confused. `provenance` says which one it is, and the seed
--      importer writes nothing else.
--   b) ATTRIBUTION — the source URL, platform, credit line and the date the
--      source was last checked travel with the row, so a reader can always go
--      back to the original. Only the source's short summary is stored — never
--      the article or transcript.
--   c) REVIEW — nothing seeded is public until a human approves it. Public
--      readers only ever see `review_status = 'approved'`.
--
-- Existing rows: every row already in the table is a user's write-up, so
-- `provenance` defaults to 'user' and nothing about them changes.

-- ── a) a seed has no author account ────────────────────────────────────────
-- A research lead is not posted BY anyone on this platform. Rather than invent
-- a user, the column becomes nullable; every user-submitted row still sets it,
-- and the insert policy below still requires it.

ALTER TABLE public.interview_experiences
  ALTER COLUMN user_id DROP NOT NULL;

-- Rows built from a one-line source summary have no long-form body yet.
ALTER TABLE public.interview_experiences
  ALTER COLUMN experience SET DEFAULT '';

-- ── b) attribution + provenance + review ──────────────────────────────────

ALTER TABLE public.interview_experiences
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_url_norm TEXT,
  ADD COLUMN IF NOT EXISTS source_platform TEXT,
  ADD COLUMN IF NOT EXISTS source_author TEXT,
  ADD COLUMN IF NOT EXISTS source_credit TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_last_checked_at TIMESTAMPTZ,
  -- NULL when the source does not state a date. Never guessed.
  ADD COLUMN IF NOT EXISTS experience_date DATE,
  ADD COLUMN IF NOT EXISTS topics TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (verification_status IN (
      'pending_review', 'source_accessible', 'source_inaccessible',
      'source_mismatch', 'duplicate', 'approved', 'rejected'
    )),
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'user'
    CHECK (provenance IN ('user', 'seed')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.interview_experiences.experience IS
  'The write-up body. For seeded rows this is the source''s SHORT summary, never the copied article.';
COMMENT ON COLUMN public.interview_experiences.source_url_norm IS
  'Normalised source URL used only for de-duplication; source_url keeps the original.';

-- One row per source, so re-running the importer can not create a second copy.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_interview_exp_source
  ON public.interview_experiences (source_url_norm)
  WHERE source_url_norm IS NOT NULL;

-- The filters the directory actually uses, and nothing more.
CREATE INDEX IF NOT EXISTS idx_interview_exp_review
  ON public.interview_experiences (review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_exp_role
  ON public.interview_experiences (lower(role));
-- company_id is already indexed (039_company_portal.sql).

CREATE OR REPLACE FUNCTION public.touch_interview_experiences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_interview_exp_updated ON public.interview_experiences;
CREATE TRIGGER trg_interview_exp_updated
  BEFORE UPDATE ON public.interview_experiences
  FOR EACH ROW EXECUTE FUNCTION public.touch_interview_experiences_updated_at();

-- ── c) who sees what ──────────────────────────────────────────────────────

-- Visitors (no session) see approved write-ups only. This is additive to the
-- existing `interview_exp_select`, which still lets a signed-in reader see
-- pending rows — that is how the directory shows its own unapproved drafts to
-- logged-in users, and it is unchanged here.
DROP POLICY IF EXISTS interview_exp_public_read ON public.interview_experiences;
CREATE POLICY interview_exp_public_read ON public.interview_experiences
  FOR SELECT USING (review_status = 'approved');

-- A client may only ever insert its OWN write-up, and only as a user row.
-- Seeded rows are written by the service role (which bypasses RLS), so no
-- session can fabricate one — or mark its own submission approved.
DROP POLICY IF EXISTS interview_exp_insert ON public.interview_experiences;
CREATE POLICY interview_exp_insert ON public.interview_experiences
  FOR INSERT WITH CHECK (auth.uid() = user_id AND provenance = 'user');

-- Users may edit their own write-up's text, but not its moderation verdict.
DROP POLICY IF EXISTS interview_exp_update ON public.interview_experiences;
CREATE POLICY interview_exp_update ON public.interview_experiences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND provenance = 'user');
