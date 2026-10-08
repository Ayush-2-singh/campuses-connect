-- ═══════════════════════════════════════════════════════════════════════════
-- 20261104_typing_accuracy.sql — honest accuracy & WPM for Typing Battle
-- ═══════════════════════════════════════════════════════════════════════════
-- 049 scored BOTH metrics from v_correct, a count of MATCHED WORDS:
--
--   • accuracy = matched_words / total_words — always 100%, because a word only
--     advances when it is typed exactly, so every submitted word matches. The
--     real mistakes (wrong characters typed and retyped) were invisible.
--
--   • WPM = (matched_words / 5) / minutes — treated words as characters, so it
--     read ~5–6× too low: finishing 10 words in a minute scored "2 WPM".
--
-- This migration replaces both functions:
--
--   • WPM uses the character length the SERVER can verify — the matched words
--     plus their separators — so it stays server-authoritative and cannot be
--     inflated with a doctored client number.
--
--   • Accuracy uses the characters the client actually typed (correct vs.
--     total). It is clamped so a client can never report fewer correct
--     characters than the server just verified, nor more correct characters
--     than it typed at all. (Character counts are the only signal of the
--     fumbles that happened before a word finally matched, so they must come
--     from the client — but the clamp keeps them internally consistent.)
--
-- Everything else is unchanged: server clock, word validation, idempotency,
-- winner logic, stats and the finish → Aura trigger.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. complete_typing_match — char-based WPM + accuracy ────────────────────
-- The old 3-argument form is dropped: with the two new DEFAULTed parameters a
-- stale overload would shadow the fixed one for 3-arg callers.

