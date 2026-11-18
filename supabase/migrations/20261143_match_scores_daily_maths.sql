-- ============================================================
-- ConnectToCampus — DAILY QUICK MATH COUNTS IN THE MATHS ZONE
--
-- The Compete board and the profile rating both read `match_scores()`
-- (20261139), which collected the quick-maths zone from `game_winners` only.
-- That table is written by the trigger on `game_rooms` when a room finishes,
-- so Daily Quick Math — a solo run with no room, stored in
-- `quick_math_daily_runs` — never moved the maths zone. That is the gap this
-- migration closes, in the one place both surfaces read.
--
-- A daily run is scored with the same equation as everything else, using its
-- accuracy and its placement on that day's board:
--
--   daily_points = round(100 × 0.9 × (0.6 × accuracy + 0.4 × 1/day_rank))
--
-- so a perfect first place that day is 90, exactly like a maths battle win.
-- Every player gets the same seeded set that day, which is what makes its
-- placement a competition rather than a measure of free time.
--
-- Unchanged on purpose:
--   • only signed-in runs count (guest rows have no user_id);
--   • the season window still filters by the row's created_at;
--   • live and typing zones are untouched, and nothing is written here;
--   • `match_leaderboard`, `match_rating` and every screen keep their shape —
--     they call this function and pick the new rows up automatically.
--
-- Idempotent: CREATE OR REPLACE only; same signature, same return columns.
-- ============================================================

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
  -- Solo daily sets: one stored row per player per day (their best run).
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
  ) d;
$$;

-- Internal only, exactly as before: a direct call could expose private
-- players' totals, so only the definer functions above it may read it.
REVOKE ALL ON FUNCTION public.match_scores(TIMESTAMPTZ) FROM PUBLIC;
