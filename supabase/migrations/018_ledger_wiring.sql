-- ============================================================
-- CampusConnect — 018 LEDGER WIRING
-- Every karma award must flow through award_karma() (the ledger
-- gateway from 014). These rewrites replace the legacy direct
-- profile updates so the ledger stays the single source of truth.
-- ============================================================

-- ── accept_answer: award via gateway, not direct update ──
DROP FUNCTION IF EXISTS public.accept_answer(UUID);
CREATE OR REPLACE FUNCTION public.accept_answer(p_answer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question_id UUID;
  v_answerer    UUID;
BEGIN
  SELECT question_id, answered_by INTO v_question_id, v_answerer
  FROM public.answers WHERE id = p_answer_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.answers WHERE id = p_answer_id AND is_accepted) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (SELECT 1 FROM public.answers WHERE question_id = v_question_id AND is_accepted) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = v_question_id
      AND (q.asked_by = auth.uid()
           OR public.has_mod_permission(auth.uid(), 'content.moderation'))
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.answers SET is_accepted = TRUE WHERE id = p_answer_id;
  UPDATE public.questions SET is_resolved = TRUE WHERE id = v_question_id;

  -- Credit the answerer via the ledger (idempotent by ref)
  IF v_answerer IS NOT NULL AND v_answerer <> auth.uid() THEN
    PERFORM public.award_karma('answer_accepted', 'answer', 'answer:' || p_answer_id, v_answerer);

    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'answer_accepted', 'answer', p_answer_id,
            jsonb_build_object('answerer', v_answerer));
  END IF;

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.accept_answer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_answer(UUID) TO authenticated;

-- ── submit_answer: award via gateway, not direct update ──
DROP FUNCTION IF EXISTS public.submit_answer(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.submit_answer(p_question_id UUID, p_body TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asker UUID;
  v_first BOOLEAN;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RETURN FALSE; END IF;

  SELECT asked_by INTO v_asker FROM public.questions WHERE id = p_question_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF v_asker = auth.uid() THEN RETURN FALSE; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.answers
    WHERE question_id = p_question_id AND answered_by = auth.uid()
  ) INTO v_first;

  INSERT INTO public.answers (question_id, answered_by, body)
  VALUES (p_question_id, auth.uid(), trim(p_body));

  -- First answer only, via ledger
  IF v_first THEN
    PERFORM public.award_karma('answer_submitted', 'answer', 'answer:' || p_question_id || ':' || auth.uid());
  END IF;

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) TO authenticated;
