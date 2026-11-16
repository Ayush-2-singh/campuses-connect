-- 20261138_match_leaderboard.sql
--
-- Compete leaderboard, computed from MATCHES only.
--
-- Until now the Compete rankings read `profiles.aura_points` / `karma_points`.
-- Those are counters: aura grew +10 per game win, karma grows from notes, DSA
-- solves, answers and moderation — none of them is a match result, so the
-- ranking on /compete described activity elsewhere on the site rather than who
-- is actually winning here. `points_leaderboard` (20261131) did read results,
-- but it summed raw scores, so a 500-point room could outrank a perfect
-- typing run and several participants were paid for one win.
--
-- THE EQUATION — one finished match, one score out of 100:
--
--   match_points = round( 100 × mode × (0.6 × accuracy + 0.4 × placement) )
--
--   accuracy  = share of the questions in that match answered correctly,
--               0..1 (competition_results.accuracy is stored as a percent).
--   placement = 1 / rank — first place 1.0, second 0.5, third 0.33, …
--   mode      = live battle 1.0 · typing battle 1.0 · quick maths 0.9
--
-- So a perfect live win is 100, a perfect live second place is 70, and a
-- quick-maths win is 90. Players who never finished a match do not appear.
--
-- What the equation deliberately does NOT do:
--   • no raw-score summing — a room's scale never leaks into the ranking;
--   • no participation credit for signing in or joining — you have to answer;
--   • no profile counters, GitHub stats, LeetCode, streaks or badges.
--
-- Room games (typing, quick maths) only ever store the winner
-- (`game_winners`), so their recorded match is accuracy 1 & placement 1, i.e.
-- a win is worth 100 (typing) or 90 (maths). Live rooms store every
-- participant, so their placement and accuracy are real.
--
-- A player's total is the sum of their match points inside the window (the
-- active season when the caller passes its start), ties broken by wins and
-- then by fewer matches. Read-only; nothing here writes a profile.

CREATE OR REPLACE FUNCTION public.match_leaderboard(
  p_zone       TEXT  DEFAULT 'overall',
  p_campus_id  UUID  DEFAULT NULL,
  p_friend_ids UUID[] DEFAULT NULL,
  p_since      TIMESTAMPTZ DEFAULT NULL,
  p_limit      INT   DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone  TEXT := lower(coalesce(nullif(btrim(p_zone), ''), 'overall'));
  v_limit INT  := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_out   JSONB;
BEGIN
  IF v_zone NOT IN ('overall', 'live', 'typing', 'maths') THEN
    v_zone := 'overall';
  END IF;

  WITH live AS (
    SELECT r.user_id,
           round(
             100 * (0.6 * (least(greatest(coalesce(r.accuracy, 0), 0), 100) / 100.0)
                    + 0.4 * (1.0 / greatest(r.rank, 1)))
           )::INT                                   AS pts,
           (r.rank = 1)                             AS won,
           least(greatest(coalesce(r.accuracy, 0), 0), 100)::NUMERIC AS acc,
           'live'::TEXT                             AS zone
    FROM public.competition_results r
    JOIN public.competitions c ON c.id = r.competition_id
    WHERE c.status = 'completed'
      AND coalesce(r.answered_count, 0) > 0
      AND (p_since IS NULL OR r.created_at >= p_since)
  ),
  room AS (
    SELECT g.user_id,
           (CASE g.game_type WHEN 'typing_battle' THEN 100 ELSE 90 END)::INT AS pts,
           TRUE                                     AS won,
           100::NUMERIC                             AS acc,
           (CASE g.game_type WHEN 'typing_battle' THEN 'typing' ELSE 'maths' END)::TEXT AS zone
    FROM public.game_winners g
    WHERE g.user_id IS NOT NULL
      AND g.game_type IN ('typing_battle', 'quick_math')
      AND (p_since IS NULL OR g.won_at >= p_since)
  ),
  matches AS (
    SELECT * FROM live
    UNION ALL
    SELECT * FROM room
  ),
  scoped AS (
    SELECT * FROM matches WHERE v_zone = 'overall' OR zone = v_zone
  ),
  agg AS (
    SELECT s.user_id,
           sum(s.pts)::INT                                  AS points,
           count(*)::INT                                    AS played,
           count(*) FILTER (WHERE s.won)::INT               AS wins,
           round(sum(s.acc) / count(*))::INT                AS accuracy,
           coalesce(sum(s.pts) FILTER (WHERE s.zone = 'live'), 0)::INT   AS live_points,
           coalesce(sum(s.pts) FILTER (WHERE s.zone = 'typing'), 0)::INT AS typing_points,
           coalesce(sum(s.pts) FILTER (WHERE s.zone = 'maths'), 0)::INT  AS maths_points,
           count(*) FILTER (WHERE s.zone = 'live'   AND s.won)::INT AS live_wins,
           count(*) FILTER (WHERE s.zone = 'typing' AND s.won)::INT AS typing_wins,
           count(*) FILTER (WHERE s.zone = 'maths'  AND s.won)::INT AS maths_wins
    FROM scoped s
    GROUP BY s.user_id
  ),
  visible AS (
    SELECT a.*,
           coalesce(nullif(pr.full_name, ''), pr.username, 'Student') AS display_name,
           pr.username,
           pr.avatar_url,
           d.short_name AS department
    FROM agg a
    JOIN public.profiles pr ON pr.id = a.user_id
    LEFT JOIN public.departments d ON d.id = pr.department_id
    WHERE pr.is_public = TRUE
      AND pr.status = 'active'
      AND (p_campus_id IS NULL OR pr.campus_id = p_campus_id)
      AND (p_friend_ids IS NULL OR a.user_id = ANY (p_friend_ids))
  ),
  ranked AS (
    SELECT v.*,
           rank() OVER (ORDER BY v.points DESC, v.wins DESC, v.played ASC, v.user_id) AS rnk
    FROM visible v
  )
  SELECT jsonb_build_object(
           'ok', TRUE,
           'zone', v_zone,
           'rows', coalesce((
             SELECT jsonb_agg(row ORDER BY rnk)
             FROM (
               SELECT rnk,
                      jsonb_build_object(
                        'rank', r.rnk,
                        'user_id', r.user_id,
                        'display_name', r.display_name,
                        'username', r.username,
                        'avatar_url', r.avatar_url,
                        'department', r.department,
                        'points', r.points,
                        'wins', r.wins,
                        'played', r.played,
                        'accuracy', r.accuracy,
                        'live_points', r.live_points,
                        'typing_points', r.typing_points,
                        'maths_points', r.maths_points,
                        'live_wins', r.live_wins,
                        'typing_wins', r.typing_wins,
                        'maths_wins', r.maths_wins
                      ) AS row
               FROM ranked r
               ORDER BY r.rnk
               LIMIT v_limit
             ) z
           ), '[]'::jsonb),
           'me', (
             SELECT jsonb_build_object(
                      'rank', r.rnk, 'points', r.points, 'wins', r.wins,
                      'played', r.played, 'accuracy', r.accuracy)
             FROM ranked r
             WHERE r.user_id = auth.uid()
           )
         )
  INTO v_out;

  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.match_leaderboard(TEXT, UUID, UUID[], TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_leaderboard(TEXT, UUID, UUID[], TIMESTAMPTZ, INT) TO anon, authenticated;
