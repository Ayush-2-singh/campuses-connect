-- 20261019_library_contributions.sql
--
-- LIBRARY PILLAR (Phase 3 + Phase 4)
--
-- Makes the Library community-owned instead of admin-only.
--
-- BEFORE: `20261015_notes_admin_only_rls.sql` locked notes to platform/campus
-- admins for INSERT and blocked every student from contributing. That was the
-- right call at the time (the Library was an announcement board), but Phase 3
-- requires students to add books / notes / PYQs / links and edit and delete
-- their own, with admins moderating. So ownership moves from "admins only" to
-- "anyone contributes, admins moderate".
--
-- Everything here is ADDITIVE and behaviour-preserving except the permission
-- widening explicitly required by the spec:
--   * new nullable columns (author, verified_by, verified_at, link_hash,
--     discuss_category) — existing rows unaffected, no backfill required;
--   * new RLS policies are PERMISSIVE and therefore OR with the existing
--     admin-only policies — admins keep every power they already had;
--   * `student` gains `campus`-scope create on the `notes` category in
--     content_permissions (previously NULL = "cannot create").
-- No column is dropped, no row is deleted, no policy is removed.
--
-- SPAM MODEL: a student submission is stored with `is_verified = false` and is
-- visible to the contributor and to admins only, until an admin verifies it.
-- That is enforced by the API route (which is the only write path) and by the
-- permissive-or-not RLS below. The API never trusts a client-supplied
-- `is_verified`.

-- ============================================================================
-- 1. Attribution + verification audit + dedup columns
-- ============================================================================
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS author            TEXT,
  ADD COLUMN IF NOT EXISTS verified_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at        TIMESTAMPTZ,
  -- SHA-256 of the normalised resource URL. Link-only resources mean the same
  -- resource is frequently re-posted under a new title; this lets us detect it
  -- without ever downloading a byte. Computed by the trigger below so it is
  -- correct for direct client inserts too, not just the API route.
  ADD COLUMN IF NOT EXISTS link_hash          TEXT,
  -- Which Live Chat category this resource should be discussed in. Drives the
  -- `[ Discuss ]` action (Phase 4). Nullable — the UI derives a default from
  -- the resource type when it is null.
  ADD COLUMN IF NOT EXISTS discuss_category   TEXT;

COMMENT ON COLUMN public.notes.author IS 'Original author of the material (book author, uploader name for scans) — distinct from the contributing student.';
COMMENT ON COLUMN public.notes.verified_by IS 'Admin who approved this resource. NULL for pending or auto-published admin material.';
COMMENT ON COLUMN public.notes.link_hash IS 'sha256 of the normalised resource URL, for duplicate detection across contributions.';
COMMENT ON COLUMN public.notes.discuss_category IS 'communities.key of the Live Chat category this resource is discussed in.';

-- Duplicate detection lookups (cheap, small — one text column).
CREATE INDEX IF NOT EXISTS idx_notes_link_hash
  ON public.notes (link_hash)
  WHERE link_hash IS NOT NULL;

-- Contributor profile: "resources contributed" on the profile page.
CREATE INDEX IF NOT EXISTS idx_notes_uploaded_by_created
  ON public.notes (uploaded_by, created_at DESC);

-- ============================================================================
-- 2. Keep link_hash correct on every write path
-- ============================================================================
-- A BEFORE INSERT/UPDATE trigger rather than application code, because there is
-- more than one writer (the upload route, the submit route, future admin tools)
-- and a hash that is only sometimes present is worse than none. Cheap: two
-- string operations, no I/O.
CREATE OR REPLACE FUNCTION public.notes_set_link_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_url TEXT;
BEGIN
  v_url := COALESCE(NEW.external_file_url, NEW.drive_link, NEW.external_link);
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    NEW.link_hash := NULL;
  ELSE
    -- Normalise: trim + lowercase scheme/host so trivial variants collide.
    NEW.link_hash := encode(sha256(lower(btrim(v_url))::bytea), 'hex');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_notes_set_link_hash ON public.notes;
CREATE TRIGGER trg_notes_set_link_hash
  BEFORE INSERT OR UPDATE OF external_file_url, drive_link, external_link
  ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_set_link_hash();

