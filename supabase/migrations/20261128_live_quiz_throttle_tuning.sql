-- ============================================================
-- ConnectToCampus — JOIN THROTTLE TUNING (P1 follow-up)
--
-- Found by scripts/e2e-quiz-platform-smoke.mjs against the deployed
-- database: 20261123 counted failures with
--     a.user_id = v_me OR a.ip_hash = v_ip_hash
-- against ONE threshold. Every student behind the same campus NAT shares
-- an IP, so twelve wrong guesses from any one of them locked the whole
-- building out of joining — including rooms they had the right code for.
--
-- Fix: two independent buckets with different ceilings.
--   per user : quiz.join.max_attempts        (default 12)  — strict
--   per IP   : quiz.join.max_attempts_per_ip (default 60)  — abuse-scale only
--
-- Also drops the extra `throttled` key so a throttled reply is
-- byte-identical in shape to a missing-room reply. `retry_after_s` is
-- present in both, which is the documented hint.
--
-- Replaces only live_quiz_join. Idempotent.
-- ============================================================

INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'quiz.join.max_attempts_per_ip',
  '60',
  'Failed room-code attempts allowed per IP per window (abuse ceiling, not a per-student limit)'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.live_quiz_join(
  p_room_code    TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me          UUID := auth.uid();
  v_comp        public.competitions;
  v_count       INT;
  v_name        TEXT;
  v_part        public.competition_participants;
  v_ip_hash     TEXT;
  v_code        TEXT;
  v_max_user    INT;
  v_max_ip      INT;
  v_window      INT;
  v_user_recent INT;
  v_ip_recent   INT;
  v_user_retry  INT;
  v_ip_retry    INT;
  v_retry       INT := 0;
  v_outcome     TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_code     := btrim(coalesce(p_room_code, ''));
  v_ip_hash  := public.live_quiz_ip_hash();
  v_max_user := greatest(public.quiz_setting('quiz.join.max_attempts', 12), 1);
  v_max_ip   := greatest(public.quiz_setting('quiz.join.max_attempts_per_ip', 60), v_max_user);
  v_window   := greatest(public.quiz_setting('quiz.join.window_minutes', 5), 1);

  -- per-user bucket: protects one account from brute forcing codes
  SELECT count(*),
         coalesce(ceil(extract(epoch FROM (
           min(a.created_at) + (v_window || ' minutes')::interval - now()
         )))::INT, 0)
  INTO v_user_recent, v_user_retry
  FROM public.join_attempts a
  WHERE a.user_id = v_me
    AND a.outcome <> 'ok'
    AND a.created_at > now() - (v_window || ' minutes')::interval;

  -- per-IP bucket: deliberately much looser, because a campus NAT is one IP
  v_ip_recent := 0;
  IF v_ip_hash IS NOT NULL THEN
    SELECT count(*),
           coalesce(ceil(extract(epoch FROM (
             min(a.created_at) + (v_window || ' minutes')::interval - now()
           )))::INT, 0)
    INTO v_ip_recent, v_ip_retry
    FROM public.join_attempts a
    WHERE a.ip_hash = v_ip_hash
      AND a.outcome <> 'ok'
      AND a.created_at > now() - (v_window || ' minutes')::interval;
  END IF;

  IF v_user_recent >= v_max_user THEN
    v_retry := v_user_retry;
  ELSIF v_ip_recent >= v_max_ip THEN
    v_retry := v_ip_retry;
  END IF;

  IF v_retry > 0 OR v_user_recent >= v_max_user OR v_ip_recent >= v_max_ip THEN
    INSERT INTO public.join_attempts (user_id, ip_hash, room_code, outcome)
    VALUES (v_me, v_ip_hash, left(v_code, 6), 'throttled');

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_or_unavailable',
      'retry_after_s', greatest(v_retry, 1)
    );
  END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE room_code = v_code;

  IF v_comp.id IS NULL THEN
    v_outcome := 'not_found';
  ELSIF v_comp.status IN ('draft', 'cancelled') THEN
    v_outcome := 'closed';
  ELSIF v_comp.status = 'completed' THEN
    v_outcome := 'finished';
  ELSIF v_comp.status = 'live' AND NOT v_comp.allow_late_join THEN
    v_outcome := 'closed';
  ELSE
    v_outcome := NULL;
  END IF;

  IF v_outcome IS NOT NULL THEN
    INSERT INTO public.join_attempts (user_id, ip_hash, room_code, outcome)
    VALUES (v_me, v_ip_hash, left(v_code, 6), v_outcome);

    -- Deliberately identical for every failure: no room-state oracle.
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_or_unavailable',
      'retry_after_s', v_window * 60
    );
  END IF;

  -- Rejoin is always allowed and is not counted against capacity.
  SELECT * INTO v_part
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.user_id = v_me;

  IF v_part.id IS NOT NULL THEN
    INSERT INTO public.join_attempts (user_id, ip_hash, room_code, outcome)
    VALUES (v_me, v_ip_hash, v_code, 'ok');

    RETURN jsonb_build_object(
      'ok', true, 'competition_id', v_comp.id, 'room_code', v_comp.room_code,
      'status', v_comp.status, 'rejoined', true,
      'participant_id', v_part.id, 'score', v_part.score,
      'display_name', v_part.display_name, 'is_kicked', v_part.is_kicked
    );
  END IF;

  -- Serialise capacity for this competition: count and insert become atomic.
  PERFORM pg_advisory_xact_lock(hashtextextended('live_quiz_join:' || v_comp.id::text, 0));

  SELECT count(*) INTO v_count
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE;

  IF v_count >= v_comp.max_participants THEN
    INSERT INTO public.join_attempts (user_id, ip_hash, room_code, outcome)
    VALUES (v_me, v_ip_hash, v_code, 'full');

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_or_unavailable',
      'retry_after_s', v_window * 60
    );
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

  INSERT INTO public.join_attempts (user_id, ip_hash, room_code, outcome)
  VALUES (v_me, v_ip_hash, v_code, 'ok');

  RETURN jsonb_build_object(
    'ok', true, 'competition_id', v_comp.id, 'room_code', v_comp.room_code,
    'status', v_comp.status, 'rejoined', false,
    'participant_id', v_part.id, 'display_name', v_name,
    'participants', v_count + 1
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT) TO authenticated;
