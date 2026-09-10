-- ═══════════════════════════════════════════════════════════════════════════
-- 046_game_rooms_max_players.sql — raise game room capacity to 100 players
-- ═══════════════════════════════════════════════════════════════════════════
-- The client now creates rooms with GAME_CONFIG.MAX_PLAYERS = 100. This
-- migration updates the column default and the create_game_room() default so
-- rooms created without an explicit p_max_players also allow 100 players, and
-- bumps any open (waiting) rooms that were created under the old 8 limit.
-- The join_game_room() capacity check reads v_room.max_players, so it picks
-- up the new value automatically.

-- New rooms default to 100 players.
ALTER TABLE game_rooms ALTER COLUMN max_players SET DEFAULT 100;

-- Open rooms created before this change get the new capacity immediately
-- (rooms expire after 2 hours anyway, so this only affects live lobbies).
UPDATE game_rooms SET max_players = 100 WHERE status = 'waiting' AND max_players < 100;

-- create_game_room() default now matches the client's MAX_PLAYERS.
CREATE OR REPLACE FUNCTION create_game_room(
  p_player_id TEXT,
  p_nickname TEXT,
  p_difficulty TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10,
  p_max_players INT DEFAULT 100
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