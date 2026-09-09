-- ═══════════════════════════════════════════════════════════════════════════
-- 045_game_rooms.sql — Real-time multiplayer math games
-- ═══════════════════════════════════════════════════════════════════════════
-- Guest players (no auth required) play in rooms via Supabase Realtime.
-- All authoritative game state lives in the DB via RPC functions.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── TABLES ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code     TEXT NOT NULL UNIQUE,          -- 6-digit numeric string e.g. '482913'
  host_id       TEXT NOT NULL,                 -- player_id of the host
  game_type     TEXT NOT NULL DEFAULT 'quick_math',
  status        TEXT NOT NULL DEFAULT 'waiting',  -- waiting | starting | active | finished | expired
  difficulty    TEXT NOT NULL DEFAULT 'medium',    -- easy | medium | hard
  max_players   INT NOT NULL DEFAULT 8,
  total_rounds  INT NOT NULL DEFAULT 10,
  current_round INT NOT NULL DEFAULT 0,
  round_question JSONB,                        -- current question {text, answer, ...}
  round_started_at TIMESTAMPTZ,                -- when current round started (server timestamp)
  round_duration_ms INT NOT NULL DEFAULT 15000, -- 15 seconds per round
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours')
);

CREATE TABLE IF NOT EXISTS game_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL,                 -- temporary guest ID (client-generated UUID)
  nickname      TEXT NOT NULL,
  is_host       BOOLEAN NOT NULL DEFAULT false,
  is_ready      BOOLEAN NOT NULL DEFAULT false,
  is_connected  BOOLEAN NOT NULL DEFAULT true,
  score         INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  total_answered INT NOT NULL DEFAULT 0,
  avg_time_ms   BIGINT NOT NULL DEFAULT 0,     -- running average of answer times
  disconnected_at TIMESTAMPTZ,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, player_id)
);

CREATE TABLE IF NOT EXISTS game_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL,
  round_number  INT NOT NULL,
  answer        TEXT NOT NULL,
  is_correct    BOOLEAN NOT NULL DEFAULT false,
  points_awarded INT NOT NULL DEFAULT 0,
  answer_time_ms INT NOT NULL DEFAULT 0,       -- how long player took
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, player_id, round_number)     -- prevents double-submit
);

-- ── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON game_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_game_rooms_expires ON game_rooms(expires_at) WHERE status != 'expired';
CREATE INDEX IF NOT EXISTS idx_game_players_room ON game_players(room_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player ON game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_game_answers_room_round ON game_answers(room_id, round_number);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Guests have no Supabase auth, so RLS must allow anonymous access
-- but only through the RPC functions (which run with SECURITY DEFINER).

ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_answers ENABLE ROW LEVEL SECURITY;

-- Rooms: readable by anyone (for Realtime subscriptions), writable only via RPC
DROP POLICY IF EXISTS "game_rooms_select" ON game_rooms;
CREATE POLICY "game_rooms_select" ON game_rooms
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "game_rooms_insert" ON game_rooms;
CREATE POLICY "game_rooms_insert" ON game_rooms
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "game_rooms_update" ON game_rooms;
CREATE POLICY "game_rooms_update" ON game_rooms
  FOR UPDATE USING (true);

-- Players: readable by anyone in the same room, writable only via RPC
DROP POLICY IF EXISTS "game_players_select" ON game_players;
CREATE POLICY "game_players_select" ON game_players
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "game_players_insert" ON game_players;
CREATE POLICY "game_players_insert" ON game_players
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "game_players_update" ON game_players;
CREATE POLICY "game_players_update" ON game_players
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "game_players_delete" ON game_players;
CREATE POLICY "game_players_delete" ON game_players
  FOR DELETE USING (true);

-- Answers: readable by anyone in the same room, writable only via RPC
DROP POLICY IF EXISTS "game_answers_select" ON game_answers;
CREATE POLICY "game_answers_select" ON game_answers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "game_answers_insert" ON game_answers;
CREATE POLICY "game_answers_insert" ON game_answers
  FOR INSERT WITH CHECK (true);

-- ── HELPER: generate unique 6-digit room code ──────────────────────────────

CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    -- Random 6-digit code (100000–999999)
    code := LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0');
    -- Check collision with active rooms
    IF NOT EXISTS (
      SELECT 1 FROM game_rooms
      WHERE room_code = code AND status IN ('waiting', 'starting', 'active')
    ) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique room code after 20 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── HELPER: generate a math question ───────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_math_question(
  p_difficulty TEXT DEFAULT 'medium',
  p_round INT DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
  op TEXT;
  a INT;
  b INT;
  result INT;
  text_repr TEXT;
  time_limit INT;
BEGIN
  -- Time limits by difficulty
  CASE p_difficulty
    WHEN 'easy' THEN time_limit := 20000;
    WHEN 'hard' THEN time_limit := 10000;
    ELSE time_limit := 15000;
  END CASE;

  -- Pick random operation weighted by difficulty
  CASE p_difficulty
    WHEN 'easy' THEN
      op := CASE WHEN random() < 0.5 THEN '+' ELSE '-' END;
    WHEN 'hard' THEN
      op := CASE
        WHEN random() < 0.3 THEN '*'
        WHEN random() < 0.5 THEN '+'
        WHEN random() < 0.7 THEN '-'
        ELSE '/'
      END;
    ELSE -- medium
      op := CASE
        WHEN random() < 0.25 THEN '*'
        WHEN random() < 0.5 THEN '+'
        WHEN random() < 0.75 THEN '-'
        ELSE '+'
      END;
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
$$ LANGUAGE plpgsql;

-- ── RPC: create_game_room ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_game_room(
  p_player_id TEXT,
  p_nickname TEXT,
  p_difficulty TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10,
  p_max_players INT DEFAULT 8
)
RETURNS JSONB AS $$
DECLARE
  v_room_id UUID;
  v_code TEXT;
  v_nick TEXT;
BEGIN
  -- Validate nickname
  v_nick := TRIM(p_nickname);
  IF v_nick = '' OR LENGTH(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  -- Generate room code
  v_code := generate_room_code();

  -- Create room
  INSERT INTO game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
  VALUES (v_code, p_player_id, 'quick_math', p_difficulty, p_total_rounds, p_max_players)
  RETURNING id INTO v_room_id;

  -- Add host as first player
  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready)
  VALUES (v_room_id, p_player_id, v_nick, true, true);

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'room_code', v_code,
    'player_id', p_player_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: join_game_room ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION join_game_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_nickname TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_nick TEXT;
  v_player_count INT;
BEGIN
  v_nick := TRIM(p_nickname);
  IF v_nick = '' OR LENGTH(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  -- Find room
  SELECT * INTO v_room FROM game_rooms
  WHERE room_code = p_room_code AND status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or game already started';
  END IF;

  -- Check expiry
  IF v_room.expires_at < now() THEN
    UPDATE game_rooms SET status = 'expired' WHERE id = v_room.id;
    RAISE EXCEPTION 'Room has expired';
  END IF;

  -- Check capacity
  SELECT COUNT(*) INTO v_player_count FROM game_players WHERE room_id = v_room.id;
  IF v_player_count >= v_room.max_players THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  -- Check duplicate nickname in room
  IF EXISTS (SELECT 1 FROM game_players WHERE room_id = v_room.id AND nickname = v_nick) THEN
    RAISE EXCEPTION 'Nickname already taken in this room';
  END IF;

  -- Check if player already in room (reconnection)
  IF EXISTS (SELECT 1 FROM game_players WHERE room_id = v_room.id AND player_id = p_player_id) THEN
    UPDATE game_players SET is_connected = true, disconnected_at = NULL
    WHERE room_id = v_room.id AND player_id = p_player_id;
    RETURN jsonb_build_object(
      'room_id', v_room.id,
      'room_code', v_room.room_code,
      'player_id', p_player_id,
      'reconnected', true
    );
  END IF;

  -- Add player
  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready)
  VALUES (v_room.id, p_player_id, v_nick, false, false);

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'room_code', v_room.room_code,
    'player_id', p_player_id,
    'reconnected', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: start_game ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION start_game(p_room_id UUID, p_player_id TEXT)
RETURNS JSONB AS $$
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
  v_question := generate_math_question(v_room.difficulty, 1);

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
    'question', v_question,
    'round', 1,
    'starts_at', v_start_time,
    'total_rounds', v_room.total_rounds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: submit_answer ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_answer(
  p_room_id UUID,
  p_player_id TEXT,
  p_answer TEXT,
  p_answer_time_ms INT
)
RETURNS JSONB AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_correct_answer INT;
  v_is_correct BOOLEAN;
  v_points INT := 0;
  v_time_limit INT;
BEGIN
  -- Get room + current question
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not active'; END IF;

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

  -- Check time hasn't expired (allow 2s grace for network latency)
  v_time_limit := (v_room.round_question->>'time_limit_ms')::INT;
  IF v_room.round_started_at + (v_time_limit || 'ms')::INTERVAL + INTERVAL '2 seconds' < now() THEN
    -- Too late — record as incorrect with 0 points
    INSERT INTO game_answers (room_id, player_id, round_number, answer, is_correct, points_awarded, answer_time_ms)
    VALUES (p_room_id, p_player_id, v_room.current_round, p_answer, false, 0, p_answer_time_ms);

    UPDATE game_players SET total_answered = total_answered + 1
    WHERE room_id = p_room_id AND player_id = p_player_id;

    RETURN jsonb_build_object('correct', false, 'points', 0, 'timed_out', true);
  END IF;

  -- Validate answer server-side
  v_correct_answer := (v_room.round_question->>'answer')::INT;
  v_is_correct := (p_answer::INT = v_correct_answer);

  IF v_is_correct THEN
    -- Speed bonus: base 100 + up to 50 bonus for fast answers
    v_points := 100 + GREATEST(0, 50 - (p_answer_time_ms / 300));
  END IF;

  -- Record answer (UNIQUE constraint prevents double-submit)
  INSERT INTO game_answers (room_id, player_id, round_number, answer, is_correct, points_awarded, answer_time_ms)
  VALUES (p_room_id, p_player_id, v_room.current_round, p_answer, v_is_correct, v_points, p_answer_time_ms);

  -- Update player stats
  UPDATE game_players SET
    score = score + v_points,
    correct_count = correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
    total_answered = total_answered + 1,
    avg_time_ms = CASE
      WHEN total_answered = 0 THEN p_answer_time_ms
      ELSE (avg_time_ms * total_answered + p_answer_time_ms) / (total_answered + 1)
    END
  WHERE room_id = p_room_id AND player_id = p_player_id;

  RETURN jsonb_build_object(
    'correct', v_is_correct,
    'points', v_points,
    'correct_answer', v_correct_answer
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: advance_round ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION advance_round(p_room_id UUID, p_player_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_next_round INT;
  v_question JSONB;
  v_is_finished BOOLEAN := false;
BEGIN
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.host_id != p_player_id THEN RAISE EXCEPTION 'Only host can advance'; END IF;

  v_next_round := v_room.current_round + 1;

  IF v_next_round > v_room.total_rounds THEN
    -- Game finished
    UPDATE game_rooms SET status = 'finished', updated_at = now() WHERE id = p_room_id;
    v_is_finished := true;
  ELSE
    -- Generate next question
    v_question := generate_math_question(v_room.difficulty, v_next_round);

    UPDATE game_rooms SET
      current_round = v_next_round,
      round_question = v_question,
      round_started_at = now(),
      updated_at = now()
    WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object(
    'finished', v_is_finished,
    'round', CASE WHEN v_is_finished THEN v_room.total_rounds ELSE v_next_round END,
    'question', CASE WHEN v_is_finished THEN NULL ELSE v_question END,
    'starts_at', CASE WHEN v_is_finished THEN NULL ELSE now() END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: toggle_ready ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION toggle_ready(p_room_id UUID, p_player_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_new_ready BOOLEAN;
BEGIN
  UPDATE game_players SET is_ready = NOT is_ready
  WHERE room_id = p_room_id AND player_id = p_player_id
  RETURNING is_ready INTO v_new_ready;
  RETURN v_new_ready;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: leave_room ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION leave_room(p_room_id UUID, p_player_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_new_host_id TEXT;
BEGIN
  -- Remove player
  DELETE FROM game_players WHERE room_id = p_room_id AND player_id = p_player_id;

  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id;

  -- If room is empty, expire it
  IF NOT EXISTS (SELECT 1 FROM game_players WHERE room_id = p_room_id) THEN
    UPDATE game_rooms SET status = 'expired' WHERE id = p_room_id;
    RETURN;
  END IF;

  -- If host left, transfer to next player
  IF v_room.host_id = p_player_id THEN
    SELECT player_id INTO v_new_host_id
    FROM game_players WHERE room_id = p_room_id
    ORDER BY joined_at ASC LIMIT 1;

    UPDATE game_rooms SET host_id = v_new_host_id WHERE id = p_room_id;
    UPDATE game_players SET is_host = true WHERE room_id = p_room_id AND player_id = v_new_host_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: mark_disconnected ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_disconnected(p_room_id UUID, p_player_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE game_players
  SET is_connected = false, disconnected_at = now()
  WHERE room_id = p_room_id AND player_id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: mark_connected ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_connected(p_room_id UUID, p_player_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE game_players
  SET is_connected = true, disconnected_at = NULL
  WHERE room_id = p_room_id AND player_id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: get_room_state ─────────────────────────────────────────────────────
-- Returns full room state for reconnection / initial load

CREATE OR REPLACE FUNCTION get_room_state(p_room_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_players JSONB;
  v_answers JSONB;
BEGIN
  SELECT * INTO v_room FROM game_rooms WHERE room_code = p_room_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

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
      'round_question', v_room.round_question,
      'round_started_at', v_room.round_started_at,
      'round_duration_ms', v_room.round_duration_ms,
      'created_at', v_room.created_at,
      'expires_at', v_room.expires_at
    ),
    'players', COALESCE(v_players, '[]'::JSONB),
    'answers', COALESCE(v_answers, '[]'::JSONB)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── CLEANUP: expire old rooms ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_rooms()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE game_rooms SET status = 'expired'
  WHERE status IN ('waiting', 'starting', 'active')
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Enable Realtime on game tables ──────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'game_rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'game_players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'game_answers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_answers;
  END IF;
END $$;
