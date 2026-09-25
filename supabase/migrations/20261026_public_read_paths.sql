-- 20261026_public_read_paths.sql
--
-- PUBLIC-FIRST READ PATHS (final UX spec, rules 1 & 4).
--
-- 1. can_view_note: anonymous visitors were blocked from ALL notes, even
--    visibility='global' ones ("read and explore without login"). Anonymous
--    callers can now read global-visibility notes only; campus/college-scoped
--    notes still require a signed-in profile with matching scope. The
--    campus_content_to_global master switch still opens everything when set.
--    (Currently 0 global notes exist, so this exposes no existing data.)
--
-- 2. get_enhanced_leaderboard: public rankings are browsable logged-out
--    (spec: public leaderboard). The function was already being called
--    successfully by anon via its default PUBLIC execute — this re-asserts
--    the grant explicitly after any future CREATE OR REPLACE, and documents
--    the intent.
--
-- NOTHING here weakens write paths. ADDITIVE ONLY. Idempotent.

CREATE OR REPLACE FUNCTION public.can_view_note(p_note notes)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
        v_prof RECORD;
BEGIN
  -- Global resources are publicly readable — browse without login (spec rule 1).
  IF p_note.visibility = 'global' THEN RETURN TRUE; END IF;

  IF (SELECT value FROM public.app_settings WHERE key = 'campus_content_to_global') = 'true' THEN
    RETURN TRUE;
  END IF;

  -- Scoped notes need a signed-in profile with a matching scope.
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  SELECT campus_id, college_id INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF v_prof IS NULL THEN RETURN FALSE; END IF;
  IF v_prof.campus_id IS NULL AND v_prof.college_id IS NULL THEN RETURN FALSE; END IF;

  RETURN (p_note.campus_id IS NOT NULL AND v_prof.campus_id = p_note.campus_id)
      OR (p_note.campus_id IS NULL AND p_note.college_id IS NOT NULL AND v_prof.college_id = p_note.college_id)
      OR (p_note.campus_id IS NULL AND p_note.college_id IS NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.can_view_note(public.notes) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_note(public.notes) TO authenticated, anon;

-- Public leaderboard stays browsable logged-out.
GRANT EXECUTE ON FUNCTION public.get_enhanced_leaderboard(UUID, INT, TEXT) TO anon;
