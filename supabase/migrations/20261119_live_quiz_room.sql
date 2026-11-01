-- ============================================================
-- Live Battle — ROOM STATE
--
-- A participant needs the room's title, status and participant count,
-- but `competitions` is only readable by its host (plus public rooms).
-- Rather than widening that policy, participants get exactly the
-- fields a room screen needs through one membership-gated function:
-- you must be the host, an admin, or already joined.
-- ============================================================

CREATE OR REPLACE FUNCTION public.live_quiz_room(p_competition_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_mine   public.competition_participants;
  v_count  INT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_comp FROM public.competitions c WHERE c.id = p_competition_id;
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO v_mine
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.user_id = v_me;

  IF v_mine.id IS NULL
     AND v_comp.host_id <> v_me
     AND NOT public.is_platform_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  SELECT count(*) INTO v_count
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_comp.id,
    'room_code', v_comp.room_code,
    'title', v_comp.title,
    'category', v_comp.category,
    'status', v_comp.status,
    'visibility', v_comp.visibility,
    'question_count', v_comp.question_count,
    'position', v_comp.current_position,
    'participants', v_count,
    'is_host', (v_comp.host_id = v_me OR public.is_platform_admin(v_me)),
    'joined', v_mine.id IS NOT NULL,
    'my_score', coalesce(v_mine.score, 0),
    'allow_late_join', v_comp.allow_late_join,
    'youtube_url', v_comp.youtube_url,
    'started_at', v_comp.started_at,
    'ended_at', v_comp.ended_at
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_room(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_room(UUID) TO authenticated;
