-- ============================================================
-- ConnectToCampus — SELF-PACED PRACTICE MODE (P4)
--
-- Separate from the live engine on purpose: a solo learner must not
-- occupy a participant slot, appear in a leaderboard, or create
-- realtime traffic on `competition_events`. Practice therefore uses its
-- own two tables and never touches `competition_*`.
--
-- Answer-key handling: the attempt start payload carries question and
-- option TEXT only. `is_correct` and `explanation` are returned by
-- `quiz_attempt_answer` for a question the caller has just answered, so
-- the key cannot be harvested by starting an attempt.
--
-- Idempotent; applied as one transaction.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id        UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'abandoned')),
  score          INT NOT NULL DEFAULT 0 CHECK (score >= 0),
  correct_count  INT NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  answered_count INT NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
  question_total INT NOT NULL DEFAULT 0 CHECK (question_total >= 0),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user
  ON public.quiz_attempts (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz
  ON public.quiz_attempts (quiz_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.quiz_attempt_answers (
  attempt_id         UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id        UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  selected_positions INT[] NOT NULL DEFAULT '{}',
  is_correct         BOOLEAN NOT NULL DEFAULT FALSE,
  points             INT NOT NULL DEFAULT 0 CHECK (points >= 0),
  answered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_attempt
  ON public.quiz_attempt_answers (attempt_id);

ALTER TABLE public.quiz_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempt_answers ENABLE ROW LEVEL SECURITY;

-- A learner sees exactly their own attempts, and reads only.
DROP POLICY IF EXISTS quiz_attempts_owner_read ON public.quiz_attempts;
CREATE POLICY quiz_attempts_owner_read ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS quiz_attempt_answers_owner_read ON public.quiz_attempt_answers;
CREATE POLICY quiz_attempt_answers_owner_read ON public.quiz_attempt_answers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quiz_attempts a
      WHERE a.id = quiz_attempt_answers.attempt_id AND a.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE policy at all: attempts are created and scored only
-- by the SECURITY DEFINER functions below, so score and is_correct can
-- never be written by a client.

-- ------------------------------------------------------------
-- Start — returns the paper, minus the answers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_attempt_start(p_quiz_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_quiz    public.quizzes;
  v_attempt public.quiz_attempts;
  v_total   INT;
  v_active  public.quiz_attempts;
  v_qs      JSONB;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id;
  IF v_quiz.id IS NULL OR NOT public.can_view_quiz(v_quiz) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*) INTO v_total FROM public.quiz_questions WHERE quiz_id = v_quiz.id;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_quiz');
  END IF;

  -- Resume instead of piling up attempts when the page is reloaded.
  SELECT * INTO v_active
  FROM public.quiz_attempts a
  WHERE a.quiz_id = v_quiz.id AND a.user_id = v_me AND a.status = 'active'
  ORDER BY a.started_at DESC
  LIMIT 1;

  IF v_active.id IS NOT NULL THEN
    v_attempt := v_active;
  ELSE
    INSERT INTO public.quiz_attempts (quiz_id, user_id, question_total)
    VALUES (v_quiz.id, v_me, v_total)
    RETURNING * INTO v_attempt;
  END IF;

  SELECT coalesce(jsonb_agg(row ORDER BY ord), '[]'::jsonb) INTO v_qs
  FROM (
    SELECT qq.position AS ord,
           jsonb_build_object(
             'position', qq.position,
             'question_id', q.id,
             'type', q.question_type,
             'question', q.question_text,
             'image_url', q.image_url,
             'marks', q.marks,
             'time_limit_seconds', q.time_limit_seconds,
             'options', (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'position', o.position, 'text', o.option_text) ORDER BY o.position), '[]'::jsonb)
               FROM public.question_bank_options o
               WHERE o.question_id = q.id
             ),
             'answered', EXISTS (
               SELECT 1 FROM public.quiz_attempt_answers aa
               WHERE aa.attempt_id = v_attempt.id AND aa.question_id = q.id
             )
           ) AS row
    FROM public.quiz_questions qq
    JOIN public.question_bank q ON q.id = qq.question_id
    WHERE qq.quiz_id = v_quiz.id
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt.id,
    'quiz_id', v_quiz.id,
    'title', v_quiz.title,
    'score', v_attempt.score,
    'answered_count', v_attempt.answered_count,
    'question_total', v_attempt.question_total,
    'questions', v_qs
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_attempt_start(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_attempt_start(UUID) TO authenticated;

-- ------------------------------------------------------------
-- Answer — grades server-side, then reveals only that question
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_attempt_answer(
  p_attempt_id UUID,
  p_question_id UUID,
  p_positions  INT[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_attempt  public.quiz_attempts;
  v_q        public.question_bank;
  v_correct  INT[];
  v_selected INT[];
  v_is_right BOOLEAN;
  v_points   INT;
  v_inserted INT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_attempt FROM public.quiz_attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL OR v_attempt.user_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_attempt.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attempt_closed');
  END IF;

  -- the question must belong to this attempt's quiz
  SELECT q.* INTO v_q
  FROM public.quiz_questions qq
  JOIN public.question_bank q ON q.id = qq.question_id
  WHERE qq.quiz_id = v_attempt.quiz_id AND q.id = p_question_id;

  IF v_q.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_quiz');
  END IF;

  SELECT coalesce(array_agg(o.position ORDER BY o.position), '{}')
  INTO v_correct
  FROM public.question_bank_options o
  WHERE o.question_id = v_q.id AND o.is_correct;

  SELECT coalesce(array_agg(DISTINCT pos ORDER BY pos), '{}')
  INTO v_selected
  FROM unnest(coalesce(p_positions, '{}')) AS pos
  WHERE pos BETWEEN 0 AND 3;

  v_is_right := (v_selected = v_correct);
  v_points   := CASE WHEN v_is_right THEN v_q.marks ELSE 0 END;

  INSERT INTO public.quiz_attempt_answers (
    attempt_id, question_id, selected_positions, is_correct, points
  ) VALUES (
    v_attempt.id, v_q.id, v_selected, v_is_right, v_points
  )
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    UPDATE public.quiz_attempts
    SET score = score + v_points,
        correct_count = correct_count + CASE WHEN v_is_right THEN 1 ELSE 0 END,
        answered_count = answered_count + 1
    WHERE id = v_attempt.id;
  END IF;

  -- Re-answering is idempotent and still returns the reveal, so a
  -- double tap cannot produce a different outcome than the first tap.
  RETURN jsonb_build_object(
    'ok', true,
    'already_answered', v_inserted = 0,
    'correct', v_is_right,
    'correct_positions', v_correct,
    'explanation', v_q.explanation,
    'points', CASE WHEN v_inserted > 0 THEN v_points ELSE 0 END
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_attempt_answer(UUID, UUID, INT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_attempt_answer(UUID, UUID, INT[]) TO authenticated;

-- ------------------------------------------------------------
-- Finish — closes the attempt and returns the summary
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_attempt_finish(p_attempt_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_attempt public.quiz_attempts;
  v_max     INT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_attempt FROM public.quiz_attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL OR v_attempt.user_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT coalesce(sum(q.marks), 0) INTO v_max
  FROM public.quiz_questions qq
  JOIN public.question_bank q ON q.id = qq.question_id
  WHERE qq.quiz_id = v_attempt.quiz_id;

  IF v_attempt.status = 'active' THEN
    UPDATE public.quiz_attempts
    SET status = 'completed', completed_at = now()
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'score', v_attempt.score,
    'max_score', v_max,
    'percent', CASE WHEN v_max > 0 THEN round((v_attempt.score::numeric / v_max) * 100) ELSE 0 END,
    'correct_count', v_attempt.correct_count,
    'answered_count', v_attempt.answered_count,
    'question_total', v_attempt.question_total,
    'completed_at', v_attempt.completed_at
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_attempt_finish(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_attempt_finish(UUID) TO authenticated;
