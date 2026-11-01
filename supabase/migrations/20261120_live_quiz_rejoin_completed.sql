-- ============================================================
-- Live Battle — let EXISTING participants back into a finished room
--
-- live_quiz_join() rejected `completed` rooms before it looked up the
-- participant row, so anyone who reloaded the results page got "room
-- finished" and could never see the final board or their own rank.
-- A finished room stays closed to newcomers; players already in it can
-- still rejoin and read the result.
-- ============================================================

CREATE OR REPLACE FUNCTION public.live_quiz_join(p_room_code TEXT, p_display_name TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_count  INT;
  v_name   TEXT;
  v_part   public.competition_participants;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE room_code = btrim(p_room_code);
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Participants already in the room first: a reload must never be turned away.
  SELECT * INTO v_part
  FROM public.competition_participants
  WHERE competition_id = v_comp.id AND user_id = v_me;

  IF v_part.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'competition_id', v_comp.id, 'room_code', v_comp.room_code,
      'status', v_comp.status, 'rejoined', true,
      'participant_id', v_part.id, 'score', v_part.score
    );
  END IF;

  IF v_comp.status IN ('draft', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_closed');
  END IF;
  IF v_comp.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_finished');
  END IF;
  IF v_comp.status = 'live' AND NOT v_comp.allow_late_join THEN
    RETURN jsonb_build_object('ok', false, 'error', 'late_join_disabled');
  END IF;

  SELECT count(*) INTO v_count
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE;

  IF v_count >= v_comp.max_participants THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_full');
  END IF;

  SELECT coalesce(nullif(btrim(p_display_name), ''), pr.full_name, pr.username)
  INTO v_name
  FROM public.profiles pr
  WHERE pr.id = v_me;

  v_name := left(coalesce(v_name, 'Student'), 40);

  INSERT INTO public.competition_participants (competition_id, user_id, display_name)
  VALUES (v_comp.id, v_me, v_name)
  RETURNING * INTO v_part;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, 'participant_joined',
          jsonb_build_object('display_name', v_name, 'participants', v_count + 1));

  RETURN jsonb_build_object(
    'ok', true, 'competition_id', v_comp.id, 'room_code', v_comp.room_code,
    'status', v_comp.status, 'rejoined', false,
    'participant_id', v_part.id, 'display_name', v_name, 'participants', v_count + 1
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT) TO authenticated;
