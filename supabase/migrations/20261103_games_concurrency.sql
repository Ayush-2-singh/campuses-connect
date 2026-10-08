-- ═══════════════════════════════════════════════════════════════════════════
-- 20261103_games_concurrency.sql — games that survive a crowd
-- ═══════════════════════════════════════════════════════════════════════════
-- Four things broke once more than a handful of students played at once:
--
--   1. ROOM CODES were only checked against rooms still in flight, but the
--      UNIQUE constraint covers the WHOLE table. As soon as games started
--      finishing, a freed code looked "free" and the insert blew up with a
--      unique violation — room creation and joins failed at random.
--   2. JOINS raced the capacity check: two players read the same player count,
--      both passed, both inserted — a 2-player room ended up with three.
--   3. The 1v1 queue could pair the same two players TWICE: with SKIP LOCKED,
--      A locks B while B locks A, and both create a room.
--   4. A player who already finished a match kept a 'matched' queue row
--      pointing at the finished room, so their NEXT Quick Match dropped them
--      back into the dead game instead of the queue.
--
-- Everything still writes through the same RPCs; only the internals change.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Room codes: unique against the whole table, not just live rooms ──────

CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_code     TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    v_code := LPAD(FLOOR(random() * 900000 + 100000)::INT::TEXT, 6, '0');

    -- game_rooms.room_code is UNIQUE across every status: a code retired by a
    -- finished or expired room is still taken. Checking only the live statuses
    -- handed out codes that then violated the constraint on insert.
    IF NOT EXISTS (SELECT 1 FROM public.game_rooms WHERE room_code = v_code) THEN
      RETURN v_code;
    END IF;

    IF v_attempts >= 50 THEN
      RAISE EXCEPTION 'room_code_unavailable';
    END IF;
  END LOOP;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.generate_room_code() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_room_code() TO anon, authenticated;

-- ── 2. One place that inserts a room with a collision-proof code ────────────
-- Internal helper: not granted to clients. Two creators can still pick the
-- same code in the same instant (both pass the NOT EXISTS check before either
-- commits); the winner inserts, the loser catches unique_violation and retries.

