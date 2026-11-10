-- 20261133_game_integrity.sql
--
-- Three defects in the Quick Math room game. None of them are cosmetic: two are
-- reachable by any player from the browser, and one hangs a room outright.
--
--   1. generate_math_question — the medium branch of the operator CASE ends in
--      ELSE '+', so medium never produces division. A quarter of the questions
--      are silently converted into addition.
--   2. submit_answer — `p_answer::INT` throws on anything non-numeric, so the
--      empty timeout submission the client sends when the clock runs out
--      crashes instead of recording a miss. The same function awards its speed
--      bonus from the client-supplied p_answer_time_ms, so a modified client
--      sends 0 and collects the maximum 50 on every question.
--   3. advance_round — only the host can advance, and only their client drives
--      it. If the host closes the tab mid-game the room is frozen for everyone
--      still in it: no timeout, no watchdog, no recovery.

-- ── 1. Division on medium ───────────────────────────────────────────────────
-- Body is otherwise byte-identical to the live definition.

CREATE OR REPLACE FUNCTION public.generate_math_question(
  p_difficulty text DEFAULT 'medium'::text,
  p_round integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  op TEXT;
  a INT;
  b INT;
  result INT;
  text_repr TEXT;
  time_limit INT;
  v_roll DOUBLE PRECISION;
BEGIN
  -- Time limits by difficulty
  CASE p_difficulty
    WHEN 'easy' THEN time_limit := 20000;
    WHEN 'hard' THEN time_limit := 10000;
    ELSE time_limit := 15000;
  END CASE;

  -- Pick random operation weighted by difficulty.
  --
  -- One draw decided once. Chained random() calls inside a CASE are evaluated
  -- independently, which turned the intended weights into a cascade: medium
  -- measured 28% ×, 42% +, 23% − instead of 25% each.
  CASE p_difficulty
    WHEN 'easy' THEN
      op := CASE WHEN random() < 0.5 THEN '+' ELSE '-' END;
    ELSE
      v_roll := random();
      IF p_difficulty = 'hard' THEN
        op := CASE
          WHEN v_roll < 0.30 THEN '*'
          WHEN v_roll < 0.50 THEN '+'
          WHEN v_roll < 0.70 THEN '-'
          ELSE '/'
        END;
      ELSE -- medium: 25% ×, +, − and ÷ (was ELSE '+' → no division at all)
        op := CASE
          WHEN v_roll < 0.25 THEN '*'
          WHEN v_roll < 0.50 THEN '+'
          WHEN v_roll < 0.75 THEN '-'
          ELSE '/'
        END;
      END IF;
  END CASE;

  -- Generate operands based on operation and difficulty
  CASE op
    WHEN '+' THEN
      a := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * 50 + 1)::INT
        WHEN 'hard' THEN FLOOR(random() * 500 + 100)::INT
        ELSE FLOOR(random() * 200 + 20)::INT
      END;
      b := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * 50 + 1)::INT
        WHEN 'hard' THEN FLOOR(random() * 500 + 100)::INT
        ELSE FLOOR(random() * 200 + 20)::INT
      END;
      result := a + b;
      text_repr := a || ' + ' || b;
    WHEN '-' THEN
      a := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * 80 + 20)::INT
        WHEN 'hard' THEN FLOOR(random() * 800 + 200)::INT
        ELSE FLOOR(random() * 400 + 50)::INT
      END;
      b := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * a)::INT
        WHEN 'hard' THEN FLOOR(random() * a)::INT
        ELSE FLOOR(random() * a)::INT
      END;
      IF b = 0 THEN b := 1; END IF;
      result := a - b;
      text_repr := a || ' − ' || b;
    WHEN '*' THEN
      a := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * 10 + 2)::INT
        WHEN 'hard' THEN FLOOR(random() * 20 + 5)::INT
        ELSE FLOOR(random() * 12 + 3)::INT
      END;
      b := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * 10 + 2)::INT
        WHEN 'hard' THEN FLOOR(random() * 20 + 5)::INT
        ELSE FLOOR(random() * 12 + 3)::INT
      END;
      result := a * b;
      text_repr := a || ' × ' || b;
    WHEN '/' THEN
      -- Ensure clean division
      b := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * 9 + 2)::INT
        WHEN 'hard' THEN FLOOR(random() * 15 + 2)::INT
        ELSE FLOOR(random() * 12 + 2)::INT
      END;
      result := CASE p_difficulty
        WHEN 'easy' THEN FLOOR(random() * 10 + 1)::INT
        WHEN 'hard' THEN FLOOR(random() * 20 + 5)::INT
        ELSE FLOOR(random() * 12 + 2)::INT
      END;
      a := result * b;
      text_repr := a || ' ÷ ' || b;
  END CASE;

  RETURN jsonb_build_object(
    'text', text_repr,
    'answer', result,
    'operation', op,
    'time_limit_ms', time_limit
  );
