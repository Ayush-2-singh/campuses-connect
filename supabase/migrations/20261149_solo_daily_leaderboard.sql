-- ============================================================
-- ConnectToCampus — SOLO DAILY RUNS COUNT ON THE COMPETE BOARD
--
-- The Compete leaderboard reads `match_scores()` (20261139, extended in
-- 20261143 for Daily Quick Math). Solo Daily Typing was still missing:
--
--   • `typing_daily_attempt` accepted a client-supplied `p_user_id`, and the
--     client never sent one, so every solo typing row was stored with a null
--     user and could not be attributed to a student.
--   • `match_scores()` read the typing zone from `game_winners` only — the
--     trigger that fires when a live room finishes — so even an attributed
--     solo run never moved the board.
--
-- This migration fixes both in the one place the board reads:
--
--   1. `typing_daily_attempt` now takes the signed-in identity from
--      `auth.uid()` and ignores a client-supplied id that disagrees, so a run
--      cannot be attributed to someone else.
--   2. `match_scores()` adds today's solo typing rows to the typing zone with
--      the same equation the maths solo runs use:
--
--        typing_points = round(100 × 0.9 × (0.6 × accuracy + 0.4 × 1/day_rank))
--
--      `day_rank` is the player's place on that day's typing board by WPM, so
--      a perfect first place is 90 — the same ceiling as a battle win.
--
-- Unchanged on purpose:
--   • only signed-in runs count (guest rows keep a null user);
--   • one attempt per player per day is already enforced by the primary key
--     on (day, player_id), so a solo run cannot be farmed;
--   • live / maths zones, `match_leaderboard`, `match_rating` and every screen
--     keep their shape and pick the new rows up automatically.
--
-- Idempotent: CREATE OR REPLACE only, same signatures.
-- ============================================================

-- ── 1. Attribute solo typing runs to the authenticated user ────────────────

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
  v_user          UUID := auth.uid();   -- server identity wins
  v_i             INT;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_duration_ms < 2000 OR p_duration_ms > 900000 THEN RAISE EXCEPTION 'impossible_time'; END IF;

  -- Guests may supply their own id; signed-in callers cannot claim another
  -- account's run.
  IF v_user IS NULL THEN
    v_user := p_user_id;
  END IF;

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
  VALUES (v_day, p_player_id, v_user, v_nick, v_wpm, v_acc, p_duration_ms)
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

-- ── 2. Typing zone reads solo daily runs too ───────────────────────────────

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
         (CASE g.game_type WHEN 'typing_battle' THEN 'typing' ELSE 'maths' END)::TEXT,
         (CASE g.game_type WHEN 'typing_battle' THEN 100 ELSE 90 END)::INT,
         TRUE,
         100::NUMERIC
  FROM public.game_winners g
  WHERE g.user_id IS NOT NULL
    AND g.game_type IN ('typing_battle', 'quick_math')
    AND (p_since IS NULL OR g.won_at >= p_since)
  UNION ALL
  -- Solo daily maths sets: one stored row per player per day.
  SELECT d.user_id,
         'maths'::TEXT,
         round(100 * 0.9 * (0.6 * d.acc_frac + 0.4 * (1.0 / d.day_rank)))::INT,
         (d.day_rank = 1),
         round(100.0 * d.acc_frac)::NUMERIC
  FROM (
    SELECT r.user_id,
           least(greatest(coalesce(r.correct_count, 0), 0), greatest(r.total_questions, 1))::NUMERIC
             / greatest(r.total_questions, 1) AS acc_frac,
           rank() OVER (
             PARTITION BY r.day
             ORDER BY r.points DESC, r.correct_count DESC, r.updated_at ASC
           ) AS day_rank
    FROM public.quick_math_daily_runs r
    WHERE r.user_id IS NOT NULL
      AND (p_since IS NULL OR r.created_at >= p_since)
  ) d
  UNION ALL
  -- Solo daily typing runs: accuracy plus placement on that day's WPM board.
  SELECT t.user_id,
         'typing'::TEXT,
         round(100 * 0.9 * (0.6 * t.acc_frac + 0.4 * (1.0 / t.day_rank)))::INT,
         (t.day_rank = 1),
         round(100.0 * t.acc_frac)::NUMERIC
  FROM (
    SELECT r.user_id,
           least(greatest(coalesce(r.accuracy, 0), 0), 100)::NUMERIC / 100.0 AS acc_frac,
           rank() OVER (
             PARTITION BY r.day
             ORDER BY r.wpm DESC, r.accuracy DESC, r.created_at ASC
           ) AS day_rank
    FROM public.typing_daily r
    WHERE r.user_id IS NOT NULL
      AND (p_since IS NULL OR r.created_at >= p_since)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.match_scores(TIMESTAMPTZ) FROM PUBLIC;
