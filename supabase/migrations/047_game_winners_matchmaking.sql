-- ═══════════════════════════════════════════════════════════════════════════
-- 047_game_winners_matchmaking.sql — winner tracking + 1v1 random matchmaking
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) game_winners: one row per finished game (unique room_id). The trigger on
--    game_rooms records the winner (highest score, tie-broken like the client)
--    whenever a room transitions to 'finished'. get_game_winners() aggregates
--    each player's win count for the champions board (+1 per win).
-- 2) game_matchmaking: 1v1 quick-match queue. join_matchmaking() upserts the
--    player, then pairs them with the oldest compatible waiting opponent
--    (same difficulty + same round count). Both players are added to a fresh
--    2-player room, pre-readied, so the game can start immediately.

-- ── WINNER TRACKING ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_winners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL UNIQUE REFERENCES game_rooms(id) ON DELETE CASCADE,
  game_type       TEXT NOT NULL DEFAULT 'quick_math',
  winner_id       TEXT NOT NULL,             -- guest player_id (or auth uid)
  winner_nickname TEXT NOT NULL,
  winner_score    INT NOT NULL DEFAULT 0,
  won_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE game_winners ENABLE ROW LEVEL SECURITY;

-- Live-updating champions board: clients subscribe to winner inserts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'game_winners') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_winners;
  END IF;
END $$;

DROP POLICY IF EXISTS "game_winners_select" ON game_winners;
CREATE POLICY "game_winners_select" ON game_winners
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "game_winners_insert" ON game_winners;
CREATE POLICY "game_winners_insert" ON game_winners
  FOR INSERT WITH CHECK (true);

-- Record the winner whenever a room transitions to finished. Same ordering as
-- the client results screen: score DESC, correct_count DESC, joined_at ASC.
CREATE OR REPLACE FUNCTION record_game_winner() RETURNS TRIGGER AS $$
DECLARE
  v_winner game_players%ROWTYPE;
