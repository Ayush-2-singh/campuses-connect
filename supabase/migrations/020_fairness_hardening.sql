-- ============================================================
-- CampusConnect — 020 FAIRNESS HARDENING
-- Closes the karma farming gateway:
--   • award_karma() becomes server-internal ONLY (revoked from clients)
--   • validated per-action wrappers are the only client entry points
--   • record_meaningful_action() internal only (no streak faking)
--   • dsa_submissions inserts only via the judge (service role)
--   • contest problem sets hidden until the contest is live
-- ============================================================

-- ── 1. Revoke direct gateway access from clients ──
REVOKE EXECUTE ON FUNCTION public.award_karma(TEXT, TEXT, TEXT, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_meaningful_action() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_streak_freezes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dsa_rate_limit(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dsa_solved(UUID) FROM authenticated;

-- ── 2. dsa_submissions: only the judge inserts (service role bypasses RLS) ──
DROP POLICY IF EXISTS dsa_submissions_insert_own ON public.dsa_submissions;

-- ── 3. Contest problem sets stay hidden until live ──
REVOKE SELECT (problems) ON public.contests FROM authenticated;
REVOKE SELECT (problems) ON public.contests FROM anon;

-- ── 4. Internal helper: meaningful action for an explicit user ──
-- (called from validated wrappers; never directly by clients)
CREATE OR REPLACE FUNCTION public.record_meaningful_action_for(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last DATE;
  v_streak INT;
  v_freezes INT;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;

  SELECT last_streak_date::date, COALESCE(streak_days,0), COALESCE(streak_freezes,0)
    INTO v_last, v_streak, v_freezes
    FROM public.profiles WHERE id = p_user;
  IF v_last = CURRENT_DATE THEN RETURN; END IF;

  IF v_last = CURRENT_DATE - 1 THEN
    UPDATE public.profiles SET streak_days = v_streak + 1, last_streak_date = now() WHERE id = p_user; RETURN;
  END IF;
  IF v_last IS NOT NULL AND v_last < CURRENT_DATE - 1 AND v_freezes > 0 THEN
    UPDATE public.profiles SET streak_freezes = v_freezes - 1, last_streak_date = now() WHERE id = p_user; RETURN;
  END IF;
  UPDATE public.profiles SET streak_days = 1, last_streak_date = now() WHERE id = p_user;
END $$;

-- keep the public read-only version for summaries (no auth side-effect)
CREATE OR REPLACE FUNCTION public.my_karma_summary()
RETURNS TABLE (lifetime INT, aura INT, daily_earned INT, season_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COALESCE(SUM(points),0) FROM public.karma_ledger WHERE user_id = auth.uid()),
    (SELECT COALESCE(aura_points,0) FROM public.profiles WHERE id = auth.uid()),
    (SELECT COALESCE(SUM(points),0) FROM public.karma_ledger
      WHERE user_id = auth.uid() AND points > 0 AND created_at >= CURRENT_DATE),
    (SELECT name FROM public.seasons WHERE is_active = TRUE LIMIT 1);
$$;
REVOKE EXECUTE ON FUNCTION public.my_karma_summary() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.my_karma_summary() TO authenticated;

-- ── 5. Validated wrappers (the ONLY client-facing rewards) ──

-- Note upload: validates the note actually belongs to the caller
DROP FUNCTION IF EXISTS public.reward_note_upload(UUID);
CREATE OR REPLACE FUNCTION public.reward_note_upload(p_note_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notes WHERE id = p_note_id AND uploaded_by = auth.uid()) THEN
    RETURN FALSE;
  END IF;
  PERFORM public.award_karma('note_uploaded', 'note', 'note:' || p_note_id, auth.uid());
  PERFORM public.record_meaningful_action_for(auth.uid());
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.reward_note_upload(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reward_note_upload(UUID) TO authenticated;

-- Opportunity post: validates ownership
DROP FUNCTION IF EXISTS public.reward_opportunity_post(UUID);
CREATE OR REPLACE FUNCTION public.reward_opportunity_post(p_opportunity_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.opportunities WHERE id = p_opportunity_id AND posted_by = auth.uid()) THEN
    RETURN FALSE;
  END IF;
  PERFORM public.award_karma('opportunity_posted', 'opportunity', 'opportunity:' || p_opportunity_id, auth.uid());
  PERFORM public.record_meaningful_action_for(auth.uid());
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.reward_opportunity_post(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reward_opportunity_post(UUID) TO authenticated;

-- DSA solve: only pays when an ACCEPTED submission exists for this user
-- (submissions can only be inserted by the judge, so this is ungameable)
DROP FUNCTION IF EXISTS public.reward_dsa_solve(UUID, UUID);
CREATE OR REPLACE FUNCTION public.reward_dsa_solve(p_problem_id UUID, p_contest_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_diff TEXT;
  v_slug TEXT;
  v_reason TEXT;
  v_count INT;
BEGIN
  SELECT p.difficulty, p.slug INTO v_diff, v_slug FROM public.dsa_problems p WHERE p.id = p_problem_id;
  IF v_diff IS NULL THEN RETURN FALSE; END IF;

  -- must have an accepted submission created by the judge
  SELECT COUNT(*) INTO v_count FROM public.dsa_submissions
   WHERE user_id = auth.uid() AND problem_id = p_problem_id AND verdict = 'accepted';
  IF v_count = 0 THEN RETURN FALSE; END IF;

  v_reason := CASE v_diff WHEN 'easy' THEN 'dsa_solved_easy'
                          WHEN 'medium' THEN 'dsa_solved_medium'
                          ELSE 'dsa_solved_hard' END;

  PERFORM public.award_karma(v_reason, 'dsa_submission', 'dsa:' || v_slug || ':' || auth.uid(), auth.uid());
  PERFORM public.record_meaningful_action_for(auth.uid());

  IF p_contest_id IS NOT NULL THEN
    PERFORM public.award_karma('contest_participated', 'contest_participation', 'contest:' || p_contest_id || ':' || auth.uid(), auth.uid());
  END IF;
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.reward_dsa_solve(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reward_dsa_solve(UUID, UUID) TO authenticated;

-- Event host: caller must be the creator
DROP FUNCTION IF EXISTS public.reward_event_host(UUID);
CREATE OR REPLACE FUNCTION public.reward_event_host(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host UUID;
BEGIN
  SELECT created_by INTO v_host FROM public.events WHERE id = p_event_id;
  IF v_host IS NULL OR v_host <> auth.uid() THEN RETURN FALSE; END IF;

  UPDATE public.events SET karma_awarded = TRUE WHERE id = p_event_id AND karma_awarded = FALSE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  PERFORM public.award_karma('event_hosted', 'event_host', 'event_host:' || p_event_id, auth.uid());
  PERFORM public.record_meaningful_action_for(auth.uid());
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.reward_event_host(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reward_event_host(UUID) TO authenticated;

-- ── 6. Existing validated RPCs: keep streak inside, no client streak calls ──
DROP FUNCTION IF EXISTS public.attend_event(UUID);
CREATE OR REPLACE FUNCTION public.attend_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_event_id IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.event_attendees (event_id, user_id, status)
  VALUES (p_event_id, auth.uid(), 'going')
  ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'going', created_at = now();

  PERFORM public.award_karma('event_attended', 'event_attend', 'event_attended:' || p_event_id, auth.uid());
  PERFORM public.record_meaningful_action_for(auth.uid());
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.attend_event(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.attend_event(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.check_in_event(UUID);
CREATE OR REPLACE FUNCTION public.check_in_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.event_attendees (event_id, user_id, status, checked_in)
  VALUES (p_event_id, auth.uid(), 'checked_in', now())
  ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'checked_in', checked_in = now();

  PERFORM public.award_karma('event_attended', 'event_checkin', 'event_checkin:' || p_event_id, auth.uid());
  PERFORM public.record_meaningful_action_for(auth.uid());
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_in_event(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_in_event(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.submit_review(TEXT, UUID, INT, TEXT);
CREATE OR REPLACE FUNCTION public.submit_review(p_target_type TEXT, p_target_id UUID, p_rating INT, p_body TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.review_eligibility(p_target_type, p_target_id) THEN RETURN FALSE; END IF;

  INSERT INTO public.reviews (author_id, target_type, target_id, rating, body)
  VALUES (auth.uid(), p_target_type, p_target_id, p_rating, p_body)
  ON CONFLICT (author_id, target_type, target_id)
  DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, created_at = now();

  PERFORM public.award_karma('review_written', 'review', 'review:' || p_target_type || ':' || p_target_id, auth.uid());
  PERFORM public.record_meaningful_action_for(auth.uid());
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_review(TEXT, UUID, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_review(TEXT, UUID, INT, TEXT) TO authenticated;

-- ── 7. dsa_rate_limit + dsa_solved: read-only helpers stay client-safe ──
DROP FUNCTION IF EXISTS public.dsa_rate_limit(UUID);
CREATE OR REPLACE FUNCTION public.dsa_rate_limit(p_problem_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*) < 12 FROM public.dsa_submissions
   WHERE user_id = auth.uid() AND problem_id = p_problem_id
     AND created_at >= now() - interval '1 hour';
$$;
REVOKE EXECUTE ON FUNCTION public.dsa_rate_limit(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.dsa_rate_limit(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.dsa_solved(UUID);
CREATE OR REPLACE FUNCTION public.dsa_solved(p_problem_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dsa_submissions
     WHERE user_id = auth.uid() AND problem_id = p_problem_id AND verdict = 'accepted'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.dsa_solved(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.dsa_solved(UUID) TO authenticated;

-- ── 8. Ask/Senior answer RPCs: also advance the ANSWERER's streak ──
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

  IF EXISTS (SELECT 1 FROM public.answers WHERE id = p_answer_id AND is_accepted) THEN RETURN TRUE; END IF;
  IF EXISTS (SELECT 1 FROM public.answers WHERE question_id = v_question_id AND is_accepted) THEN RETURN FALSE; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = v_question_id
      AND (q.asked_by = auth.uid() OR public.has_mod_permission(auth.uid(), 'content.moderation'))
  ) THEN RETURN FALSE; END IF;

  UPDATE public.answers SET is_accepted = TRUE WHERE id = p_answer_id;
  UPDATE public.questions SET is_resolved = TRUE WHERE id = v_question_id;

  IF v_answerer IS NOT NULL AND v_answerer <> auth.uid() THEN
    PERFORM public.award_karma('answer_accepted', 'answer', 'answer:' || p_answer_id, v_answerer);
    PERFORM public.record_meaningful_action_for(v_answerer);
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'answer_accepted', 'answer', p_answer_id, jsonb_build_object('answerer', v_answerer));
  END IF;
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_answer(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.accept_answer(UUID) TO authenticated;

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
    SELECT 1 FROM public.answers WHERE question_id = p_question_id AND answered_by = auth.uid()
  ) INTO v_first;

  INSERT INTO public.answers (question_id, answered_by, body)
  VALUES (p_question_id, auth.uid(), trim(p_body));

  IF v_first THEN
    PERFORM public.award_karma('answer_submitted', 'answer', 'answer:' || p_question_id || ':' || auth.uid());
  END IF;
  PERFORM public.record_meaningful_action_for(auth.uid());
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) TO authenticated;
