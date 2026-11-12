-- ============================================================
-- ConnectToCampus — JOIN THROTTLE: STOP LOCKING PEOPLE OUT
--
-- Two defects made a shared network (campus / hostel Wi-Fi) unable to
-- join a room that was perfectly open:
--
--   1. SELF-COUNTING LOCKOUT. Every throttle rejection inserted a
--      `throttled` row, and the bucket query counted every outcome
--      except 'ok'. So each retry added a failure: the count could
--      never fall below the ceiling, and `retry_after_s` kept moving
--      forward. A blocked student who retried stayed blocked forever.
--
--   2. WRONG SIGNAL. The buckets counted 'closed', 'finished' and
--      'full' too. Those mean "this is a real room", not "someone is
--      guessing codes" — and behind one NAT a stale link or a full
--      room could exhaust the IP ceiling for the whole building.
--
-- What counts now: ONLY `not_found` — a room code that does not
-- exist, which is the actual brute-force signal for a 6-digit code.
-- 'ok', 'throttled', 'closed', 'finished' and 'full' never count, so
-- a lockout expires on its own window no matter how often the player
-- retries, and a correct code is never punished by someone else's
-- typo on the same network.
--
-- The throttle reply now carries `throttled: true` so the client can
-- retry on a timer instead of asking the player to guess what went
-- wrong. That flag describes the caller's own rate limit, not the
-- room, so it is not a room-state oracle. Everything else keeps the
-- single generic failure shape.
--
-- ROLE: `p_as_participant` is the creator's own choice. Opening your
-- own room never makes you a participant, so the player page asks
-- first; passing true joins the creator as a normal player (capacity
-- and duplicate rules included). Nobody else is ever treated as the
-- host, and `competitions.host_id` never changes.
--
-- Idempotent: the old 2-argument signature is dropped first so the
-- defaulted 3-argument form cannot be ambiguous.
-- ============================================================

-- The per-IP ceiling is an abuse guard, not a per-student limit, so it
-- gets more headroom now that it only sees real guesses. An operator-set
-- value is never overwritten.
INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'quiz.join.max_attempts_per_ip',
  '120',
  'Failed room-code attempts allowed per IP per window (abuse ceiling, not a per-student limit)'
)
ON CONFLICT (key) DO NOTHING;

UPDATE public.platform_settings
   SET value = '120',
       description = 'Failed room-code attempts allowed per IP per window (abuse ceiling, not a per-student limit)'
 WHERE key = 'quiz.join.max_attempts_per_ip'
   AND value = '60';

DROP FUNCTION IF EXISTS public.live_quiz_join(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.live_quiz_join(
  p_room_code      text,
  p_display_name   text DEFAULT NULL::text,
  p_as_participant boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  v_code    := btrim(coalesce(p_room_code, ''));
  v_ip_hash := public.live_quiz_ip_hash();

  SELECT * INTO v_comp FROM public.competitions WHERE room_code = v_code;

  -- ------------------------------------------------------------
  -- 1. Already in the room: always allowed, any status, no throttle.
  --    Not counted against capacity, so a reload can never be "full".
  --    A kicked row is the one exception — moderation has to stick.
  -- ------------------------------------------------------------
  IF v_comp.id IS NOT NULL THEN
    SELECT * INTO v_part
    FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.user_id = v_me;

    IF v_part.id IS NOT NULL AND v_part.is_kicked THEN
      RETURN jsonb_build_object('ok', false, 'error', 'kicked');
    END IF;

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
  END IF;

  -- ------------------------------------------------------------
  -- 1b. Host or admin: opening your own room is not joining it.
  --     No participant row, no attempt recorded, no throttle — unless the
  --     creator explicitly chose "join as a player" on the room page.
  --     Host identity itself is `competitions.host_id` and never changes.
  -- ------------------------------------------------------------
  IF v_comp.id IS NOT NULL
     AND NOT coalesce(p_as_participant, false)
     AND (v_comp.host_id = v_me OR public.is_platform_admin(v_me)) THEN
    SELECT count(*) INTO v_count
    FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE;

    RETURN jsonb_build_object(
      'ok', true, 'competition_id', v_comp.id, 'room_code', v_comp.room_code,
      'status', v_comp.status, 'rejoined', false, 'is_host', true,
      'participant_id', NULL, 'display_name', NULL, 'participants', v_count
    );
  END IF;

  -- ------------------------------------------------------------
  -- 2. Newcomers only: two independent buckets, both on `not_found`.
  --    per user : quiz.join.max_attempts        (default 12)  — strict
  --    per IP   : quiz.join.max_attempts_per_ip (default 120) — abuse scale
  --
  --    Only a code that does not exist counts. A `throttled` row does not
  --    count either, so retrying cannot extend its own lockout.
  -- ------------------------------------------------------------
  v_max_user := greatest(public.quiz_setting('quiz.join.max_attempts', 12), 1);
  v_max_ip   := greatest(public.quiz_setting('quiz.join.max_attempts_per_ip', 120), v_max_user);
  v_window   := greatest(public.quiz_setting('quiz.join.window_minutes', 5), 1);

  SELECT count(*),
         coalesce(ceil(extract(epoch FROM (
           min(a.created_at) + (v_window || ' minutes')::interval - now()
         )))::INT, 0)
  INTO v_user_recent, v_user_retry
  FROM public.join_attempts a
  WHERE a.user_id = v_me
    AND a.outcome = 'not_found'
    AND a.created_at > now() - (v_window || ' minutes')::interval;

  v_ip_recent := 0;
  IF v_ip_hash IS NOT NULL THEN
    SELECT count(*),
           coalesce(ceil(extract(epoch FROM (
             min(a.created_at) + (v_window || ' minutes')::interval - now()
           )))::INT, 0)
    INTO v_ip_recent, v_ip_retry
    FROM public.join_attempts a
    WHERE a.ip_hash = v_ip_hash
      AND a.outcome = 'not_found'
      AND a.created_at > now() - (v_window || ' minutes')::interval;
  END IF;

  IF v_user_recent >= v_max_user THEN
    v_retry := v_user_retry;
  ELSIF v_ip_recent >= v_max_ip THEN
    v_retry := v_ip_retry;
  END IF;

  IF v_user_recent >= v_max_user OR v_ip_recent >= v_max_ip THEN
    INSERT INTO public.join_attempts (user_id, ip_hash, room_code, outcome)
    VALUES (v_me, v_ip_hash, left(v_code, 6), 'throttled');

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_or_unavailable',
      -- Describes this caller's own rate limit, never the room.
      'throttled', true,
      'retry_after_s', least(greatest(v_retry, 1), v_window * 60)
    );
  END IF;

  -- ------------------------------------------------------------
  -- 3. Room state, for people who are not in it yet.
  -- ------------------------------------------------------------
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
END $function$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT, BOOLEAN) TO authenticated;
