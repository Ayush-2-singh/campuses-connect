-- 20261141_code_sprint_rooms.sql
--
-- CODE SPRINT — live rooms (2–8 players) on top of the sprint mode from
-- 20261140, and points for it in the Compete typing zone.
--
-- The room lifecycle mirrors the typing battle exactly (create → join by code →
-- ready-up → host starts → 3-2-1 → active), with two deliberate differences:
--
--   • text: the host's start seeds `code_sprint_text('room:<id>')`, so every
--     seat types the same code, and the words live in the same `typing_words`
--     row the typing engine already reads;
--   • winner: a sprint is a TIME mode — everyone submits at the 60s mark, so
--     "first to finish" is meaningless. Completion only records each player's
--     verified characters; the room finishes when the last seat submits and the
--     existing `record_game_winner()` trigger picks the highest score. That
--     same trigger writes `game_winners` (game_type = 'code_sprint') and awards
--     the win, which `match_scores` now maps into the typing zone.
--
-- Anti-cheat is unchanged from the typing engine: the typed sequence must be an
-- exact prefix of the room's stored words, the elapsed time comes from the
-- server clock, and the WPM reported back is derived from verified characters —
-- the client's numbers are never trusted.

CREATE OR REPLACE FUNCTION public.create_code_sprint_room(
  p_player_id TEXT,
  p_nickname  TEXT,
  p_user_id   UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nick TEXT := btrim(p_nickname);
  v_code TEXT := public.generate_room_code();
  v_room UUID;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN
    RAISE EXCEPTION 'invalid_nickname';
  END IF;

  INSERT INTO public.game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
  VALUES (v_code, p_player_id, 'code_sprint', 'medium', 1, 8)
  RETURNING id INTO v_room;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room, p_player_id, v_nick, TRUE, TRUE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room, 'room_code', v_code, 'player_id', p_player_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.create_code_sprint_room(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_code_sprint_room(TEXT, TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_code_sprint_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_nickname  TEXT,
  p_user_id   UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_nick TEXT := btrim(p_nickname);
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN
    RAISE EXCEPTION 'invalid_nickname';
  END IF;

  SELECT * INTO v_room FROM public.game_rooms
   WHERE room_code = upper(btrim(p_room_code))
     AND game_type = 'code_sprint'
     AND status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;
  IF v_room.expires_at < now() THEN
    UPDATE public.game_rooms SET status = 'expired' WHERE id = v_room.id;
    RAISE EXCEPTION 'room_expired';
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND player_id = p_player_id) THEN
    UPDATE public.game_players SET is_connected = TRUE, disconnected_at = NULL
     WHERE room_id = v_room.id AND player_id = p_player_id;
    RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'reconnected', TRUE);
  END IF;

  IF (SELECT count(*) FROM public.game_players WHERE room_id = v_room.id) >= v_room.max_players THEN
    RAISE EXCEPTION 'room_full';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND nickname = v_nick) THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room.id, p_player_id, v_nick, FALSE, FALSE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'reconnected', FALSE);
END $$;

