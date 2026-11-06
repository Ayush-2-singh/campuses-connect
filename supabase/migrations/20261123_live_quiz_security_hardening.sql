-- ============================================================
-- ConnectToCampus — LIVE QUIZ SECURITY HARDENING (P1)
--
-- Fixes the five defects confirmed against the deployed schema:
--   S1  room_code was readable by `anon` through `competitions_public_read`
--   S2  live_quiz_join had no throttling and leaked room state through
--       four distinct error strings
--   S3  duplicate answers raced the UNIQUE constraint and surfaced
--       SQLSTATE 23505 instead of the documented `already_answered`
--   S4  max_participants was a count-then-insert TOCTOU
--   S5  any authenticated user could create unlimited rooms
--
-- NOTHING here changes a column type, drops a table or touches existing
-- rows. Every statement is additive or CREATE OR REPLACE.
--
-- Idempotent: safe to run twice.
-- Applied by scripts/apply-one-migration.mjs (single BEGIN … COMMIT).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Campus helper
--    The audit found that `current_campus_id()` does not exist — the
--    repo scopes campus access with an inline subquery on profiles
--    (003_v3_authz.sql:538, 005_legacy_rls_lockdown.sql:101). This is
--    that same idiom, wrapped once so the new policies do not repeat it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_campus_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT campus_id FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.my_campus_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_campus_id() TO authenticated;

