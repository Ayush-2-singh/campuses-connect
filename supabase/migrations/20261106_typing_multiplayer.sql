-- ═══════════════════════════════════════════════════════════════════════════
-- 20261106_typing_multiplayer.sql — 8-player typing races + live win board
-- ═══════════════════════════════════════════════════════════════════════════
-- Three problems this fixes:
--
--   1. ONLY 2 PLAYERS COULD PLAY. create_typing_room() reserved max_players=2
--      and Quick Match always paired exactly one opponent. Rooms now hold up
--      to 8: private rooms by raising their capacity, Quick Match by pooling
--      queue joiners into one shared public room until it fills.
--
--   2. OTHER PLAYERS' PROGRESS WAS HALF-BROKEN. The first player to finish
--      flipped the room to 'finished', so everyone else's complete_typing_match
--      call hit 'not_active' and their result — and their loss — was never
--      recorded. The room now stays 'active' until every seated player has
--      submitted, and each submission writes that player's own stats.
--
--   3. THE LEADERBOARD NEVER MOVED FOR LOSERS. Because only the first finisher
--      could submit, wins were the only thing that ever changed. Now every
--      finisher is recorded (wins AND losses), and typing_stats is published on
--      Realtime so the board updates the moment a match ends.
--
-- Winner rule is unchanged: the FIRST valid completion wins. Everyone else is
-- recorded as a loss. The winner row is inserted before the room can finish, so
-- the finish trigger can never award the win to the wrong player.

-- ── 1. Public (match-made) rooms become distinguishable from private ones ────
-- Quick Match pools into rooms it owns; a private room shared by code must
-- never be swept into somebody else's Quick Match. This flag is that boundary.

ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS matchmade BOOLEAN NOT NULL DEFAULT FALSE;

-- Speeds up the "find an open public typing room" lookup.
CREATE INDEX IF NOT EXISTS idx_game_rooms_matchmade_open
  ON public.game_rooms (game_type, status, created_at)
  WHERE matchmade;

