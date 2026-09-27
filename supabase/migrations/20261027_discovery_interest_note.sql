-- 20261027_discovery_interest_note.sql
--
-- INTEREST PITCH — when someone marks an idea "interested", they can attach a
-- short note explaining who they are and why they fit. The author of a startup
-- or hackathon post then sees that pitch in the Interests inbox, alongside a
-- link to the applicant's profile, instead of a bare "@username".
--
-- ADDITIVE ONLY. Idempotent. Safe to re-run.
--
--   * discovery_interests gains a nullable `note` (max 500 chars).
--   * record_discovery_action(UUID, TEXT) keeps its signature (so the existing
--     REVOKE/GRANT from 20261025 stays valid) and now delegates to the new
--     3-arg implementation, which also persists the note.
--   * Both overloads stay auth-only; interests still have no client write
--     policies, so a forged insert/update cannot slip a note in.

-- ============================================================================
-- 1. note column + length guard
-- ============================================================================
ALTER TABLE public.discovery_interests
  ADD COLUMN IF NOT EXISTS note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.discovery_interests'::regclass
      AND conname  = 'discovery_interests_note_len'
  ) THEN
    ALTER TABLE public.discovery_interests
      ADD CONSTRAINT discovery_interests_note_len
      CHECK (note IS NULL OR char_length(note) <= 500);
  END IF;
END $$;

-- ============================================================================
-- 2. 3-arg implementation with the note (full body from 20261024 + note)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_discovery_action(
  p_post_id UUID,
  p_action  TEXT,
  p_note    TEXT
)
RETURNS TABLE (matched BOOLEAN, connection_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user   UUID := auth.uid();
  v_action TEXT := btrim(COALESCE(p_action, ''));
  v_note   TEXT := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
  v_post   RECORD;
  v_row    RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_action NOT IN ('interested', 'passed') THEN
    RAISE EXCEPTION 'action must be interested or passed';
  END IF;
  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id required';
  END IF;

  SELECT * INTO v_post FROM public.discovery_posts
   WHERE id = p_post_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_post.author_id = v_user THEN
    RAISE EXCEPTION 'cannot act on your own post';
  END IF;

  -- Idempotent: one logical action per (post, user). A pass followed by an
  -- interested swipe upgrades the row; a later note-only change also lands.
  -- A pass never carries a pitch, so the note is only stored on 'interested'.
  INSERT INTO public.discovery_interests (post_id, user_id, action, note)
  VALUES (
    p_post_id, v_user, v_action,
    CASE WHEN v_action = 'interested' THEN v_note ELSE NULL END
  )
  ON CONFLICT (post_id, user_id) DO UPDATE
    SET action = EXCLUDED.action,
        note = CASE
                 WHEN EXCLUDED.action = 'interested'
                   THEN COALESCE(EXCLUDED.note, discovery_interests.note)
                 ELSE NULL
               END,
        updated_at = now()
    WHERE discovery_interests.action <> EXCLUDED.action
       OR (EXCLUDED.note IS NOT NULL
           AND discovery_interests.note IS DISTINCT FROM EXCLUDED.note);

  SELECT * INTO v_row FROM public.discovery_interests
   WHERE post_id = p_post_id AND user_id = v_user;

  IF v_action = 'interested' THEN
    UPDATE public.discovery_posts
       SET interested_count = (
             SELECT COUNT(*) FROM public.discovery_interests
              WHERE post_id = p_post_id AND action = 'interested'
           )
     WHERE id = p_post_id;

    PERFORM public.create_notification(
      v_post.author_id,
      'discovery_interest',
      'Someone is interested in your idea: ' || v_post.title,
      NULL, 'discovery_post', p_post_id
    );
  END IF;

  RETURN QUERY SELECT FALSE, NULL::UUID, v_row.status;
END;
$fn$;

-- ============================================================================
-- 3. Keep the 2-arg signature, delegating to the 3-arg (backward compatible)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_discovery_action(
  p_post_id UUID,
  p_action  TEXT
)
RETURNS TABLE (matched BOOLEAN, connection_id UUID, status TEXT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT * FROM public.record_discovery_action(p_post_id, p_action, NULL::TEXT);
$fn$;

-- Grants: both overloads are authenticated-only.
REVOKE ALL ON FUNCTION public.record_discovery_action(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discovery_action(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_discovery_action(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discovery_action(UUID, TEXT, TEXT) TO authenticated;
