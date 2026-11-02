-- ============================================================
-- Live Battle — HOST CONTROLS BELONG TO THE HOST
--
-- `live_quiz_room()` used to report `is_host` for the room's host AND for
-- any platform admin. The browser gates the control panel and the
-- "Open host controls" link on that flag alone, so an admin who was not
-- running the competition saw host controls for a room they never hosted.
--
-- Host controls are now visible only to the account that created the
-- competition (`competitions.host_id = auth.uid()`). Admin read access is
-- unchanged: an admin can still open the room to watch it, they are just
-- not treated as its host. Server-side moderation rights in
-- live_quiz_advance()/live_quiz_finalize() are also unchanged — see
-- 20261118_open_live_quiz_hosting.sql.
--
-- Idempotent, like every other migration in this repo.
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
    -- Host controls: only the account that hosted this competition.
    'is_host', (v_comp.host_id = v_me),
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
