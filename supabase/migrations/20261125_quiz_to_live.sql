-- ============================================================
-- ConnectToCampus — QUIZ → LIVE COMPETITION (P3)
--
-- The live engine is NOT rebuilt. `quiz_start_competition` is a thin
-- front door that reuses the existing `competitions` /
-- `competition_questions` / `competition_question_options` snapshot and
-- the existing realtime event log, so RoomPlayer, HostPanel, scoring,
-- reveal and leaderboard keep working untouched.
--
-- The only reason a new function is needed instead of calling
-- `live_quiz_create`: that function filters snapshot rows with
-- `q.created_by = v_me`. That is correct for hand-picked bank rows, but
-- wrong for a quiz — a host may legitimately run a forked or published
-- quiz whose bank rows are theirs (forks copy rows), and in every case
-- authorization is "can you view this quiz", not "do you own each row".
--
-- `quiz_id` is nullable and additive, so every existing competition and
-- every existing RPC keeps working unchanged.
-- ============================================================

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS quiz_id UUID REFERENCES public.quizzes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_competitions_quiz ON public.competitions (quiz_id);

CREATE OR REPLACE FUNCTION public.quiz_start_competition(
  p_quiz_id          UUID,
  p_title            TEXT DEFAULT NULL,
  p_timer_seconds    INT DEFAULT 20,
  p_points_correct   INT DEFAULT 100,
  p_max_speed_bonus  INT DEFAULT 20,
  p_max_participants INT DEFAULT 500,
  p_allow_late_join  BOOLEAN DEFAULT TRUE,
  p_visibility       TEXT DEFAULT 'code_only',
  p_scheduled_at     TIMESTAMPTZ DEFAULT NULL,
  p_reveal_answers   BOOLEAN DEFAULT TRUE
)
RETURNS public.competitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_quiz     public.quizzes;
  v_comp     public.competitions;
  v_q        RECORD;
  v_snap     UUID;
  v_pos      INT := 0;
  v_live     INT;
  v_max_live INT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_live_quiz_host(v_me) THEN
    RAISE EXCEPTION 'not allowed to host competitions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id;
  IF v_quiz.id IS NULL OR NOT public.can_view_quiz(v_quiz) THEN
    RAISE EXCEPTION 'quiz not found' USING ERRCODE = '02000';
  END IF;

  -- Running someone else's quiz is fine; editing or running a draft is not.
  IF v_quiz.status <> 'published' THEN
    RAISE EXCEPTION 'publish the quiz before hosting it' USING ERRCODE = '55000';
  END IF;

  IF v_quiz.question_count < 1 THEN
    RAISE EXCEPTION 'quiz has no questions' USING ERRCODE = '22023';
  END IF;

  v_max_live := greatest(public.quiz_setting('quiz.host.max_live_rooms', 3), 1);

  PERFORM pg_advisory_xact_lock(hashtextextended('live_quiz_host:' || v_me::text, 0));

  SELECT count(*) INTO v_live
  FROM public.competitions c
  WHERE c.host_id = v_me AND c.status IN ('draft', 'waiting', 'live', 'paused');

  IF v_live >= v_max_live THEN
    RAISE EXCEPTION 'room limit reached' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.competitions (
    host_id, title, category, room_code, status, visibility, quiz_id,
    default_timer_seconds, points_correct, max_speed_bonus, max_participants,
    allow_late_join, reveal_answers_after, scheduled_at
  ) VALUES (
    v_me,
    left(coalesce(nullif(btrim(p_title), ''), v_quiz.title), 140),
    coalesce(nullif(btrim(v_quiz.subject), ''), 'General'),
    public.live_quiz_new_room_code(),
    'waiting',
    CASE WHEN p_visibility IN ('public', 'code_only') THEN p_visibility ELSE 'code_only' END,
    v_quiz.id,
    LEAST(GREATEST(p_timer_seconds, 5), 300),
    LEAST(GREATEST(p_points_correct, 1), 1000),
    LEAST(GREATEST(p_max_speed_bonus, 0), 200),
    LEAST(GREATEST(p_max_participants, 1), 5000),
    p_allow_late_join, p_reveal_answers, p_scheduled_at
  ) RETURNING * INTO v_comp;

  -- Freeze the quiz into the competition snapshot; changes to the quiz
  -- after this point cannot affect a running room (or its results).
  FOR v_q IN
    SELECT q.*
    FROM public.quiz_questions qq
    JOIN public.question_bank q ON q.id = qq.question_id
    WHERE qq.quiz_id = v_quiz.id
    ORDER BY qq.position
  LOOP
    INSERT INTO public.competition_questions (
      competition_id, source_question_id, position, question_type,
      question_text, explanation, image_url, marks, time_limit_seconds
    ) VALUES (
      v_comp.id, v_q.id, v_pos, v_q.question_type,
      v_q.question_text, v_q.explanation, v_q.image_url, v_q.marks, v_q.time_limit_seconds
    ) RETURNING id INTO v_snap;

    INSERT INTO public.competition_question_options (
      competition_question_id, position, option_text, is_correct
    )
    SELECT v_snap, o.position, o.option_text, o.is_correct
    FROM public.question_bank_options o
    WHERE o.question_id = v_q.id
    ORDER BY o.position;

    v_pos := v_pos + 1;
  END LOOP;

  IF v_pos = 0 THEN
    -- nothing snapshot-able: roll the room back rather than ship an empty one
    DELETE FROM public.competitions WHERE id = v_comp.id;
    RAISE EXCEPTION 'quiz has no playable questions' USING ERRCODE = '22023';
  END IF;

  UPDATE public.competitions
  SET question_count = v_pos, updated_at = now()
  WHERE id = v_comp.id
  RETURNING * INTO v_comp;

  UPDATE public.quizzes
  SET play_count = play_count + 1
  WHERE id = v_quiz.id;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, 'competition_created',
          jsonb_build_object('title', v_comp.title, 'room_code', v_comp.room_code,
                             'question_count', v_comp.question_count,
                             'quiz_id', v_quiz.id));

  RETURN v_comp;
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_start_competition(UUID, TEXT, INT, INT, INT, INT, BOOLEAN, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_start_competition(UUID, TEXT, INT, INT, INT, INT, BOOLEAN, TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;