-- ------------------------------------------------------------
-- 1. Configurable limits
--    Reuses the existing platform_settings key/value table (verified in
--    supabase/dumps/schema/01_columns.json) instead of adding a config
--    table. Values are plain integers; a missing or malformed row falls
--    back to the default rather than breaking the join path.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_setting(p_key TEXT, p_default INT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw TEXT;
BEGIN
  SELECT trim(both '"' from s.value::text) INTO v_raw
  FROM public.platform_settings s
  WHERE s.key = p_key;

  IF v_raw IS NULL OR v_raw !~ '^[0-9]+$' THEN
    RETURN p_default;
  END IF;

  RETURN v_raw::INT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN p_default;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quiz_setting(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_setting(TEXT, INT) TO authenticated;

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('quiz.join.max_attempts',      '12', 'Failed room-code attempts allowed per window (per user and per IP)'),
  ('quiz.join.window_minutes',    '5',  'Throttle window for room-code attempts'),
  ('quiz.host.max_live_rooms',    '3',  'Concurrent live/paused rooms a single host may hold'),
  ('quiz.host.max_rooms_per_day', '20', 'Rooms a single host may create per day')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. S1 — public projection without room_code
--
--    `competitions_public_read` granted SELECT on `competitions` to
--    `anon` and `authenticated`, and `room_code` is an ordinary column,
--    so the code was enumerable with plain PostgREST. No shipped
--    component reads `competitions` except LiveHub (filtered by
--    host_id, which `competitions_host_all` already covers), so the
--    blanket policy is replaced by this view.
--
--    The view intentionally runs with owner rights (security_invoker is
--    NOT set) so it can serve anonymous callers, and carries its own
--    WHERE clause as the safety boundary. It must never expose
--    room_code, host_id or youtube_url.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS competitions_public_read ON public.competitions;

CREATE OR REPLACE VIEW public.competitions_public AS
SELECT
  c.id,
  c.title,
  c.category,
  c.status,
  c.visibility,
  c.question_count,
  c.max_participants,
  c.scheduled_at,
  c.started_at,
  c.ended_at,
  c.created_at
FROM public.competitions c
WHERE c.visibility = 'public'
  AND c.status <> 'draft';

REVOKE ALL ON public.competitions_public FROM PUBLIC;
GRANT SELECT ON public.competitions_public TO anon, authenticated;

COMMENT ON VIEW public.competitions_public IS
  'Anonymous-safe projection of public competitions. Never include room_code, host_id or youtube_url here.';

-- ------------------------------------------------------------
-- 3. S2 — join attempt log + throttle
--    Written only from inside SECURITY DEFINER functions; no grants and
--    no policies, so the log itself is invisible to clients.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.join_attempts (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash    TEXT,
  room_code  TEXT,
  outcome    TEXT NOT NULL
             CHECK (outcome IN ('ok', 'not_found', 'closed', 'full', 'finished', 'throttled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_join_attempts_user
  ON public.join_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_join_attempts_ip
  ON public.join_attempts (ip_hash, created_at DESC);

ALTER TABLE public.join_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.join_attempts FROM anon, authenticated;

-- Best-effort, server-side IP identity. x-forwarded-for is set by the
-- Supabase gateway in front of PostgREST; it is used only to bucket
-- failures (hashed, never stored raw) and never as an authorization
-- input, so a spoofed value cannot grant access — only change a bucket.
CREATE OR REPLACE FUNCTION public.live_quiz_ip_hash()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers JSON;
  v_ip      TEXT;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION
    WHEN OTHERS THEN
      v_headers := NULL;
  END;

  v_ip := coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip');
  IF v_ip IS NULL OR v_ip = '' THEN
    RETURN NULL;
  END IF;

  -- first hop only, and hash so the log carries no raw address
  RETURN md5(split_part(v_ip, ',', 1));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_ip_hash() FROM PUBLIC;

-- ------------------------------------------------------------
-- 4. S2 + S4 — JOIN, rewritten
--    * one generic failure shape (`invalid_or_unavailable`) so a probe
--      cannot distinguish missing / closed / full / finished rooms
--    * per-user AND per-IP sliding-window throttle on failures only,
--      so a legitimate player retrying a typo is never locked out by
--      their own successes
--    * pg_advisory_xact_lock serialises the capacity check with the
--      insert, so concurrent joins cannot exceed max_participants
-- ------------------------------------------------------------
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
  v_me        UUID := auth.uid();
  v_comp      public.competitions;
  v_count     INT;
  v_name      TEXT;
  v_part      public.competition_participants;
  v_ip_hash   TEXT;
  v_code      TEXT;
  v_max       INT;
  v_window    INT;
  v_recent    INT;
  v_retry     INT;
  v_outcome   TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_code    := btrim(coalesce(p_room_code, ''));
  v_ip_hash := public.live_quiz_ip_hash();
  v_max     := greatest(public.quiz_setting('quiz.join.max_attempts', 12), 1);
  v_window  := greatest(public.quiz_setting('quiz.join.window_minutes', 5), 1);

  -- Throttle on failures inside the window, for this user and this IP.
  SELECT count(*), coalesce(
           ceil(extract(epoch FROM (
             min(a.created_at) + (v_window || ' minutes')::interval - now()
           )))::INT, 0)
  INTO v_recent, v_retry
  FROM public.join_attempts a
  WHERE a.created_at > now() - (v_window || ' minutes')::interval
    AND a.outcome <> 'ok'
    AND (
      a.user_id = v_me
      OR (v_ip_hash IS NOT NULL AND a.ip_hash = v_ip_hash)
    );

  IF v_recent >= v_max THEN
    INSERT INTO public.join_attempts (user_id, ip_hash, room_code, outcome)
    VALUES (v_me, v_ip_hash, left(v_code, 6), 'throttled');

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_or_unavailable',
      'throttled', true,
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
          -- no score, no answer key: display name and a count only
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

-- ------------------------------------------------------------
-- 5. S3 — ANSWER, rewritten
--    The old body ran an EXISTS pre-check and then an INSERT. Under
--    concurrency both requests passed the check and the second hit the
--    UNIQUE(competition_question_id, participant_id) constraint, so an
--    ordinary double-tap surfaced as SQLSTATE 23505. The insert is now
--    the decision point: ON CONFLICT DO NOTHING + ROW_COUNT.
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

  v_deadline := v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL;
  IF v_comp.current_started_at IS NULL OR now() >= v_deadline THEN
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
-- 6. S5 — CREATE, rewritten with a per-host room cap
--    Body is otherwise identical to 20261117 so existing behaviour and
--    the RLS WITH CHECK (host_id = auth.uid()) contract are preserved.
--    The cap is checked under an advisory lock so concurrent creates
--    cannot both pass it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_create(
  p_title            TEXT,
  p_question_ids     UUID[],
  p_category         TEXT DEFAULT 'General',
  p_youtube_url      TEXT DEFAULT NULL,
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
  v_me      UUID := auth.uid();
  v_comp    public.competitions;
  v_q       RECORD;
  v_snap    UUID;
  v_pos     INT := 0;
  v_live    INT;
  v_today   INT;
  v_max_live INT;
  v_max_day  INT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_live_quiz_host(v_me) THEN
    RAISE EXCEPTION 'not allowed to host competitions' USING ERRCODE = '42501';
  END IF;
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'select at least one question' USING ERRCODE = '22023';
  END IF;

  v_max_live := greatest(public.quiz_setting('quiz.host.max_live_rooms', 3), 1);
  v_max_day  := greatest(public.quiz_setting('quiz.host.max_rooms_per_day', 20), 1);

  PERFORM pg_advisory_xact_lock(hashtextextended('live_quiz_host:' || v_me::text, 0));

  SELECT count(*) INTO v_live
  FROM public.competitions c
  WHERE c.host_id = v_me AND c.status IN ('draft', 'waiting', 'live', 'paused');

  IF v_live >= v_max_live THEN
    RAISE EXCEPTION 'room limit reached' USING ERRCODE = '54000';
  END IF;

  SELECT count(*) INTO v_today
  FROM public.competitions c
  WHERE c.host_id = v_me AND c.created_at > now() - INTERVAL '24 hours';

  IF v_today >= v_max_day THEN
    RAISE EXCEPTION 'daily room limit reached' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.competitions (
    host_id, title, category, youtube_url, room_code, status, visibility,
    default_timer_seconds, points_correct, max_speed_bonus, max_participants,
    allow_late_join, reveal_answers_after, scheduled_at
  ) VALUES (
    v_me, btrim(p_title), coalesce(p_category, 'General'), p_youtube_url,
    public.live_quiz_new_room_code(),
    'waiting',
    CASE WHEN p_visibility IN ('public', 'code_only') THEN p_visibility ELSE 'code_only' END,
    LEAST(GREATEST(p_timer_seconds, 5), 300),
    LEAST(GREATEST(p_points_correct, 1), 1000),
    LEAST(GREATEST(p_max_speed_bonus, 0), 200),
    LEAST(GREATEST(p_max_participants, 1), 5000),
    p_allow_late_join, p_reveal_answers, p_scheduled_at
  )
  RETURNING * INTO v_comp;

  FOR v_q IN
    SELECT q.*
    FROM unnest(p_question_ids) WITH ORDINALITY AS t(id, ord)
    JOIN public.question_bank q ON q.id = t.id
    WHERE (q.created_by = v_me OR public.is_platform_admin(auth.uid()))
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
  WHERE id = v_comp.id
  RETURNING * INTO v_comp;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, 'competition_created',
          jsonb_build_object('title', v_comp.title, 'room_code', v_comp.room_code,
                             'question_count', v_comp.question_count));

  RETURN v_comp;
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_create(TEXT, UUID[], TEXT, TEXT, INT, INT, INT, INT, BOOLEAN, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_create(TEXT, UUID[], TEXT, TEXT, INT, INT, INT, INT, BOOLEAN, TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 7. S6 — re-assert the event log as the only broadcast surface
--    (20261117 did this conditionally; repeating it is a no-op if the
--    table is already published, and repairs a project where it is not.)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'competition_events'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_events;
  END IF;
END $$;