BEGIN
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    SELECT * INTO v_winner
    FROM game_players
    WHERE room_id = NEW.id
    ORDER BY score DESC, correct_count DESC, joined_at ASC
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO game_winners (room_id, game_type, winner_id, winner_nickname, winner_score)
      VALUES (NEW.id, NEW.game_type, v_winner.player_id, v_winner.nickname, v_winner.score)
      ON CONFLICT (room_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS game_rooms_finish_winner ON game_rooms;
CREATE TRIGGER game_rooms_finish_winner
AFTER UPDATE OF status ON game_rooms
FOR EACH ROW EXECUTE FUNCTION record_game_winner();

-- Champions board: per-player win count (latest nickname wins), ordered by wins.
CREATE OR REPLACE FUNCTION get_game_winners(p_limit INT DEFAULT 10)
RETURNS TABLE (winner_id TEXT, winner_nickname TEXT, wins INT, last_won_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH latest AS (
    SELECT DISTINCT ON (winner_id) winner_id, winner_nickname, won_at
    FROM game_winners
    ORDER BY winner_id, won_at DESC
  )
  SELECT l.winner_id, l.winner_nickname, COUNT(g.id)::INT AS wins, MAX(g.won_at) AS last_won_at
  FROM latest l
  JOIN game_winners g ON g.winner_id = l.winner_id
  GROUP BY l.winner_id, l.winner_nickname
  ORDER BY wins DESC, MAX(g.won_at) DESC
  LIMIT p_limit;
$$;

-- ── 1V1 RANDOM MATCHMAKING ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_matchmaking (
  player_id    TEXT PRIMARY KEY,             -- guest player_id
  nickname     TEXT NOT NULL,
  difficulty   TEXT NOT NULL DEFAULT 'medium',
  total_rounds INT NOT NULL DEFAULT 10,
  status       TEXT NOT NULL DEFAULT 'waiting',   -- waiting | matched
  room_id      UUID,
  room_code    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 minutes')
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_waiting ON game_matchmaking(status, difficulty, total_rounds, created_at);

ALTER TABLE game_matchmaking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_matchmaking_select" ON game_matchmaking;
CREATE POLICY "game_matchmaking_select" ON game_matchmaking
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "game_matchmaking_insert" ON game_matchmaking;
CREATE POLICY "game_matchmaking_insert" ON game_matchmaking
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "game_matchmaking_update" ON game_matchmaking;
CREATE POLICY "game_matchmaking_update" ON game_matchmaking
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "game_matchmaking_delete" ON game_matchmaking;
CREATE POLICY "game_matchmaking_delete" ON game_matchmaking
  FOR DELETE USING (true);

-- Join the queue (or re-join). Pairs with the oldest compatible waiting
-- opponent; when matched, creates a 2-player pre-readied room for both.
CREATE OR REPLACE FUNCTION join_matchmaking(
  p_player_id TEXT,
  p_nickname TEXT,
  p_difficulty TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10
)
RETURNS JSONB AS $$
DECLARE
  v_me game_matchmaking%ROWTYPE;
  v_opponent game_matchmaking%ROWTYPE;
  v_room_id UUID;
  v_code TEXT;
  v_nick TEXT;
BEGIN
  v_nick := TRIM(p_nickname);
  IF v_nick = '' OR LENGTH(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  -- Already matched? Return the existing room instead of re-queuing.
  SELECT * INTO v_me
  FROM game_matchmaking
  WHERE player_id = p_player_id AND status = 'matched' AND room_code IS NOT NULL;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'matched',
      'room_id', v_me.room_id,
      'room_code', v_me.room_code,
      'player_id', p_player_id
    );
  END IF;

  -- Clear stale queue entries.
  DELETE FROM game_matchmaking WHERE status = 'waiting' AND expires_at < now();

  -- Upsert self into the queue (fresh waiting entry).
  INSERT INTO game_matchmaking (player_id, nickname, difficulty, total_rounds)
  VALUES (p_player_id, v_nick, p_difficulty, p_total_rounds)
  ON CONFLICT (player_id) DO UPDATE SET
    nickname    = EXCLUDED.nickname,
    difficulty  = EXCLUDED.difficulty,
    total_rounds = EXCLUDED.total_rounds,
    status      = 'waiting',
    room_id     = NULL,
    room_code   = NULL,
    created_at  = now(),
    updated_at  = now(),
    expires_at  = now() + INTERVAL '2 minutes';

  -- Pick the oldest compatible waiting opponent (SKIP LOCKED prevents two
  -- players from claiming the same opponent concurrently).
  SELECT * INTO v_opponent
  FROM game_matchmaking
  WHERE status = 'waiting'
    AND difficulty = p_difficulty
    AND total_rounds = p_total_rounds
    AND player_id != p_player_id
    AND expires_at > now()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'waiting');
  END IF;

  -- Create a 2-player room; the current player hosts and both are ready.
  v_code := generate_room_code();
  INSERT INTO game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
  VALUES (v_code, p_player_id, 'quick_math', p_difficulty, p_total_rounds, 2)
  RETURNING id INTO v_room_id;

  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready)
  VALUES (v_room_id, p_player_id, v_nick, true, true);

  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready)
  VALUES (v_room_id, v_opponent.player_id, v_opponent.nickname, false, true);

  -- Mark both players as matched so their poll picks up the room.
  UPDATE game_matchmaking SET
    status = 'matched', room_id = v_room_id, room_code = v_code, updated_at = now()
  WHERE player_id IN (p_player_id, v_opponent.player_id);

  RETURN jsonb_build_object(
    'status', 'matched',
    'room_id', v_room_id,
    'room_code', v_code,
    'player_id', p_player_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Polled by the client while searching.
CREATE OR REPLACE FUNCTION check_matchmaking_status(p_player_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_row game_matchmaking%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM game_matchmaking WHERE player_id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_in_queue');
  END IF;
  RETURN jsonb_build_object(
    'status', v_row.status,
    'room_id', v_row.room_id,
    'room_code', v_row.room_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancel a search (no-op if already matched).
CREATE OR REPLACE FUNCTION leave_matchmaking(p_player_id TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM game_matchmaking WHERE player_id = p_player_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;