END;
$fn$;

-- ── 2. submit_answer — no crash on a blank answer, server-side clock ────────

CREATE OR REPLACE FUNCTION public.submit_answer(
  p_room_id uuid,
  p_player_id text,
  p_answer text,
  p_answer_time_ms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_correct_answer INT;
  v_guess INT;
  v_is_correct BOOLEAN := false;
  v_points INT := 0;
  v_time_limit INT;
  v_elapsed INT;
  v_raw TEXT;
BEGIN
  -- Get room + current question
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not active'; END IF;
  IF v_room.round_question IS NULL OR v_room.round_started_at IS NULL THEN
    RAISE EXCEPTION 'Round not started';
  END IF;

  -- Verify player is in room and connected
  IF NOT EXISTS (
    SELECT 1 FROM game_players
    WHERE room_id = p_room_id AND player_id = p_player_id AND is_connected = true
  ) THEN
    RAISE EXCEPTION 'Player not in room';
  END IF;

  -- Prevent double-submit for this round
  IF EXISTS (
    SELECT 1 FROM game_answers
    WHERE room_id = p_room_id AND player_id = p_player_id AND round_number = v_room.current_round
  ) THEN
    RAISE EXCEPTION 'Already answered this round';
  END IF;

  v_time_limit := coalesce(
    (v_room.round_question->>'time_limit_ms')::INT,
    v_room.round_duration_ms,
    15000
  );

  -- Elapsed time is measured here, not taken from the client. p_answer_time_ms
  -- is kept in the signature for API compatibility but no longer awards
  -- anything: a browser that reports 0ms now gets whatever the server saw.
  v_elapsed := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (now() - v_room.round_started_at)) * 1000)
  )::INT;

  -- Beyond the limit and the 1.5s grace for the answer already in flight:
  -- record the miss and award nothing.
  IF v_elapsed > v_time_limit + 1500 THEN
    INSERT INTO game_answers (room_id, player_id, round_number, answer, is_correct, points_awarded, answer_time_ms)
    VALUES (p_room_id, p_player_id, v_room.current_round, coalesce(p_answer, ''), false, 0, LEAST(v_elapsed, v_time_limit + 1500));

    UPDATE game_players SET total_answered = total_answered + 1
    WHERE room_id = p_room_id AND player_id = p_player_id;

    RETURN jsonb_build_object('correct', false, 'points', 0, 'timed_out', true);
  END IF;

  -- Parse defensively. The timeout path sends an empty string, and a modified
  -- client can send anything at all; neither may raise inside the transaction.
  v_raw := btrim(coalesce(p_answer, ''));
  IF v_raw ~ '^[+-]?[0-9]{1,9}$' THEN
    v_guess := v_raw::INT;
  ELSE
    v_guess := NULL;
  END IF;

  v_correct_answer := (v_room.round_question->>'answer')::INT;
  v_is_correct := (v_guess IS NOT NULL AND v_guess = v_correct_answer);

  IF v_is_correct THEN
    -- Base 100 + up to 50 for speed, measured against the round clock.
    v_points := 100 + GREATEST(0, 50 - (LEAST(v_elapsed, v_time_limit) / 300));
  END IF;

  INSERT INTO game_answers (room_id, player_id, round_number, answer, is_correct, points_awarded, answer_time_ms)
  VALUES (p_room_id, p_player_id, v_room.current_round, coalesce(p_answer, ''), v_is_correct, v_points,
          LEAST(v_elapsed, v_time_limit));

  UPDATE game_players SET
    score = score + v_points,
    correct_count = correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
    total_answered = total_answered + 1,
    avg_time_ms = CASE
      WHEN total_answered = 0 THEN LEAST(v_elapsed, v_time_limit)
      ELSE (avg_time_ms * total_answered + LEAST(v_elapsed, v_time_limit)) / (total_answered + 1)
    END
  WHERE room_id = p_room_id AND player_id = p_player_id;

  RETURN jsonb_build_object(
    'correct', v_is_correct,
    'points', v_points,
    'correct_answer', v_correct_answer
  );