REVOKE EXECUTE ON FUNCTION public.join_code_sprint_room(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_code_sprint_room(TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.toggle_code_sprint_ready(p_room_id UUID, p_player_id TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready BOOLEAN;
BEGIN
  UPDATE public.game_players SET is_ready = NOT is_ready
   WHERE room_id = p_room_id
     AND player_id = p_player_id
     AND room_id IN (SELECT id FROM public.game_rooms WHERE game_type = 'code_sprint')
  RETURNING is_ready INTO v_ready;
  RETURN COALESCE(v_ready, FALSE);
END $$;

REVOKE EXECUTE ON FUNCTION public.toggle_code_sprint_ready(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_code_sprint_ready(UUID, TEXT) TO anon, authenticated;

-- Host starts: seeds THIS room's code, stores the words the typing engine
-- already knows how to serve, and opens the 3-second countdown.
CREATE OR REPLACE FUNCTION public.start_code_sprint_match(p_room_id UUID, p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room  public.game_rooms%ROWTYPE;
  v_seed  TEXT;
  v_text  TEXT;
  v_words TEXT[];
  v_start TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms
   WHERE id = p_room_id AND game_type = 'code_sprint'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;
  IF v_room.host_id <> p_player_id THEN
    RAISE EXCEPTION 'only_host';
  END IF;
  IF v_room.status <> 'waiting' THEN
    RAISE EXCEPTION 'already_started';
  END IF;
  IF (SELECT count(*) FROM public.game_players WHERE room_id = p_room_id) < 2 THEN
    RAISE EXCEPTION 'need_two_players';
  END IF;
  IF (SELECT count(*) FROM public.game_players WHERE room_id = p_room_id AND is_ready) <
     (SELECT count(*) FROM public.game_players WHERE room_id = p_room_id) THEN
    RAISE EXCEPTION 'not_all_ready';
  END IF;

  v_seed := 'room:' || p_room_id::TEXT;
  v_text := public.code_sprint_text(v_seed) ->> 'text';
  IF v_text IS NULL THEN
    RAISE EXCEPTION 'no_snippets';
  END IF;
  v_words := string_to_array(v_text, ' ');

  INSERT INTO public.typing_words AS w (room_id, words)
  VALUES (p_room_id, v_words)
  ON CONFLICT (room_id) DO UPDATE SET words = EXCLUDED.words;

  v_start := now() + INTERVAL '3 seconds';

  UPDATE public.game_rooms
     SET status = 'active',
         round_started_at = v_start,
         expires_at = now() + INTERVAL '5 minutes',
         updated_at = now()
   WHERE id = p_room_id;

  DELETE FROM public.typing_progress WHERE room_id = p_room_id;
  INSERT INTO public.typing_progress (room_id, player_id, total)
  SELECT p_room_id, player_id, array_length(v_words, 1)
  FROM public.game_players WHERE room_id = p_room_id;

  RETURN jsonb_build_object('starts_at', v_start, 'seed', v_seed, 'word_count', array_length(v_words, 1));
END $$;

REVOKE EXECUTE ON FUNCTION public.start_code_sprint_match(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_code_sprint_match(UUID, TEXT) TO anon, authenticated;

-- The room's words go only to seated players of an active sprint.
CREATE OR REPLACE FUNCTION public.get_code_sprint_room_text(p_room_id UUID, p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room  public.game_rooms%ROWTYPE;
  v_words TEXT[];
BEGIN
  SELECT * INTO v_room FROM public.game_rooms
   WHERE id = p_room_id AND game_type = 'code_sprint';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players WHERE room_id = p_room_id AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;
  IF v_room.status <> 'active' THEN
    RAISE EXCEPTION 'not_active';
  END IF;

  SELECT words INTO v_words FROM public.typing_words WHERE room_id = p_room_id;
  RETURN jsonb_build_object('ok', TRUE, 'words', to_jsonb(coalesce(v_words, ARRAY[]::TEXT[])));
END $$;

REVOKE EXECUTE ON FUNCTION public.get_code_sprint_room_text(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_code_sprint_room_text(UUID, TEXT) TO anon, authenticated;

-- Submit a seat's 60-second run. Records verified characters only; the room
-- finishes (and the winner is picked by score) when the last seat submits.
CREATE OR REPLACE FUNCTION public.complete_code_sprint(
  p_room_id       UUID,
  p_player_id     TEXT,
  p_words         TEXT[],
  p_correct_chars INT DEFAULT NULL,
  p_total_chars   INT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room     public.game_rooms%ROWTYPE;
  v_seat     public.game_players%ROWTYPE;
  v_target   TEXT[];
  v_typed_n  INT;
  v_matched  INT := 0;
  v_correct  INT;
  v_total    INT;
  v_elapsed  DOUBLE PRECISION;
  v_wpm      NUMERIC(6,2);
  v_acc      NUMERIC(5,2);
  v_all_done BOOLEAN;
  v_winner   TEXT;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms
   WHERE id = p_room_id AND game_type = 'code_sprint'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  SELECT * INTO v_seat FROM public.game_players
   WHERE room_id = p_room_id AND player_id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.typing_progress
     WHERE room_id = p_room_id AND player_id = p_player_id AND finished
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already',
      'score', v_seat.score,
      'winner', (SELECT winner_id FROM public.game_winners WHERE room_id = p_room_id)
    );
  END IF;

  IF v_room.status <> 'active' THEN
    RAISE EXCEPTION 'not_active';
  END IF;

  SELECT words INTO v_target FROM public.typing_words WHERE room_id = p_room_id;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'not_active';
  END IF;

  v_typed_n := coalesce(array_length(p_words, 1), 0);
  IF v_typed_n > array_length(v_target, 1) THEN
    RAISE EXCEPTION 'too_many_words';
  END IF;
  IF v_typed_n > 0 AND v_target[1:v_typed_n] IS DISTINCT FROM p_words THEN
    RAISE EXCEPTION 'invalid_words';
  END IF;

  SELECT coalesce(sum(length(w)), 0) + greatest(v_typed_n - 1, 0)
  INTO v_matched
  FROM unnest(coalesce(p_words, ARRAY[]::TEXT[])) AS w;

  v_elapsed := EXTRACT(EPOCH FROM (now() - v_room.round_started_at));
  IF v_elapsed < 3 OR v_elapsed > 900 THEN
    RAISE EXCEPTION 'impossible_time';
  END IF;

  v_wpm := round(((v_matched::NUMERIC / 5) / (v_elapsed / 60))::NUMERIC, 2);
  IF v_wpm > 220 THEN
    RAISE EXCEPTION 'impossible_speed';
  END IF;

  v_correct := greatest(coalesce(p_correct_chars, v_matched), v_matched);
  v_total := greatest(coalesce(p_total_chars, v_correct), v_correct);
  v_acc := CASE WHEN v_total > 0 THEN round((v_correct::NUMERIC * 100) / v_total, 2) ELSE 0 END;

  UPDATE public.typing_progress SET
    completed = v_typed_n,
    total = array_length(v_target, 1),
    correct_chars = v_correct,
    total_chars = v_total,
    finished = TRUE,
    updated_at = now()
   WHERE room_id = p_room_id AND player_id = p_player_id;

  -- The room's winner is decided by verified characters, so the score is what
  -- `record_game_winner()` sorts by when the room flips to finished.
  UPDATE public.game_players
     SET score = v_matched,
         correct_count = v_typed_n
   WHERE room_id = p_room_id AND player_id = p_player_id;

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

  SELECT winner_id INTO v_winner FROM public.game_winners WHERE room_id = p_room_id;

  RETURN jsonb_build_object(
    'status', 'submitted',
    'wpm', v_wpm,
    'accuracy', v_acc,
    'correct_chars', v_matched,
    'typed_chars', v_total,
    'correct_words', v_typed_n,
    'room_finished', v_all_done,
    'winner', v_winner
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.complete_code_sprint(UUID, TEXT, TEXT[], INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_code_sprint(UUID, TEXT, TEXT[], INT, INT) TO anon, authenticated;

-- ── Points: a code-sprint win is a typing win ───────────────────────────────

CREATE OR REPLACE FUNCTION public.match_scores(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (user_id UUID, zone TEXT, pts INT, won BOOLEAN, acc NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.user_id,
         'live'::TEXT,
         round(
           100 * (0.6 * (least(greatest(coalesce(r.accuracy, 0), 0), 100) / 100.0)
                  + 0.4 * (1.0 / greatest(r.rank, 1)))
         )::INT,
         (r.rank = 1),
         least(greatest(coalesce(r.accuracy, 0), 0), 100)::NUMERIC
  FROM public.competition_results r
  JOIN public.competitions c ON c.id = r.competition_id
  WHERE c.status = 'completed'
    AND coalesce(r.answered_count, 0) > 0
    AND (p_since IS NULL OR r.created_at >= p_since)
  UNION ALL
  SELECT g.user_id,
         (CASE WHEN g.game_type IN ('typing_battle', 'code_sprint') THEN 'typing' ELSE 'maths' END)::TEXT,
         (CASE WHEN g.game_type IN ('typing_battle', 'code_sprint') THEN 100 ELSE 90 END)::INT,
         TRUE,
         100::NUMERIC
  FROM public.game_winners g
  WHERE g.user_id IS NOT NULL
    AND g.game_type IN ('typing_battle', 'quick_math', 'code_sprint')
    AND (p_since IS NULL OR g.won_at >= p_since);
$$;

REVOKE ALL ON FUNCTION public.match_scores(TIMESTAMPTZ) FROM PUBLIC;