-- ── 2. Private rooms hold 8 players ─────────────────────────────────────────
-- Same body as 20261103, only the reserved capacity changes. join_typing_room()
-- already reads v_room.max_players, so its capacity check picks this up for
-- free and its row lock still prevents over-filling.

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
  FROM public.reserve_game_room(p_player_id, 'typing_battle', 'medium', 1, 8) AS r;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, p_player_id, v_nick, TRUE, TRUE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room_id, 'room_code', v_code, 'player_id', p_player_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_typing_room(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_typing_room(TEXT, TEXT, UUID) TO anon, authenticated;

-- ── 3. Heartbeats no longer declare a player finished ───────────────────────
-- The old version set finished=TRUE as soon as the last word's heartbeat
-- arrived — before the player had actually submitted. A player who closed the
-- tab mid-submit could then finish the room for everyone else. Only
-- complete_typing_match() may mark a player finished now.

CREATE OR REPLACE FUNCTION public.update_typing_progress(
  p_room_id      UUID,
  p_player_id    TEXT,
  p_completed    INT,
  p_correct      INT,
  p_total_typed  INT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_total INT;
BEGIN
  SELECT COALESCE(array_length(words, 1), 0) INTO v_total
    FROM public.typing_words WHERE room_id = p_room_id;
  IF v_total IS NULL THEN RAISE EXCEPTION 'not_active'; END IF;

  UPDATE public.typing_progress SET
    completed     = LEAST(GREATEST(p_completed, 0), v_total),
    total         = v_total,
    correct_chars = GREATEST(p_correct, 0),
    total_chars   = GREATEST(p_total_typed, 0),
    updated_at    = now()
   WHERE room_id = p_room_id AND player_id = p_player_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.update_typing_progress(UUID, TEXT, INT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_typing_progress(UUID, TEXT, INT, INT, INT) TO anon, authenticated;

-- ── 4. Quick Match with up to 8 players ─────────────────────────────────────
-- Quick Math keeps its instant 1v1 pairing. Typing Battle instead pools:
--   • an open match-made typing room with a free seat → join it;
--   • otherwise, if a queue opponent is waiting → create a public 8-seat room
--     for the pair (later joiners keep filling it);
--   • otherwise → keep waiting.
-- The advisory lock from 20261103 serialises every join in the same bucket, so
-- two players can never both claim the last seat.

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
  v_me        public.game_matchmaking%ROWTYPE;
  v_opponent  public.game_matchmaking%ROWTYPE;
  v_open_room public.game_rooms%ROWTYPE;
  v_room_id   UUID;
  v_code      TEXT;
  v_nick      TEXT := btrim(p_nickname);
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_game_type NOT IN ('quick_math', 'typing_battle') THEN RAISE EXCEPTION 'invalid_game_type'; END IF;

  -- Serialise every join in this bucket (game type / difficulty / rounds).
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

  -- Typing Battle: try to drop into a public room that is still filling up.
  IF p_game_type = 'typing_battle' THEN
    SELECT r.* INTO v_open_room
    FROM public.game_rooms r
    WHERE r.game_type = 'typing_battle'
      AND r.status = 'waiting'
      AND r.matchmade
      AND r.expires_at > now()
      AND r.created_at > now() - INTERVAL '10 minutes'
      AND (SELECT COUNT(*) FROM public.game_players gp WHERE gp.room_id = r.id) < r.max_players
    ORDER BY r.created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
      VALUES (v_open_room.id, p_player_id, v_nick, FALSE, TRUE, p_user_id)
      ON CONFLICT (room_id, player_id) DO UPDATE
        SET is_connected = TRUE, disconnected_at = NULL, user_id = COALESCE(EXCLUDED.user_id, game_players.user_id);

      UPDATE public.game_matchmaking
         SET status = 'matched', room_id = v_open_room.id, room_code = v_open_room.room_code, updated_at = now()
       WHERE player_id = p_player_id;

      RETURN jsonb_build_object('status', 'matched', 'room_id', v_open_room.id, 'room_code', v_open_room.room_code, 'player_id', p_player_id);
    END IF;
  END IF;

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

  -- Typing Battle pools into an 8-seat public room; Quick Math stays 1v1.
  IF p_game_type = 'typing_battle' THEN
    SELECT r.out_room_id, r.out_room_code INTO v_room_id, v_code
    FROM public.reserve_game_room(p_player_id, p_game_type, p_difficulty, 1, 8) AS r;
    UPDATE public.game_rooms SET matchmade = TRUE WHERE id = v_room_id;
  ELSE
    SELECT r.out_room_id, r.out_room_code INTO v_room_id, v_code
    FROM public.reserve_game_room(p_player_id, p_game_type, p_difficulty, 1, 2) AS r;
  END IF;

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

-- ── 5. Completion records EVERY player, not just the first ───────────────────
-- Same validation/anti-cheat as 20261104 (server clock, word re-check, honest
-- character counts). What changes:
--   • the room row is locked so two racers can never both be "first";
--   • the room stays 'active' after a winner, so the rest can still submit;
--   • every finisher writes their own typing_stats row (win OR loss);
--   • the room flips to 'finished' only once every seated player has submitted.

CREATE OR REPLACE FUNCTION public.complete_typing_match(
  p_room_id       UUID,
  p_player_id     TEXT,
  p_words         TEXT[],
  p_correct_chars INT DEFAULT NULL,
  p_total_chars   INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room          public.game_rooms%ROWTYPE;
  v_words         TEXT[];
  v_expected      TEXT;
  v_correct       INT := 0;   -- matched words: drives the winner + response
  v_matched_chars INT := 0;   -- characters in matched words (separators included)
  v_correct_chars INT;
  v_total_chars   INT;
  v_i             INT;
  v_elapsed       DOUBLE PRECISION;   -- seconds, server clock
  v_wpm           NUMERIC(6,2);
  v_acc           NUMERIC(5,2);
  v_seed          public.game_players%ROWTYPE;
  v_win           BOOLEAN := FALSE;
  v_winner        TEXT;
  v_all_done      BOOLEAN;
BEGIN
  -- Lock the room row in the same read: completions are serialised per room, so
  -- whoever holds this lock first is the one the winner rule can see first.
  SELECT * INTO v_room FROM public.game_rooms
   WHERE id = p_room_id AND game_type = 'typing_battle'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;

  SELECT * INTO v_seed FROM public.game_players
   WHERE room_id = p_room_id AND player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_a_player'; END IF;

  -- Idempotency: this player already submitted for this match. (Check before
  -- the status gate so a retry after the room finished still gets a verdict.)
  IF EXISTS (
    SELECT 1 FROM public.typing_progress
     WHERE room_id = p_room_id AND player_id = p_player_id AND finished
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already',
      'winner', (SELECT winner_id FROM public.game_winners WHERE room_id = p_room_id)
    );
  END IF;

  IF v_room.status <> 'active' THEN RAISE EXCEPTION 'not_active'; END IF;

  SELECT words INTO v_words FROM public.typing_words WHERE room_id = p_room_id;
  IF v_words IS NULL THEN RAISE EXCEPTION 'not_active'; END IF;

  -- Word-by-word validation (order included; no skipping, no pasting). Each
  -- match also contributes its verifiable characters for the server-side WPM.
  FOR v_i IN 1..array_length(v_words, 1) LOOP
    v_expected := v_words[v_i];
    IF p_words IS NOT NULL AND array_length(p_words, 1) >= v_i
       AND btrim(p_words[v_i]) = v_expected THEN
      v_correct := v_correct + 1;
      v_matched_chars := v_matched_chars + length(v_expected) + 1;
    END IF;
  END LOOP;

  -- Server clock: match opened round_started_at; last word completed it.
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_room.round_started_at));
  IF v_elapsed < 2 OR v_elapsed > 900 THEN
    RAISE EXCEPTION 'impossible_time';
  END IF;

  v_wpm := ROUND(((v_matched_chars::NUMERIC / 5) / (v_elapsed / 60))::NUMERIC, 2);

  v_correct_chars := GREATEST(COALESCE(p_correct_chars, v_matched_chars), v_matched_chars);
  v_total_chars   := GREATEST(COALESCE(p_total_chars, v_correct_chars), v_correct_chars);
  IF v_total_chars > 0 THEN
    v_acc := ROUND((v_correct_chars::NUMERIC / v_total_chars) * 100, 2);
  ELSE
    v_acc := 0;
  END IF;

  UPDATE public.typing_progress SET
    completed     = array_length(v_words, 1),
    total         = array_length(v_words, 1),
    correct_chars = v_correct_chars,
    total_chars   = v_total_chars,
    finished      = TRUE,
    updated_at    = now()
   WHERE room_id = p_room_id AND player_id = p_player_id;

  -- First VALID completion wins. On CONFLICT DO NOTHING RETURNING tells us
  -- whether THIS submission was the one that claimed the win — a concurrent
  -- loser that sees "no row returned" is correctly recorded as a loss.
  INSERT INTO public.game_winners (room_id, game_type, winner_id, winner_nickname, winner_score, user_id)
  VALUES (p_room_id, 'typing_battle', p_player_id, v_seed.nickname, (v_wpm * 100)::INT, v_seed.user_id)
  ON CONFLICT (room_id) DO NOTHING
  RETURNING winner_id INTO v_winner;

  v_win := v_winner IS NOT NULL;

  -- Career stats (single writer: this RPC). Written for EVERY finisher so the
  -- leaderboard moves on each match, not just the winner's.
  INSERT INTO public.typing_stats AS s (player_id, user_id, nickname, games_played, wins, losses,
                                        best_wpm, average_wpm, best_accuracy, current_win_streak)
  VALUES (p_player_id, v_seed.user_id, v_seed.nickname, 1,
          CASE WHEN v_win THEN 1 ELSE 0 END, CASE WHEN v_win THEN 0 ELSE 1 END,
          v_wpm, v_wpm, v_acc, CASE WHEN v_win THEN 1 ELSE 0 END)
  ON CONFLICT (player_id) DO UPDATE SET
    user_id     = COALESCE(EXCLUDED.user_id, s.user_id),
    nickname    = EXCLUDED.nickname,
    games_played = s.games_played + 1,
    wins        = s.wins + EXCLUDED.wins,
    losses      = s.losses + EXCLUDED.losses,
    best_wpm    = GREATEST(s.best_wpm, EXCLUDED.best_wpm),
    average_wpm = ROUND(((s.average_wpm * s.games_played) + EXCLUDED.average_wpm) / (s.games_played + 1), 2),
    best_accuracy = GREATEST(s.best_accuracy, EXCLUDED.best_accuracy),
    current_win_streak = CASE WHEN EXCLUDED.wins > 0 THEN s.current_win_streak + 1 ELSE 0 END,
    updated_at  = now();

  -- Finish the room only when every seated player has submitted. Until then it
  -- stays 'active' so the rest of the field can still complete.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.game_players gp
     WHERE gp.room_id = p_room_id
       AND NOT EXISTS (
         SELECT 1 FROM public.typing_progress tp
          WHERE tp.room_id = p_room_id AND tp.player_id = gp.player_id AND tp.finished
       )
  ) INTO v_all_done;

  IF v_all_done THEN
    UPDATE public.game_rooms SET status = 'finished', updated_at = now()
     WHERE id = p_room_id AND status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_win THEN 'won' ELSE 'lost' END,
    'wpm', v_wpm, 'accuracy', v_acc,
    'duration_ms', ROUND(v_elapsed * 1000),
    'correct', v_correct, 'total', array_length(v_words, 1),
    'correct_chars', v_correct_chars, 'total_chars', v_total_chars,
    'winner', (SELECT winner_id FROM public.game_winners WHERE room_id = p_room_id)
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.complete_typing_match(UUID, TEXT, TEXT[], INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_typing_match(UUID, TEXT, TEXT[], INT, INT) TO anon, authenticated;

-- ── 6. The leaderboard moves the moment a match ends ────────────────────────
-- typing_stats is readable by everyone; publishing it lets the board refetch
-- on each write instead of going stale until the next screen visit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'typing_stats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_stats;
  END IF;
END $$;

-- Leaderboard with wins surfaced (`wins` is already returned; keep best-WPM as
-- the default ordering but expose a 'wins' sort for the UI toggle).
CREATE OR REPLACE FUNCTION public.get_typing_leaderboard(
  p_limit INT DEFAULT 20,
  p_sort  TEXT DEFAULT 'best_wpm'
)
RETURNS TABLE (player_id TEXT, nickname TEXT, best_wpm NUMERIC, best_accuracy NUMERIC, games_played INT, wins INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT s.player_id, s.nickname, s.best_wpm, s.best_accuracy, s.games_played, s.wins
    FROM public.typing_stats s
   WHERE s.games_played > 0
   ORDER BY CASE WHEN p_sort = 'wins' THEN s.wins ELSE s.best_wpm END DESC,
            s.best_wpm DESC,
            s.best_accuracy DESC
   LIMIT GREATEST(LEAST(p_limit, 100), 1);
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_typing_leaderboard(INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_typing_leaderboard(INT, TEXT) TO anon, authenticated;

-- ── 7. Results view exposes the live race ordering ──────────────────────────
-- Adds elapsed-free position ordering so the finished screen can show the full
-- finish order (completed words first, then who submitted earliest).

CREATE OR REPLACE FUNCTION public.get_typing_results(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room public.game_rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id AND game_type = 'typing_battle';
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  RETURN jsonb_build_object(
    'status', v_room.status,
    'winner_id', (SELECT winner_id FROM public.game_winners WHERE room_id = p_room_id),
    'players', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player_id', gp.player_id, 'nickname', gp.nickname,
        'completed', COALESCE(tp.completed, 0), 'total', COALESCE(tp.total, 0),
        'finished', COALESCE(tp.finished, FALSE), 'is_connected', gp.is_connected
      ) ORDER BY COALESCE(tp.finished, FALSE) DESC,
                 COALESCE(tp.completed, 0) DESC,
                 gp.joined_at ASC), '[]'::jsonb)
      FROM public.game_players gp
      LEFT JOIN public.typing_progress tp
        ON tp.room_id = gp.room_id AND tp.player_id = gp.player_id
      WHERE gp.room_id = p_room_id
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_typing_results(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_typing_results(UUID) TO anon, authenticated;
