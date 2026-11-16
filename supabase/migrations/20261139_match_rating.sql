-- 20261139_match_rating.sql
--
-- Per-player match rating, for the profile page.
--
-- The leaderboard equation lives in ONE place from here on:
--
--   match_points = round( 100 × mode × (0.6 × accuracy + 0.4 × 1/place) )
--
-- `match_scores()` returns those points per finished match; `match_leaderboard`
-- (re-created below, same signature) and the new `match_rating()` both read it,
-- so a profile can never show a total that disagrees with the board.
--
-- `match_rating(user)` returns the player's combined rating, their global rank
-- (same visibility rules as the board: public, active profiles only), and the
-- live / typing / maths breakdown the profile card displays.

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
    AND (p_since IS NULL OR g.won_at >= p_since);
$$;

-- Internal only: a direct call could expose private players' totals.
REVOKE ALL ON FUNCTION public.match_scores(TIMESTAMPTZ) FROM PUBLIC;

-- ── Leaderboard, now reading the shared scores ──────────────────────────────

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

  WITH scoped AS (
    SELECT * FROM public.match_scores(p_since)
    WHERE v_zone = 'overall' OR zone = v_zone
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

-- ── One player's rating, for the profile page ───────────────────────────────

CREATE OR REPLACE FUNCTION public.match_rating(
  p_user_id UUID,
  p_since   TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_user');
  END IF;

  WITH agg AS (
    SELECT s.user_id,
           sum(s.pts)::INT                                  AS points,
           count(*)::INT                                    AS played,
           count(*) FILTER (WHERE s.won)::INT               AS wins,
           round(sum(s.acc) / count(*))::INT                AS accuracy,
           coalesce(sum(s.pts) FILTER (WHERE s.zone = 'live'), 0)::INT   AS live_points,
           coalesce(sum(s.pts) FILTER (WHERE s.zone = 'typing'), 0)::INT AS typing_points,
           coalesce(sum(s.pts) FILTER (WHERE s.zone = 'maths'), 0)::INT  AS maths_points,
           count(*) FILTER (WHERE s.zone = 'live')::INT                  AS live_played,
           count(*) FILTER (WHERE s.zone = 'typing')::INT                AS typing_played,
           count(*) FILTER (WHERE s.zone = 'maths')::INT                 AS maths_played,
           count(*) FILTER (WHERE s.zone = 'live'   AND s.won)::INT AS live_wins,
           count(*) FILTER (WHERE s.zone = 'typing' AND s.won)::INT AS typing_wins,
           count(*) FILTER (WHERE s.zone = 'maths'  AND s.won)::INT AS maths_wins
    FROM public.match_scores(p_since) s
    GROUP BY s.user_id
  ),
  visible AS (
    SELECT a.*
    FROM agg a
    JOIN public.profiles pr ON pr.id = a.user_id
    WHERE pr.is_public = TRUE AND pr.status = 'active'
  ),
  ranked AS (
    SELECT v.*,
           rank() OVER (ORDER BY v.points DESC, v.wins DESC, v.played ASC, v.user_id) AS rnk
    FROM visible v
  )
  SELECT jsonb_build_object(
           'ok', TRUE,
           'user_id', r.user_id,
           'rank', r.rnk,
           'points', r.points,
           'wins', r.wins,
           'played', r.played,
           'accuracy', r.accuracy,
           'live', jsonb_build_object('points', r.live_points, 'wins', r.live_wins, 'played', r.live_played),
           'typing', jsonb_build_object('points', r.typing_points, 'wins', r.typing_wins, 'played', r.typing_played),
           'maths', jsonb_build_object('points', r.maths_points, 'wins', r.maths_wins, 'played', r.maths_played)
         )
  INTO v_out
  FROM ranked r
  WHERE r.user_id = p_user_id;

  -- A player with no finished matches (or a private profile) still gets a
  -- well-formed zero card instead of an error, so the page renders.
  RETURN coalesce(
    v_out,
    jsonb_build_object(
      'ok', TRUE, 'user_id', p_user_id, 'rank', NULL,
      'points', 0, 'wins', 0, 'played', 0, 'accuracy', 0,
      'live', jsonb_build_object('points', 0, 'wins', 0, 'played', 0),
      'typing', jsonb_build_object('points', 0, 'wins', 0, 'played', 0),
      'maths', jsonb_build_object('points', 0, 'wins', 0, 'played', 0)
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.match_rating(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_rating(UUID, TIMESTAMPTZ) TO anon, authenticated;
