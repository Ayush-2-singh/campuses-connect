-- ============================================================
-- ConnectToCampus — LIVE QUIZ: SWAP THE QUESTION SET BEFORE START
--
-- A room copies its questions into competition_questions when it is
-- created. That is deliberate: editing the bank can never rewrite a
-- scored competition. The side effect was that a host who imported a
-- wrong CSV had no fix except deleting the room and announcing a new
-- code on stream.
--
-- live_quiz_replace_questions() re-snapshots the set, but only while
-- the room is untouched:
--   • host (or platform admin) only, same gate as every control RPC;
--   • status must be draft/waiting;
--   • current_position must still be -1 (start was never pressed);
--   • no competition_answers row may exist for the room.
-- Anything already played refuses with `already_started`, so scores and
-- the answer key of a live/completed room can never be swapped out.
--
-- The room id, room code, participants and settings are untouched.
-- Idempotent: CREATE OR REPLACE only; nothing is dropped.
-- ============================================================

CREATE OR REPLACE FUNCTION public.live_quiz_replace_questions(
  p_competition_id UUID,
  p_question_ids   UUID[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_comp public.competitions;
  v_q    RECORD;
  v_snap UUID;
  v_pos  INT := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_questions');
  END IF;

  -- Lock the row so a start press cannot race the replace.
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id FOR UPDATE;
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_comp.host_id <> v_me AND NOT public.is_platform_admin(v_me) THEN
    RAISE EXCEPTION 'only the host can control this competition' USING ERRCODE = '42501';
  END IF;

  IF v_comp.status NOT IN ('draft', 'waiting')
     OR v_comp.current_position >= 0
     OR EXISTS (SELECT 1 FROM public.competition_answers a WHERE a.competition_id = v_comp.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_started');
  END IF;

  -- The old snapshot goes first; its options cascade with their question.
  -- An exception below rolls the whole call back, so the room is never left
  -- half-empty.
  DELETE FROM public.competition_questions WHERE competition_id = v_comp.id;

  -- Snapshot in the caller's order; a bank question must belong to the host.
  FOR v_q IN
    SELECT q.*
    FROM unnest(p_question_ids) WITH ORDINALITY AS t(id, ord)
    JOIN public.question_bank q ON q.id = t.id
    WHERE (q.created_by = v_me OR public.is_platform_admin(v_me))
    ORDER BY t.ord
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
    RAISE EXCEPTION 'none of the selected questions belong to you' USING ERRCODE = '42501';
  END IF;

  UPDATE public.competitions
  SET question_count = v_pos, updated_at = now()
  WHERE id = v_comp.id;

  RETURN jsonb_build_object('ok', true, 'question_count', v_pos);
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_replace_questions(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_replace_questions(UUID, UUID[]) TO authenticated;