END;
$fn$;

-- ── 3. Round advance that does not depend on the host staying online ────────

-- Internal, no authorization of its own — callers check first. Not executable
-- by clients, or anyone could skip rounds at will.
CREATE OR REPLACE FUNCTION public.game_room_advance(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_next INT;
  v_question JSONB;
BEGIN
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

  -- Idempotent: several clients may tick the same expired round at once.
  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object(
      'finished', v_room.status = 'finished',
      'round', v_room.current_round,
      'question', NULL,
      'starts_at', NULL
    );
  END IF;

  v_next := v_room.current_round + 1;

  IF v_next > v_room.total_rounds THEN
    UPDATE game_rooms SET status = 'finished', updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'finished', true,
      'round', v_room.total_rounds,
      'question', NULL,
      'starts_at', NULL
    );
  END IF;

  v_question := public.generate_math_question(v_room.difficulty, v_next);

  UPDATE game_rooms SET
    current_round = v_next,
    round_question = v_question,
    round_started_at = now(),
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'finished', false,
    'round', v_next,
    'question', v_question - 'answer',
    'starts_at', now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.game_room_advance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.game_room_advance(uuid) FROM anon, authenticated;

-- Advances an active room whose round deadline (plus grace) has passed.
CREATE OR REPLACE FUNCTION public.game_room_tick(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_limit INT;
BEGIN
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.status <> 'active' OR v_room.round_started_at IS NULL THEN
    RETURN;
  END IF;

  v_limit := coalesce(
    (v_room.round_question->>'time_limit_ms')::INT,
    v_room.round_duration_ms,
    15000
  );

  IF now() < v_room.round_started_at + ((v_limit + 2000) || ' ms')::INTERVAL THEN
    RETURN;
  END IF;

  PERFORM public.game_room_advance(p_room_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.game_room_tick(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.game_room_tick(uuid) FROM anon, authenticated;

-- The host may advance whenever their client says everyone has answered. Any
-- other player may advance a round whose clock has run out — that is the whole
-- recovery path when the host has gone.
CREATE OR REPLACE FUNCTION public.advance_round(
  p_room_id uuid,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_limit INT;
BEGIN
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

  IF v_room.status <> 'active' THEN
    RETURN public.game_room_advance(p_room_id);
  END IF;

  v_limit := coalesce(
    (v_room.round_question->>'time_limit_ms')::INT,
    v_room.round_duration_ms,
    15000
  );

  IF v_room.host_id = p_player_id THEN
    NULL; -- host drives the room
  ELSIF v_room.round_started_at IS NOT NULL
        AND now() >= v_room.round_started_at + ((v_limit + 1000) || ' ms')::INTERVAL
        AND EXISTS (
          SELECT 1 FROM game_players
          WHERE room_id = p_room_id AND player_id = p_player_id
        ) THEN
    NULL; -- round expired: anyone still in the room may move it along
  ELSE
    RAISE EXCEPTION 'Only host can advance';
  END IF;

  RETURN public.game_room_advance(p_room_id);
END;
$fn$;

-- ── 4. Room state reads repair the room, and stop leaking the solution ──────
-- Every player polls this, so a round nobody advanced now recovers on the next
-- poll rather than freezing the game. `answer` is removed from round_question:
-- the client only needs the expression and uses submit_answer's response (and
-- its correct_answer field) for correctness and feedback.

CREATE OR REPLACE FUNCTION public.get_room_state(p_room_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_players JSONB;
  v_answers JSONB;
BEGIN
  SELECT * INTO v_room FROM game_rooms WHERE room_code = p_room_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

  -- Watchdog: advances an expired round even when the host has left.
  PERFORM public.game_room_tick(v_room.id);
  SELECT * INTO v_room FROM game_rooms WHERE id = v_room.id;

  SELECT jsonb_agg(jsonb_build_object(
    'player_id', player_id,
    'nickname', nickname,
    'is_host', is_host,
    'is_ready', is_ready,
    'is_connected', is_connected,
    'score', score,
    'correct_count', correct_count,
    'total_answered', total_answered,
    'avg_time_ms', avg_time_ms,
    'joined_at', joined_at
  ) ORDER BY score DESC, joined_at ASC) INTO v_players
  FROM game_players WHERE room_id = v_room.id;

  -- Current round answers (for scoreboard)
  IF v_room.current_round > 0 AND v_room.status = 'active' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'player_id', player_id,
      'is_correct', is_correct,
      'points_awarded', points_awarded,
      'answer_time_ms', answer_time_ms
    )) INTO v_answers
    FROM game_answers
    WHERE room_id = v_room.id AND round_number = v_room.current_round;
  ELSE
    v_answers := '[]'::JSONB;
  END IF;

  RETURN jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id,
      'room_code', v_room.room_code,
      'host_id', v_room.host_id,
      'game_type', v_room.game_type,
      'status', v_room.status,
      'difficulty', v_room.difficulty,
      'max_players', v_room.max_players,
      'total_rounds', v_room.total_rounds,
      'current_round', v_room.current_round,
      -- The solution is not sent to the browser. Every player polls this
      -- function, so including `answer` handed the correct value to anyone who
      -- opened devtools; scoring stays in submit_answer.
      'round_question', v_room.round_question - 'answer',
      'round_started_at', v_room.round_started_at,
      'round_duration_ms', v_room.round_duration_ms,
      'created_at', v_room.created_at,
      'expires_at', v_room.expires_at
    ),
    'players', COALESCE(v_players, '[]'::JSONB),
    'answers', COALESCE(v_answers, '[]'::JSONB)
  );
