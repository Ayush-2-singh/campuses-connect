-- ============================================================
-- ConnectToCampus — QUESTION WINDOW, REVEAL, ROSTER, KICK
--
-- A. QUESTION ENDED STATE
--    The window used to be derived from `current_started_at + limit`, which
--    meant "paused" and "window over" were indistinguishable to the reveal
--    RPC. Two concrete failures:
--      • resume reset `current_started_at`, so a pause handed out a brand-new
--        answer window (and erased time already spent);
--      • while `paused`, `live_quiz_reveal` refused only for status 'live', so
--        the answer key could be fetched during a pause and then used after
--        the resume reopened the same question.
--
--    `window_ends_at` is now the single authority for the deadline, and
--    `paused_remaining_ms` freezes exactly what was left when the host paused.
--    Resume shifts the window by that remainder, `current_started_at` is
--    back-dated so the speed bonus still measures total elapsed time, and
--    reveal refuses for BOTH 'live' and 'paused' until the window is over.
--
--    Once the deadline passes the room stays 'live' but the window is closed:
--    `live_quiz_reveal` then hands out the key, which is the gap the player
--    screen uses to show "correct answer + refreshed board" before the host
--    opens the next question.
--
-- B. NEXT WHILE PAUSED
--    The host panel shows "Next question" in both states, but the RPC only
--    accepted 'live'. It now accepts 'live' or 'paused'.
--
-- C. ROSTER + KICK
--    `live_quiz_roster` is host/admin only. `live_quiz_kick` sets the
--    existing `is_kicked` flag, logs a `participant_kicked` event, and the
--    join RPC refuses a kicked row (see 20261134), so removal sticks.
--    `live_quiz_room` now reports `is_kicked` so a removed player's open tab
--    leaves the room instead of silently showing an empty waiting room.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS,
-- CREATE OR REPLACE. No existing row, table or policy is dropped.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Window columns
-- ------------------------------------------------------------
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS window_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_remaining_ms INT;

-- ------------------------------------------------------------
-- 1. Event vocabulary: a kick is a room event like any other
-- ------------------------------------------------------------
ALTER TABLE public.competition_events
  DROP CONSTRAINT IF EXISTS competition_events_event_type_check;

ALTER TABLE public.competition_events
  ADD CONSTRAINT competition_events_event_type_check CHECK (event_type IN (
    'competition_created', 'participant_joined', 'participant_kicked',
    'competition_started', 'question_started', 'question_ended',
    'leaderboard_updated', 'competition_paused', 'competition_resumed',
    'competition_completed', 'competition_cancelled'
  ));

