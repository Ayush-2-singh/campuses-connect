-- ─────────────────────────────────────────────────────────────────────────────
-- 024 — Profile skills + avatar uploads
--   · profiles.skills            TEXT[] — skill tags used by the honest AI match
--   · storage bucket `avatars`   public-read, user-scoped uploads
-- ─────────────────────────────────────────────────────────────────────────────

-- Skills tags on profiles (drives the AI match against opportunity skills)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';

-- Short headline shown under the name (e.g. "Full-stack dev · SIH Finalist")
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS headline TEXT;

-- Opportunities can carry skill tags too — these power the honest AI match
-- against a student's profile skills. (Idempotent; the column may or may not
-- already exist depending on when the table was created.)
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS skills_required JSONB;

-- ── Storage: public `avatars` bucket ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Public read — anyone can view avatars (needed for feeds, profiles, talent)
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Users may upload/overwrite only their own avatar file: avatars/{user_id}/...
CREATE POLICY "avatars_upload_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
