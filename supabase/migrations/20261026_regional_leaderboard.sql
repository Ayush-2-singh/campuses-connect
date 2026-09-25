-- 20261026_regional_leaderboard.sql
--
-- LEADERBOARD REGIONAL SCOPE (spec §14-§16).
--
-- Region exists ONLY inside the leaderboard: "Where do I rank?". This adds a
-- scope-aware ranking RPC (global | college | city | state) that reuses the
-- exact combined score of get_enhanced_leaderboard. Scopes are leaderboard
-- filters — they never change content visibility anywhere else in the app.
--
-- Region resolution:
--   college → profiles.college_id = the selected college
--   city    → profiles on campuses whose city matches the selected campus's city
--   state   → profiles on campuses whose state matches the selected campus's state
--
-- Public regional boards are browsable logged-out (spec §16); the function
-- derives nothing from the client beyond the scope selection.
--
-- ADDITIVE ONLY. Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.get_regional_leaderboard(
  p_scope     TEXT DEFAULT 'global',
  p_region_id UUID DEFAULT NULL,
  p_limit     INT DEFAULT 50
)
RETURNS TABLE (
  user_id        UUID,
  full_name      TEXT,
  username       TEXT,
  avatar_url     TEXT,
  karma_points   INT,
  aura_points    INT,
  streak_days    INT,
  combined_score NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH github_stats AS (
    SELECT istats.user_id,
           COALESCE((istats.stats->>'total_contributions')::int, 0) AS contributions
    FROM public.integration_stats istats
    WHERE istats.platform = 'github'
  ),
  leetcode_stats AS (
    SELECT istats.user_id,
           COALESCE((istats.stats->>'total_solved')::int, 0) AS solved,
           COALESCE((istats.stats->>'rating')::int, 0) AS rating
    FROM public.integration_stats istats
    WHERE istats.platform = 'leetcode'
  ),
  ranked AS (
    SELECT
      p.id AS user_id,
      p.full_name,
      p.username,
      p.avatar_url,
      COALESCE(p.karma_points, 0) AS karma_points,
      COALESCE(p.aura_points, 0) AS aura_points,
      COALESCE(p.streak_days, 0) AS streak_days,
      (
        COALESCE(p.karma_points, 0) * 1.0
        + COALESCE(gs.contributions, 0) * 0.5
        + COALESCE(ls.solved, 0) * 0.3
        + COALESCE(ls.rating, 0) * 0.2
        + COALESCE(p.streak_days, 0) * 2.0
      ) AS combined_score
    FROM public.profiles p
    LEFT JOIN public.campuses cam ON cam.id = p.campus_id
    LEFT JOIN github_stats gs ON gs.user_id = p.id
    LEFT JOIN leetcode_stats ls ON ls.user_id = p.id
    WHERE p.is_public = true
      AND p.status = 'active'
      AND (
        p_scope = 'global'
        OR (p_scope = 'college' AND p_region_id IS NOT NULL AND p.college_id = p_region_id)
        OR (p_scope = 'city' AND p_region_id IS NOT NULL AND cam.city IS NOT NULL
            AND cam.city = (SELECT c.city FROM public.campuses c WHERE c.id = p_region_id))
        OR (p_scope = 'state' AND p_region_id IS NOT NULL AND cam.state IS NOT NULL
            AND cam.state = (SELECT c.state FROM public.campuses c WHERE c.id = p_region_id))
      )
  )
  SELECT * FROM ranked
  ORDER BY combined_score DESC, user_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$function$;

REVOKE ALL ON FUNCTION public.get_regional_leaderboard(TEXT, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_regional_leaderboard(TEXT, UUID, INT) TO authenticated, anon;