DROP FUNCTION IF EXISTS public.complete_typing_match(UUID, TEXT, TEXT[]);

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
  v_existing      RECORD;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id AND game_type = 'typing_battle';
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF v_room.status <> 'active' THEN RAISE EXCEPTION 'not_active'; END IF;
  SELECT * INTO v_seed FROM public.game_players
   WHERE room_id = p_room_id AND player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_a_player'; END IF;

  -- Idempotency: this player already submitted for this match.
  SELECT * INTO v_existing
    FROM public.typing_progress
   WHERE room_id = p_room_id AND player_id = p_player_id AND finished;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already', 'winner', (SELECT winner_id FROM public.game_winners WHERE room_id = p_room_id));
  END IF;

  SELECT words INTO v_words FROM public.typing_words WHERE room_id = p_room_id;
  IF v_words IS NULL THEN RAISE EXCEPTION 'not_active'; END IF;

  -- Word-by-word validation (order included; no skipping, no pasting). Each
  -- match also contributes its verifiable characters — the word plus the
  -- space that followed it — for the server-side WPM.
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

  -- WPM = (correct characters / 5) / elapsed minutes. The characters come from
  -- the matched words the server just verified — never from the client payload.
  v_wpm := ROUND(((v_matched_chars::NUMERIC / 5) / (v_elapsed / 60))::NUMERIC, 2);

  -- Accuracy = correct characters / total characters typed. Clamp the client's
  -- counts: at least the verifiable matched characters, and never more correct
  -- than total (fall back to 100% when the client sends no counts).
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

  -- First VALID completion wins. The window decides: a completion is valid
  -- here only if no winner exists yet; ties at the same server timestamp are
  -- impossible to observe apart from this serialised check.
  SELECT winner_id INTO v_existing.winner_id FROM public.game_winners WHERE room_id = p_room_id;
  IF v_existing.winner_id IS NULL THEN
    v_win := TRUE;
    INSERT INTO public.game_winners (room_id, game_type, winner_id, winner_nickname, winner_score, user_id)
    VALUES (p_room_id, 'typing_battle', p_player_id, v_seed.nickname, (v_wpm * 100)::INT, v_seed.user_id)
    ON CONFLICT (room_id) DO NOTHING;
    -- The finish trigger needs status='finished'; flip it now.
    UPDATE public.game_rooms SET status = 'finished', updated_at = now() WHERE id = p_room_id;
  END IF;

  -- Career stats (single writer: this RPC).
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

  RETURN jsonb_build_object(
    'status', CASE WHEN v_win THEN 'won' ELSE 'lost' END,
    'wpm', v_wpm, 'accuracy', v_acc,
    'duration_ms', ROUND(v_elapsed * 1000),
    'correct', v_correct, 'total', array_length(v_words, 1),
    'correct_chars', v_correct_chars, 'total_chars', v_total_chars,
    'winner', p_player_id
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.complete_typing_match(UUID, TEXT, TEXT[], INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_typing_match(UUID, TEXT, TEXT[], INT, INT) TO anon, authenticated;

-- ── 2. typing_daily_attempt — same char-based accuracy + WPM ────────────────
-- p_user_id stays last so existing 4/5-argument callers keep resolving.

DROP FUNCTION IF EXISTS public.typing_daily_attempt(TEXT, TEXT, TEXT[], BIGINT, UUID);

CREATE OR REPLACE FUNCTION public.typing_daily_attempt(
  p_player_id     TEXT,
  p_nickname      TEXT,
  p_words         TEXT[],
  p_duration_ms   BIGINT,
  p_correct_chars INT DEFAULT NULL,
  p_total_chars   INT DEFAULT NULL,
  p_user_id       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_day           DATE := CURRENT_DATE;
  v_target        TEXT[] := public.typing_daily_words(v_day);
  v_correct       INT := 0;
  v_matched_chars INT := 0;
  v_correct_chars INT;
  v_total_chars   INT;
  v_elapsed       DOUBLE PRECISION;
  v_wpm           NUMERIC(6,2);
  v_acc           NUMERIC(5,2);
  v_nick          TEXT := btrim(p_nickname);
  v_i             INT;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_duration_ms < 2000 OR p_duration_ms > 900000 THEN RAISE EXCEPTION 'impossible_time'; END IF;

  FOR v_i IN 1..array_length(v_target, 1) LOOP
    IF p_words IS NOT NULL AND array_length(p_words, 1) >= v_i
       AND btrim(p_words[v_i]) = v_target[v_i] THEN
      v_correct := v_correct + 1;
      v_matched_chars := v_matched_chars + length(v_target[v_i]) + 1;
    END IF;
  END LOOP;

  v_elapsed := p_duration_ms / 1000.0;
  v_wpm := ROUND(((v_matched_chars::NUMERIC / 5) / (v_elapsed / 60))::NUMERIC, 2);

  v_correct_chars := GREATEST(COALESCE(p_correct_chars, v_matched_chars), v_matched_chars);
  v_total_chars   := GREATEST(COALESCE(p_total_chars, v_correct_chars), v_correct_chars);
  IF v_total_chars > 0 THEN
    v_acc := ROUND((v_correct_chars::NUMERIC / v_total_chars) * 100, 2);
  ELSE
    v_acc := 0;
  END IF;

  -- One attempt per player per day (PRIMARY KEY guard, honest retry copy).
  INSERT INTO public.typing_daily (day, player_id, user_id, nickname, wpm, accuracy, duration_ms)
  VALUES (v_day, p_player_id, p_user_id, v_nick, v_wpm, v_acc, p_duration_ms)
  ON CONFLICT (day, player_id) DO NOTHING;

  RETURN jsonb_build_object(
    'wpm', v_wpm, 'accuracy', v_acc, 'correct', v_correct, 'total', array_length(v_target, 1),
    'accepted', (SELECT TRUE FROM public.typing_daily WHERE day = v_day AND player_id = p_player_id
                  AND duration_ms = p_duration_ms LIMIT 1),
    'rank', (
      SELECT COUNT(*) + 1 FROM public.typing_daily d
       WHERE d.day = v_day AND d.wpm > v_wpm
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.typing_daily_attempt(TEXT, TEXT, TEXT[], BIGINT, INT, INT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.typing_daily_attempt(TEXT, TEXT, TEXT[], BIGINT, INT, INT, UUID) TO anon, authenticated;
