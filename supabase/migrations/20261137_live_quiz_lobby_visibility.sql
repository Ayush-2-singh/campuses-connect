-- ============================================================
-- ConnectToCampus — WHO IS IN THE QUEUE
--
-- The waiting room showed only a head count, so players could not see
-- each other until the first leaderboard — the one place a quiz is
-- supposed to feel social. `live_quiz_roster` cannot be reused: it is
-- host-only on purpose and it carries scores, kicks and standings.
--
-- `live_quiz_lobby` is the player-facing view: names and join order for
-- anyone already in the room, never scores, never kicked rows, and no
-- access for someone who is not a member (a six-digit code alone does
-- not reveal the guest list).
--
-- Read-only, paginated by a hard cap of 500, idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.live_quiz_lobby(p_competition_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_member BOOLEAN;
  v_rows   JSONB;
  v_total  INT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.user_id = v_me AND p.is_kicked = FALSE
  ) INTO v_member;

  -- Members, the host and platform admins only. A code is not a guest list.
  IF NOT (v_member OR v_comp.host_id = v_me OR public.is_platform_admin(v_me)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  SELECT count(*) INTO v_total
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE;

  -- Names and join order only: no score, no rank, no kick flag.
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'participant_id', t.id,
             'display_name', t.display_name,
             'joined_at', t.joined_at,
             'is_me', t.user_id = v_me
           ) ORDER BY t.joined_at, t.id
         ), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT p.id, p.user_id, p.display_name, p.joined_at
    FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE
    ORDER BY p.joined_at, p.id
    LIMIT 500
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_comp.status,
    'total', v_total,
    'rows', v_rows
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_lobby(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_lobby(UUID) TO authenticated;