CREATE OR REPLACE FUNCTION public.reserve_game_room(
  p_host_id      TEXT,
  p_game_type    TEXT,
  p_difficulty   TEXT,
  p_total_rounds INT,
  p_max_players  INT
)
RETURNS TABLE (out_room_id UUID, out_room_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_code    TEXT;
  v_id      UUID;
  v_attempt INT := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public.generate_room_code();
    BEGIN
      INSERT INTO public.game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
      VALUES (v_code, p_host_id, p_game_type, p_difficulty, p_total_rounds, p_max_players)
      RETURNING id INTO v_id;

      out_room_id   := v_id;
      out_room_code := v_code;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 10 THEN
        RAISE EXCEPTION 'room_code_unavailable';
      END IF;
    END;
  END LOOP;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.reserve_game_room(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC;

-- ── 3. Quick Math — create ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_game_room(
  p_player_id    TEXT,
  p_nickname     TEXT,
  p_difficulty   TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10,
  p_max_players  INT DEFAULT 100,
  p_user_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_nick    TEXT := btrim(p_nickname);
  v_room_id UUID;
  v_code    TEXT;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  SELECT r.out_room_id, r.out_room_code INTO v_room_id, v_code
  FROM public.reserve_game_room(p_player_id, 'quick_math', p_difficulty, p_total_rounds, p_max_players) AS r;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, p_player_id, v_nick, TRUE, TRUE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room_id, 'room_code', v_code, 'player_id', p_player_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_game_room(TEXT, TEXT, TEXT, INT, INT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_game_room(TEXT, TEXT, TEXT, INT, INT, UUID) TO anon, authenticated;

-- ── 4. Quick Math — join (serialised on the room row) ───────────────────────

CREATE OR REPLACE FUNCTION public.join_game_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_nickname  TEXT,
  p_user_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room  public.game_rooms%ROWTYPE;
  v_nick  TEXT := btrim(p_nickname);
  v_count INT;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  -- FOR UPDATE makes concurrent joins to the same code queue behind each
  -- other, so the capacity check below can never be stale. Codes are stored
  -- uppercase; we normalise here so a lowercase paste still lands.
  SELECT * INTO v_room
  FROM public.game_rooms
  WHERE room_code = upper(btrim(p_room_code)) AND status = 'waiting'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or game already started';
  END IF;

  IF v_room.expires_at < now() THEN
    UPDATE public.game_rooms SET status = 'expired' WHERE id = v_room.id;
    RAISE EXCEPTION 'Room has expired';
  END IF;

  -- Reconnection first: a returning player keeps their seat even in a room
  -- that is otherwise full.
  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND player_id = p_player_id) THEN
    UPDATE public.game_players
       SET is_connected = TRUE, disconnected_at = NULL, user_id = COALESCE(p_user_id, user_id)
     WHERE room_id = v_room.id AND player_id = p_player_id;
    RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'player_id', p_player_id, 'reconnected', TRUE);
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.game_players WHERE room_id = v_room.id;
  IF v_count >= v_room.max_players THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND nickname = v_nick) THEN
    RAISE EXCEPTION 'Nickname already taken in this room';
  END IF;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room.id, p_player_id, v_nick, FALSE, FALSE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'player_id', p_player_id, 'reconnected', FALSE);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.join_game_room(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_game_room(TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

-- ── 5. Matchmaking — one pair-up at a time, and no stale rooms ──────────────

CREATE OR REPLACE FUNCTION public.join_matchmaking(
  p_player_id    TEXT,
  p_nickname     TEXT,
  p_difficulty   TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10,
  p_user_id      UUID DEFAULT NULL,
  p_game_type    TEXT DEFAULT 'quick_math'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me       public.game_matchmaking%ROWTYPE;
  v_opponent public.game_matchmaking%ROWTYPE;
  v_room_id  UUID;
  v_code     TEXT;
  v_nick     TEXT := btrim(p_nickname);
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_game_type NOT IN ('quick_math', 'typing_battle') THEN RAISE EXCEPTION 'invalid_game_type'; END IF;

  -- Serialise pairing per bucket. Without this, A locks B's row while B locks
  -- A's, both find an opponent, and both create a room for the same pair.
  -- Each pair-up is a few milliseconds, so the wait is negligible.
  PERFORM pg_advisory_xact_lock(hashtext(p_game_type || ':' || p_difficulty || ':' || p_total_rounds::TEXT));

  -- Already matched into a room that is STILL joinable? Hand it back. A row
  -- left over from a finished game must not trap the player in that dead room.
  SELECT m.* INTO v_me
  FROM public.game_matchmaking m
  JOIN public.game_rooms r ON r.id = m.room_id
  WHERE m.player_id = p_player_id
    AND m.status = 'matched'
    AND m.room_code IS NOT NULL
    AND r.status IN ('waiting', 'starting', 'active');

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'matched', 'room_id', v_me.room_id, 'room_code', v_me.room_code, 'player_id', p_player_id);
  END IF;

  DELETE FROM public.game_matchmaking WHERE status = 'waiting' AND expires_at < now();

  INSERT INTO public.game_matchmaking (player_id, nickname, difficulty, total_rounds, user_id, game_type)
  VALUES (p_player_id, v_nick, p_difficulty, p_total_rounds, p_user_id, p_game_type)
  ON CONFLICT (player_id) DO UPDATE SET
    nickname     = EXCLUDED.nickname,
    difficulty   = EXCLUDED.difficulty,
    total_rounds = EXCLUDED.total_rounds,
    user_id      = EXCLUDED.user_id,
    game_type    = EXCLUDED.game_type,
    status       = 'waiting',
    room_id      = NULL,
    room_code    = NULL,
    created_at   = now(),
    updated_at   = now(),
    expires_at   = now() + INTERVAL '2 minutes';

  SELECT * INTO v_opponent
  FROM public.game_matchmaking
  WHERE status = 'waiting'
    AND game_type = p_game_type
    AND difficulty = p_difficulty
    AND total_rounds = p_total_rounds
    AND player_id <> p_player_id
    AND expires_at > now()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'waiting'); END IF;

  SELECT r.out_room_id, r.out_room_code INTO v_room_id, v_code
  FROM public.reserve_game_room(p_player_id, p_game_type, p_difficulty, 1, 2) AS r;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, p_player_id, v_nick, TRUE, TRUE, p_user_id);

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, v_opponent.player_id, v_opponent.nickname, FALSE, TRUE, v_opponent.user_id);

  UPDATE public.game_matchmaking
     SET status = 'matched', room_id = v_room_id, room_code = v_code, updated_at = now()
   WHERE player_id IN (p_player_id, v_opponent.player_id);

  RETURN jsonb_build_object('status', 'matched', 'room_id', v_room_id, 'room_code', v_code, 'player_id', p_player_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.join_matchmaking(TEXT, TEXT, TEXT, INT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_matchmaking(TEXT, TEXT, TEXT, INT, UUID, TEXT) TO anon, authenticated;

-- ── 6. Typing — create ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_typing_room(
  p_player_id TEXT,
  p_nickname  TEXT,
  p_user_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_nick    TEXT := btrim(p_nickname);
  v_room_id UUID;
  v_code    TEXT;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;

  SELECT r.out_room_id, r.out_room_code INTO v_room_id, v_code
  FROM public.reserve_game_room(p_player_id, 'typing_battle', 'medium', 1, 2) AS r;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, p_player_id, v_nick, TRUE, TRUE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room_id, 'room_code', v_code, 'player_id', p_player_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_typing_room(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_typing_room(TEXT, TEXT, UUID) TO anon, authenticated;

-- ── 7. Typing — join (serialised on the room row) ───────────────────────────

CREATE OR REPLACE FUNCTION public.join_typing_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_nickname  TEXT,
  p_user_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room  public.game_rooms%ROWTYPE;
  v_nick  TEXT := btrim(p_nickname);
  v_count INT;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;

  -- Same row lock as Quick Math: the second of two simultaneous joins waits,
  -- then sees the first one's row and correctly reports the room full.
  SELECT * INTO v_room
  FROM public.game_rooms
  WHERE room_code = upper(btrim(p_room_code))
    AND game_type = 'typing_battle'
    AND status = 'waiting'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;

  IF v_room.expires_at < now() THEN
    UPDATE public.game_rooms SET status = 'expired' WHERE id = v_room.id;
    RAISE EXCEPTION 'room_expired';
  END IF;

  -- Reconnection: same guest id returns to its seat.
  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND player_id = p_player_id) THEN
    UPDATE public.game_players
       SET is_connected = TRUE, disconnected_at = NULL, user_id = COALESCE(p_user_id, user_id)
     WHERE room_id = v_room.id AND player_id = p_player_id;
    RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'player_id', p_player_id, 'reconnected', TRUE);
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.game_players WHERE room_id = v_room.id;
  IF v_count >= v_room.max_players THEN
    RAISE EXCEPTION 'room_full';
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND nickname = v_nick) THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room.id, p_player_id, v_nick, FALSE, FALSE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'player_id', p_player_id, 'reconnected', FALSE);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.join_typing_room(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_typing_room(TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

-- Existing rows with a stale 'matched' status are harmless now (the join path
-- ignores rooms that are no longer joinable), so no backfill is required.