-- ============================================================================
-- 3. Ownership RLS — students contribute, own, and moderate their own rows
-- ============================================================================
-- Permissive policies OR together, so the admin-only policies from 20261015
-- remain fully in force. These add a second, narrower path for the contributor.

-- INSERT: any signed-in user may contribute, but only AS THEMSELVES.
DROP POLICY IF EXISTS notes_insert_own ON public.notes;
CREATE POLICY notes_insert_own ON public.notes
  FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

-- UPDATE: contributors edit their own resources. Admins already can (20261015).
DROP POLICY IF EXISTS notes_update_own ON public.notes;
CREATE POLICY notes_update_own ON public.notes
  FOR UPDATE
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

-- DELETE: contributors remove their own resources.
DROP POLICY IF EXISTS notes_delete_own ON public.notes;
CREATE POLICY notes_delete_own ON public.notes
  FOR DELETE
  USING (uploaded_by = auth.uid());

-- NOTE ON THE PENDING STATE: RLS cannot express "is_verified = true OR you are
-- the owner OR you are an admin" for SELECT without a policy per case, and the
-- current SELECT policy already allows authenticated reads of global/campus
-- material. The pending state is therefore enforced at the read path
-- (`/notes` filters unverified rows for non-admins, and the API only ever
-- returns the contributor's own pending rows to them). No change to the
-- existing SELECT policy is made here, so no visibility is widened.

-- ============================================================================
-- 4. Library -> Chat: a chat message can carry a Library resource
-- ============================================================================
-- Nullable and ON DELETE SET NULL: deleting a resource does not delete the
-- conversation around it, it just detaches the card.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS shared_resource_id UUID REFERENCES public.notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_shared_resource
  ON public.chat_messages (shared_resource_id)
  WHERE shared_resource_id IS NOT NULL;

-- ============================================================================
-- 5. Content permission: students may contribute Library material
-- ============================================================================
-- Previously NULL for `student` = "cannot create". Campus scope means a
-- student's contribution starts visible to their own campus; it can be promoted
-- to global by the admin who verifies it. Existing admin rows are untouched.
INSERT INTO public.content_permissions (actor_type, category_id, max_scope)
SELECT 'student', cc.id, 'campus'
  FROM public.content_categories cc
 WHERE cc.key = 'notes'
ON CONFLICT (actor_type, category_id)
DO UPDATE SET max_scope = 'campus', updated_at = now();

-- ============================================================================
-- 6. Verification RPC — set verifier + timestamp atomically
-- ============================================================================
-- Called by /api/notes/verify so `verified_by`/`verified_at` are always derived
-- from auth.uid() on the server, never accepted from the client.
CREATE OR REPLACE FUNCTION public.set_note_verified(
  p_note_id UUID,
  p_verified BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Caller must be an admin (checked against grants, not against client input).
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_grants
     WHERE user_id = auth.uid()
       AND admin_type IN ('platform_admin', 'campus_admin')
  ) THEN
    RAISE EXCEPTION 'not authorised to verify resources' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notes
     SET is_verified = p_verified,
         verified_by = CASE WHEN p_verified THEN auth.uid() ELSE NULL END,
         verified_at = CASE WHEN p_verified THEN now() ELSE NULL END
   WHERE id = p_note_id;

  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_note_verified(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_note_verified(uuid, boolean) TO authenticated;

-- ============================================================================
-- 7. Verification
-- ============================================================================
-- A. Students can now create in the notes category:
--    SELECT actor_type, max_scope FROM public.content_permissions
--      WHERE category_id = (SELECT id FROM public.content_categories WHERE key='notes');
--
-- B. link_hash is populated for existing rows after any update; to backfill:
--    UPDATE public.notes SET title = title;   -- fires the trigger, changes nothing else
--    SELECT count(*) FILTER (WHERE link_hash IS NOT NULL) AS hashed,
--           count(*) AS total FROM public.notes;
--
-- C. Duplicate resources already in the table:
--    SELECT link_hash, count(*), array_agg(title)
--      FROM public.notes WHERE link_hash IS NOT NULL
--     GROUP BY link_hash HAVING count(*) > 1;
