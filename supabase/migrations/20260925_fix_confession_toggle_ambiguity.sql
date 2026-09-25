-- 20260925_fix_confession_toggle_ambiguity.sql
--
-- FIX: every confession heart toggle failed at runtime.
--
-- `RETURNS TABLE (reacted BOOLEAN, reaction_count INT)` creates an implicit
-- OUT variable named `reaction_count`. The function body then referenced the
-- unqualified name `reaction_count` inside the UPDATE expressions, and plpgsql
-- could not tell the OUT variable apart from public.confessions.reaction_count:
--
--   ERROR: column reference "reaction_count" is ambiguous
--
-- So every heart click threw, the UI's optimistic bump was reverted on error,
-- and counts never moved. The fix qualifies the column references
-- (confessions.reaction_count) — qualified names are never substituted with
-- plpgsql variables. The RPC's return shape ({reacted, reaction_count}) is
-- unchanged.

CREATE OR REPLACE FUNCTION public.toggle_confession_reaction(p_confession_id UUID)
RETURNS TABLE (reacted BOOLEAN, reaction_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_reacted BOOLEAN;
  v_count INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Only visible confessions can be reacted to.
  IF NOT EXISTS (
    SELECT 1 FROM public.confessions WHERE id = p_confession_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'confession not available';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.confession_reactions
     WHERE confession_id = p_confession_id AND user_id = v_user
  ) THEN
    DELETE FROM public.confession_reactions
     WHERE confession_id = p_confession_id AND user_id = v_user;
    UPDATE public.confessions
       SET reaction_count = GREATEST(confessions.reaction_count - 1, 0)
     WHERE id = p_confession_id
     RETURNING confessions.reaction_count INTO v_count;
    v_reacted := FALSE;
  ELSE
    INSERT INTO public.confession_reactions (confession_id, user_id)
    VALUES (p_confession_id, v_user);
    UPDATE public.confessions
       SET reaction_count = confessions.reaction_count + 1
     WHERE id = p_confession_id
     RETURNING confessions.reaction_count INTO v_count;
    v_reacted := TRUE;
  END IF;

  RETURN QUERY SELECT v_reacted, COALESCE(v_count, 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.toggle_confession_reaction(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_confession_reaction(UUID) TO authenticated;
