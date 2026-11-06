-- ============================================================
-- ConnectToCampus — AI QUESTION GENERATION WITH HUMAN REVIEW (P5)
--
-- Pipeline (this file owns steps 5-9; the API route owns 1-4):
--   1 input  → 2 auth → 3 validation → 4 extraction → 5 prompt
--   → 6 provider → 7 strict JSON → 8 schema/correctness/duplicate
--   → 9 human review → 10 question_bank → 11 quiz
--
-- Non-negotiables enforced here, in the database:
--   • nothing is auto-published: a generated question only becomes a
--     bank row when a human calls `quiz_ai_job_accept` with explicit
--     indices, and the quiz it lands in is `draft`;
--   • generated rows are re-validated in SQL (2-4 options, exactly one
--     correct for single/true_false, at least one for multiple) so a
--     compromised API path still cannot insert malformed questions;
--   • a per-user daily cap is enforced server-side, not in the UI.
--
-- Draft JSON shape (produced by src/lib/quizzes/validation.ts):
--   { "questions": [ { "question": "...", "type": "single",
--       "options": [ {"text": "...", "is_correct": true}, ... ],
--       "explanation": "...", "difficulty": "medium",
--       "marks": 100, "time_limit_seconds": 20 } ] }
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quiz_ai_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'generating'
                CHECK (status IN ('generating', 'review_ready', 'accepted', 'discarded', 'failed')),
  source_kind   TEXT NOT NULL DEFAULT 'topic'
                CHECK (source_kind IN ('topic', 'text', 'pdf', 'image')),
  source_hash   TEXT NOT NULL,
  spec          JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft         JSONB,
  model         TEXT,
  error         TEXT,
  accepted_quiz_id UUID REFERENCES public.quizzes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_ai_jobs_user
  ON public.quiz_ai_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_ai_jobs_hash
  ON public.quiz_ai_jobs (user_id, source_hash);

ALTER TABLE public.quiz_ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_ai_jobs_owner_read ON public.quiz_ai_jobs;
CREATE POLICY quiz_ai_jobs_owner_read ON public.quiz_ai_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- reads only: every write goes through the functions below, so status,
-- draft and accepted_quiz_id cannot be forged by a client.

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('quiz.ai.max_jobs_per_day',  '20',    'AI quiz generations allowed per user per 24h'),
  ('quiz.ai.max_questions',     '30',    'Maximum questions a single generation may return'),
  ('quiz.ai.max_source_chars',  '20000', 'Maximum extracted source characters sent to the model')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.quiz_ai_validate_question(p_q JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_typeof(p_q) = 'object'
    AND coalesce(jsonb_typeof(p_q -> 'question'), '') = 'string'
    AND char_length(btrim(p_q ->> 'question')) BETWEEN 5 AND 1000
    AND coalesce(p_q ->> 'type', 'single') IN ('single', 'multiple', 'true_false')
    AND jsonb_typeof(p_q -> 'options') = 'array'
    AND jsonb_array_length(p_q -> 'options') BETWEEN 2 AND 4
    -- every option has non-empty text
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_q -> 'options') o
      WHERE jsonb_typeof(o) <> 'object'
         OR coalesce(jsonb_typeof(o -> 'text'), '') <> 'string'
         OR char_length(btrim(o ->> 'text')) NOT BETWEEN 1 AND 300
    )
    -- at least one correct, never all, exactly one for single, two options for true_false
    AND (
      SELECT count(*) FROM jsonb_array_elements(p_q -> 'options') o
      WHERE o -> 'is_correct' = 'true'::jsonb
    ) >= 1
    AND (
      SELECT count(*) FROM jsonb_array_elements(p_q -> 'options') o
      WHERE o -> 'is_correct' = 'true'::jsonb
    ) < jsonb_array_length(p_q -> 'options')
    AND (
      coalesce(p_q ->> 'type', 'single') <> 'single'
      OR (SELECT count(*) FROM jsonb_array_elements(p_q -> 'options') o
          WHERE o -> 'is_correct' = 'true'::jsonb) = 1
    )
    AND (
      coalesce(p_q ->> 'type', 'single') <> 'true_false'
      OR jsonb_array_length(p_q -> 'options') = 2
    )
    AND (
      SELECT count(DISTINCT lower(btrim(o ->> 'text')))
      FROM jsonb_array_elements(p_q -> 'options') o
    ) = jsonb_array_length(p_q -> 'options');