-- ------------------------------------------------------------
-- 2. HOST CONTROLS — window-aware start / next / pause / resume
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_advance(p_competition_id UUID, p_action TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me           UUID := auth.uid();
  v_comp         public.competitions;
  v_next         INT;
  v_event        TEXT;
  v_limit        INT;
  v_limit_ms     INT;
  v_remaining_ms INT;
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RAISE EXCEPTION 'competition not found' USING ERRCODE = '02000'; END IF;
  IF v_comp.host_id <> v_me AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only the host can control this competition' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'start' THEN
    IF v_comp.status NOT IN ('waiting', 'draft') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_started');
    END IF;
    IF v_comp.question_count = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_questions');
    END IF;
    v_next := 0;
    SELECT q.time_limit_seconds INTO v_limit
    FROM public.competition_questions q
    WHERE q.competition_id = v_comp.id AND q.position = v_next;

    v_event := 'competition_started';
    UPDATE public.competitions
    SET status = 'live', started_at = now(), current_position = v_next,
        current_started_at = now(),
        window_ends_at = now() + (coalesce(v_limit, v_comp.default_timer_seconds) || ' seconds')::INTERVAL,
        paused_remaining_ms = NULL, updated_at = now()
    WHERE id = v_comp.id;

  ELSIF p_action = 'next' THEN
    -- Paused is accepted: the panel offers "Next question" in both states and
    -- moving on is a deliberate host action, not a state error.
    IF v_comp.status NOT IN ('live', 'paused') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_live');
    END IF;
    v_next := v_comp.current_position + 1;
    IF v_next >= v_comp.question_count THEN
      RETURN public.live_quiz_finalize(v_comp.id);
    END IF;
    SELECT q.time_limit_seconds INTO v_limit
    FROM public.competition_questions q
    WHERE q.competition_id = v_comp.id AND q.position = v_next;

    v_event := 'question_started';
    UPDATE public.competitions
    SET status = 'live', current_position = v_next, current_started_at = now(),
        window_ends_at = now() + (coalesce(v_limit, v_comp.default_timer_seconds) || ' seconds')::INTERVAL,
        paused_remaining_ms = NULL, updated_at = now()
    WHERE id = v_comp.id;

  ELSIF p_action = 'pause' THEN
    IF v_comp.status <> 'live' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_live'); END IF;
    -- Freeze exactly what is left; a pause can neither eat nor grant time.
    v_remaining_ms := greatest(0, ceil(extract(epoch FROM (
      coalesce(v_comp.window_ends_at, now()) - now()
    )) * 1000)::INT);
    v_event := 'competition_paused';
    UPDATE public.competitions
    SET status = 'paused', paused_remaining_ms = v_remaining_ms, updated_at = now()
    WHERE id = v_comp.id;
    v_next := v_comp.current_position;

  ELSIF p_action = 'resume' THEN
    IF v_comp.status <> 'paused' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_paused'); END IF;

    SELECT q.time_limit_seconds * 1000 INTO v_limit_ms
    FROM public.competition_questions q
    WHERE q.competition_id = v_comp.id AND q.position = v_comp.current_position;
    v_limit_ms := coalesce(v_limit_ms, v_comp.default_timer_seconds * 1000);
    v_remaining_ms := least(coalesce(v_comp.paused_remaining_ms, v_limit_ms), v_limit_ms);

    v_event := 'competition_resumed';
    -- Back-date the start so the speed bonus still measures total elapsed time,
    -- and end the window after exactly the remaining time.
    UPDATE public.competitions
    SET status = 'live',
        current_started_at = now() - ((v_limit_ms - v_remaining_ms) || ' milliseconds')::INTERVAL,
        window_ends_at = now() + (v_remaining_ms || ' milliseconds')::INTERVAL,
        paused_remaining_ms = NULL, updated_at = now()
    WHERE id = v_comp.id;
    v_next := v_comp.current_position;

  ELSIF p_action = 'end' THEN
    RETURN public.live_quiz_finalize(v_comp.id);

  ELSIF p_action = 'cancel' THEN
    v_event := 'competition_cancelled';
    UPDATE public.competitions
    SET status = 'cancelled', ended_at = now(), paused_remaining_ms = NULL, updated_at = now()
    WHERE id = v_comp.id;
    v_next := v_comp.current_position;

  ELSE
    RAISE EXCEPTION 'unknown action %', p_action USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, v_event,
          jsonb_build_object('position', v_next, 'question_count', v_comp.question_count));

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'position', v_next, 'status',
    (SELECT status FROM public.competitions WHERE id = v_comp.id));
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_advance(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_advance(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 3. CURRENT QUESTION — deadline is the window, open only while it lasts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_question(p_competition_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_q      public.competition_questions;
  v_member BOOLEAN;
  v_open   BOOLEAN;
  v_ends   TIMESTAMPTZ;
  v_opts   JSONB;
  v_mine   public.competition_answers;
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.user_id = v_me AND p.is_kicked = FALSE
  ) INTO v_member;

  IF NOT (v_member OR v_comp.host_id = v_me OR public.is_platform_admin(auth.uid())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  SELECT * INTO v_q
  FROM public.competition_questions q
  WHERE q.competition_id = v_comp.id AND q.position = v_comp.current_position;

  IF v_q.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', v_comp.status, 'question', NULL);
  END IF;

  v_ends := coalesce(
    v_comp.window_ends_at,
    v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL
  );

  v_open := v_comp.status = 'live' AND v_ends IS NOT NULL AND now() < v_ends;

  -- Options never carry is_correct while the window is open.
  SELECT coalesce(jsonb_agg(jsonb_build_object('position', o.position, 'text', o.option_text)
                            ORDER BY o.position), '[]'::jsonb)
  INTO v_opts
  FROM public.competition_question_options o
  WHERE o.competition_question_id = v_q.id;

  -- `a.*` only: a joined row would not match the composite variable's shape.
  SELECT a.* INTO v_mine
  FROM public.competition_answers a
  JOIN public.competition_participants p ON p.id = a.participant_id
  WHERE a.competition_question_id = v_q.id AND p.user_id = v_me;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_comp.status,
    'position', v_q.position,
    'total', v_comp.question_count,
    'question', jsonb_build_object(
      'text', v_q.question_text,
      'type', v_q.question_type,
      'image_url', v_q.image_url,
      'marks', v_q.marks,
      'time_limit_seconds', v_q.time_limit_seconds
    ),
    'options', v_opts,
    -- Returned even after it has passed: that is how the client knows the
    -- window closed and asks for the key instead of guessing from status.
    'deadline', CASE WHEN v_comp.status IN ('live', 'paused') THEN to_jsonb(v_ends) ELSE NULL END,
    'answered', v_mine.id IS NOT NULL
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_question(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_question(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. ANSWER — same window authority
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_answer(
  p_competition_id UUID,
  p_positions      INT[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_comp      public.competitions;
  v_q         public.competition_questions;
  v_part      public.competition_participants;
  v_deadline  TIMESTAMPTZ;
  v_response  INT;
  v_correct   INT[];
  v_selected  INT[];
  v_is_right  BOOLEAN;
  v_bonus     INT;
  v_points    INT;
  v_answered  INT;
  v_inserted  INT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_comp.status <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;

  SELECT * INTO v_part
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.user_id = v_me AND p.is_kicked = FALSE;
  IF v_part.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  SELECT * INTO v_q
  FROM public.competition_questions q
  WHERE q.competition_id = v_comp.id AND q.position = v_comp.current_position;
  IF v_q.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_question');
  END IF;

  v_deadline := coalesce(
    v_comp.window_ends_at,
    v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL
  );
  IF v_comp.current_started_at IS NULL OR v_deadline IS NULL OR now() >= v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed');
  END IF;

  -- Cheapest possible duplicate rejection; ON CONFLICT below is the
  -- authoritative one. This early return keeps the common sequential
  -- double-click from doing any scoring work at all.
  IF EXISTS (
    SELECT 1 FROM public.competition_answers a
    WHERE a.competition_question_id = v_q.id AND a.participant_id = v_part.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_answered');
  END IF;

  SELECT coalesce(array_agg(o.position ORDER BY o.position), '{}')
  INTO v_correct
  FROM public.competition_question_options o
  WHERE o.competition_question_id = v_q.id AND o.is_correct;

  SELECT coalesce(array_agg(DISTINCT pos ORDER BY pos), '{}')
  INTO v_selected
  FROM unnest(coalesce(p_positions, '{}')) AS pos
  WHERE pos BETWEEN 0 AND 3;

  v_is_right := (v_selected = v_correct);
  v_response := GREATEST(0, LEAST(v_q.time_limit_seconds * 1000,
                   ROUND(EXTRACT(EPOCH FROM (now() - v_comp.current_started_at)) * 1000)::INT));
  v_bonus  := public.live_quiz_speed_bonus(v_response, v_q.time_limit_seconds * 1000, v_comp.max_speed_bonus);
  v_points := CASE WHEN v_is_right THEN v_q.marks + v_bonus ELSE 0 END;

  INSERT INTO public.competition_answers (
    competition_id, competition_question_id, participant_id,
    selected_positions, is_correct, points, response_ms
  ) VALUES (
    v_comp.id, v_q.id, v_part.id, v_selected, v_is_right, v_points, v_response
  )
  ON CONFLICT (competition_question_id, participant_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Lost the race: the other request already scored this question.
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_answered');
  END IF;

  UPDATE public.competition_participants
  SET score = score + v_points,
      correct_count = correct_count + CASE WHEN v_is_right THEN 1 ELSE 0 END,
      answered_count = answered_count + 1,
      total_response_ms = total_response_ms + v_response
  WHERE id = v_part.id;

  SELECT count(*) INTO v_answered
  FROM public.competition_answers a
  WHERE a.competition_question_id = v_q.id;

  RETURN jsonb_build_object('ok', true, 'accepted', true, 'answered_count', v_answered);
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_answer(UUID, INT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_answer(UUID, INT[]) TO authenticated;

-- ------------------------------------------------------------
-- 5. REVEAL — no key while the window runs, including during a pause
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_reveal(p_competition_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_q      public.competition_questions;
  v_member BOOLEAN;
  v_ends   TIMESTAMPTZ;
  v_key    INT[];
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT v_comp.reveal_answers_after THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reveal_disabled');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.user_id = v_me AND p.is_kicked = FALSE
  ) INTO v_member;

  IF NOT (v_member OR v_comp.host_id = v_me OR public.is_platform_admin(auth.uid())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  SELECT * INTO v_q
  FROM public.competition_questions q
  WHERE q.competition_id = v_comp.id AND q.position = v_comp.current_position;
  IF v_q.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_question'); END IF;

  v_ends := coalesce(
    v_comp.window_ends_at,
    v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL
  );

  -- Still open → refuse. 'paused' is included on purpose: the clock is frozen,
  -- so the window has NOT ended and a key fetched now would be usable after
  -- the resume reopens the same question.
  IF v_comp.status IN ('live', 'paused') AND (v_ends IS NULL OR v_ends > now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_still_open');
  END IF;

  SELECT coalesce(array_agg(o.position ORDER BY o.position), '{}')
  INTO v_key
  FROM public.competition_question_options o
  WHERE o.competition_question_id = v_q.id AND o.is_correct;

  RETURN jsonb_build_object(
    'ok', true,
    'question_id', v_q.id,
    'position', v_q.position,
    'correct_positions', v_key,
    'explanation', v_q.explanation
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_reveal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_reveal(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. ROOM — tell a removed player they were removed
-- ------------------------------------------------------------
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
    'is_kicked', coalesce(v_mine.is_kicked, FALSE),
    'my_score', coalesce(v_mine.score, 0),
    'allow_late_join', v_comp.allow_late_join,
    'youtube_url', v_comp.youtube_url,
    'started_at', v_comp.started_at,
    'ended_at', v_comp.ended_at
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_room(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_room(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 7. ROSTER — host/admin only, paginated, ordered by standing
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_roster(
  p_competition_id UUID,
  p_limit          INT DEFAULT 200,
  p_offset         INT DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_comp  public.competitions;
  v_limit INT := LEAST(GREATEST(coalesce(p_limit, 200), 1), 500);
  v_off   INT := GREATEST(coalesce(p_offset, 0), 0);
  v_total INT;
  v_rows  JSONB;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_comp.host_id <> v_me AND NOT public.is_platform_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;

  SELECT count(*) INTO v_total
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT p.id AS participant_id, p.display_name, p.score,
           p.correct_count, p.answered_count, p.is_kicked, p.joined_at
    FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id
    ORDER BY p.is_kicked, p.score DESC, p.joined_at
    LIMIT v_limit OFFSET v_off
  ) t;

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'rows', v_rows);
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_roster(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_roster(UUID, INT, INT) TO authenticated;

-- ------------------------------------------------------------
-- 8. KICK — host/admin only; the join RPC refuses a kicked row
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_kick(
  p_competition_id UUID,
  p_participant_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_comp  public.competitions;
  v_part  public.competition_participants;
  v_count INT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_comp.host_id <> v_me AND NOT public.is_platform_admin(v_me) THEN
    RAISE EXCEPTION 'only the host can moderate this competition' USING ERRCODE = '42501';
  END IF;

  UPDATE public.competition_participants p
  SET is_kicked = TRUE
  WHERE p.id = p_participant_id AND p.competition_id = v_comp.id
  RETURNING * INTO v_part;

  IF v_part.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*) INTO v_count
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, 'participant_kicked',
          jsonb_build_object('participant_id', v_part.id, 'display_name', v_part.display_name,
                             'participants', v_count));

  RETURN jsonb_build_object(
    'ok', true,
    'participant_id', v_part.id,
    'display_name', v_part.display_name,
    'participants', v_count
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_kick(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_kick(UUID, UUID) TO authenticated;