END;
$fn$;

-- ── 5. start_game stops returning the solution ──────────────────────────────
-- Same leak, different payload. The client ignores the returned question and
-- waits for room state, so only the field changes.

CREATE OR REPLACE FUNCTION public.start_game(
  p_room_id uuid,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_ready_count INT;
  v_total INT;
  v_question JSONB;
  v_start_time TIMESTAMPTZ;
BEGIN
  -- Verify host
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.host_id != p_player_id THEN RAISE EXCEPTION 'Only host can start'; END IF;
  IF v_room.status != 'waiting' THEN RAISE EXCEPTION 'Game already started'; END IF;

  -- Need at least 2 players
  SELECT COUNT(*) INTO v_total FROM game_players WHERE room_id = p_room_id;
  IF v_total < 2 THEN RAISE EXCEPTION 'Need at least 2 players'; END IF;

  -- All must be ready (host is auto-ready)
  SELECT COUNT(*) INTO v_ready_count FROM game_players
  WHERE room_id = p_room_id AND is_ready = true;
  IF v_ready_count < v_total THEN RAISE EXCEPTION 'Not all players are ready'; END IF;

  -- Generate first question
  v_question := public.generate_math_question(v_room.difficulty, 1);

  -- Server timestamp for countdown sync
  v_start_time := now() + INTERVAL '3 seconds'; -- 3s countdown

  UPDATE game_rooms SET
    status = 'active',
    current_round = 1,
    round_question = v_question,
    round_started_at = v_start_time,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'status', 'active',
    'question', v_question - 'answer',
    'round', 1,
    'starts_at', v_start_time,
    'total_rounds', v_room.total_rounds
  );
END;
$fn$;
