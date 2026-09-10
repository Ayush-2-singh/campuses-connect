-- 033: open interaction on the Global layer
--
-- Community posts are created with scope = 'global' (see PostComposer), so
-- they surface in the Global feed where every student can read them — but
-- can_interact_post() still demanded community membership, so non-members got
-- a silent 403 on Like / Comment. A post that is visible on the public Global
-- layer should be interactable by any signed-in student.
--
-- Membership gates stay for community posts that are NOT global-scoped (e.g. a
-- campus/college-scoped post inside a private community).

CREATE OR REPLACE FUNCTION public.can_interact_post(p_post public.posts)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.can_view_post(p_post) THEN RETURN FALSE; END IF;
  -- Posts on the public Global layer are open to every signed-in student.
  IF p_post.scope = 'global' THEN RETURN TRUE; END IF;
  -- Non-global community posts: only members may interact.
  IF p_post.community_id IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.community_members
                   WHERE community_id = p_post.community_id AND user_id = v_uid);
  END IF;
  RETURN TRUE;
END;
$function$;