$$;

REVOKE EXECUTE ON FUNCTION public.quiz_ai_validate_question(JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.quiz_ai_job_create(
  p_source_kind TEXT,
  p_source_hash TEXT,
  p_spec        JSONB,
  p_draft       JSONB,
  p_model       TEXT DEFAULT NULL,
  p_error       TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_today     INT;
  v_max       INT;
  v_job       public.quiz_ai_jobs;
  v_status    TEXT;
  v_valid     INT;
  v_questions JSONB;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_max := greatest(public.quiz_setting('quiz.ai.max_jobs_per_day', 20), 1);

  SELECT count(*) INTO v_today
  FROM public.quiz_ai_jobs j
  WHERE j.user_id = v_me AND j.created_at > now() - INTERVAL '24 hours';

  IF v_today >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_limit', 'limit', v_max);
  END IF;

  IF p_draft IS NULL OR p_error IS NOT NULL THEN
    v_status := 'failed';
  ELSE
    -- only well-formed questions survive; this is the last gate before a
    -- human sees the list
    SELECT coalesce(jsonb_agg(q), '[]'::jsonb), count(*)
    INTO v_questions, v_valid
    FROM jsonb_array_elements(coalesce(p_draft -> 'questions', '[]'::jsonb)) q
    WHERE public.quiz_ai_validate_question(q);

    v_status := CASE WHEN v_valid > 0 THEN 'review_ready' ELSE 'failed' END;
    p_draft  := jsonb_build_object('questions', v_questions);
    IF v_valid = 0 AND p_error IS NULL THEN
      p_error := 'no_valid_questions';
    END IF;
  END IF;

  INSERT INTO public.quiz_ai_jobs (
    user_id, status, source_kind, source_hash, spec, draft, model, error
  ) VALUES (
    v_me, v_status,
    CASE WHEN p_source_kind IN ('topic', 'text', 'pdf', 'image') THEN p_source_kind ELSE 'topic' END,
    left(coalesce(p_source_hash, ''), 128),
    coalesce(p_spec, '{}'::jsonb),
    CASE WHEN v_status = 'failed' THEN NULL ELSE p_draft END,
    left(p_model, 80),
    left(p_error, 400)
  ) RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'ok', v_status = 'review_ready',
    'job_id', v_job.id,
    'status', v_status,
    'question_count', coalesce(v_valid, 0),
    'error', v_job.error
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_ai_job_create(TEXT, TEXT, JSONB, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_ai_job_create(TEXT, TEXT, JSONB, JSONB, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_ai_job_get(p_job_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.quiz_ai_jobs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM public.quiz_ai_jobs j
  WHERE j.id = p_job_id
    AND (j.user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'job_id', v_job.id, 'status', v_job.status,
    'source_kind', v_job.source_kind, 'spec', v_job.spec,
    'draft', v_job.draft, 'error', v_job.error,
    'accepted_quiz_id', v_job.accepted_quiz_id,
    'created_at', v_job.created_at
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_ai_job_get(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_ai_job_get(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_ai_job_list(p_limit INT DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_rows JSONB;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT coalesce(jsonb_agg(row ORDER BY created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT j.created_at,
           jsonb_build_object(
             'job_id', j.id, 'status', j.status, 'source_kind', j.source_kind,
             'spec', j.spec, 'error', j.error,
             'accepted_quiz_id', j.accepted_quiz_id
           ) AS row
    FROM public.quiz_ai_jobs j
    WHERE j.user_id = v_me
    ORDER BY j.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
  ) s;

  RETURN jsonb_build_object('ok', true, 'jobs', v_rows);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_ai_job_list(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_ai_job_list(INT) TO authenticated;

-- ------------------------------------------------------------
-- Human review → question bank → draft quiz
--    p_indices selects exactly which generated questions are kept.
--    Anything not selected is discarded with the job.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_ai_job_accept(
  p_job_id    UUID,
  p_indices   INT[],
  p_title     TEXT,
  p_visibility TEXT DEFAULT 'private',
  p_campus_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_job    public.quiz_ai_jobs;
  v_idx    INT;
  v_q      JSONB;
  v_bank   UUID;
  v_quiz   UUID;
  v_pos    INT := 0;
  v_vis    TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM public.quiz_ai_jobs j
  WHERE j.id = p_job_id AND j.user_id = v_me;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_job.status <> 'review_ready' OR v_job.draft IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_reviewable', 'status', v_job.status);
  END IF;
  IF p_indices IS NULL OR array_length(p_indices, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nothing_selected');
  END IF;

  v_vis := CASE WHEN p_visibility IN ('private', 'campus', 'public') THEN p_visibility ELSE 'private' END;

  INSERT INTO public.quizzes (
    owner_id, campus_id, title, description, subject, visibility, status, source
  ) VALUES (
    v_me,
    CASE WHEN v_vis = 'campus' THEN coalesce(p_campus_id, public.my_campus_id()) ELSE p_campus_id END,
    left(coalesce(nullif(btrim(p_title), ''), 'AI generated quiz'), 140),
    'Generated with AI assistance and reviewed before saving.',
    coalesce(nullif(btrim(coalesce(v_job.spec ->> 'subject', '')), ''), 'General'),
    v_vis, 'draft', 'ai'
  ) RETURNING id INTO v_quiz;

  FOREACH v_idx IN ARRAY p_indices
  LOOP
    SELECT q INTO v_q
    FROM jsonb_array_elements(v_job.draft -> 'questions') WITH ORDINALITY AS t(q, ord)
    WHERE t.ord - 1 = v_idx;

    CONTINUE WHEN v_q IS NULL;
    CONTINUE WHEN NOT public.quiz_ai_validate_question(v_q);

    INSERT INTO public.question_bank (
      created_by, subject, topic, difficulty, question_type,
      question_text, explanation, marks, time_limit_seconds
    ) VALUES (
      v_me,
      coalesce(nullif(btrim(coalesce(v_job.spec ->> 'subject', '')), ''), 'General'),
      left(coalesce(v_q ->> 'topic', ''), 80),
      CASE WHEN v_q ->> 'difficulty' IN ('easy', 'medium', 'hard')
           THEN v_q ->> 'difficulty' ELSE 'medium' END,
      coalesce(v_q ->> 'type', 'single'),
      btrim(v_q ->> 'question'),
      left(coalesce(v_q ->> 'explanation', ''), 1000),
      LEAST(GREATEST(coalesce((v_q ->> 'marks')::INT, 100), 1), 1000),
      LEAST(GREATEST(coalesce((v_q ->> 'time_limit_seconds')::INT, 20), 5), 300)
    ) RETURNING id INTO v_bank;

    INSERT INTO public.question_bank_options (question_id, position, option_text, is_correct)
    SELECT v_bank, (o.ord - 1),
           btrim(o.opt ->> 'text'),
           (o.opt ->> 'is_correct')::boolean IS TRUE
    FROM jsonb_array_elements(v_q -> 'options') WITH ORDINALITY AS o(opt, ord);

    INSERT INTO public.quiz_questions (quiz_id, question_id, position)
    VALUES (v_quiz, v_bank, v_pos);

    v_pos := v_pos + 1;
  END LOOP;

  IF v_pos = 0 THEN
    DELETE FROM public.quizzes WHERE id = v_quiz;
    RETURN jsonb_build_object('ok', false, 'error', 'nothing_valid_selected');
  END IF;

  UPDATE public.quiz_ai_jobs
  SET status = 'accepted', accepted_quiz_id = v_quiz, updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object('ok', true, 'quiz_id', v_quiz, 'question_count', v_pos);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_ai_job_accept(UUID, INT[], TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_ai_job_accept(UUID, INT[], TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_ai_job_discard(p_job_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.quiz_ai_jobs
  SET status = 'discarded', draft = NULL, updated_at = now()
  WHERE id = p_job_id AND user_id = v_me AND status = 'review_ready';

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_ai_job_discard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_ai_job_discard(UUID) TO authenticated;
