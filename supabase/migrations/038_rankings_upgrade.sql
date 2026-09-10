-- ============================================================
-- ConnectToCampus — 038 RANKINGS UPGRADE
-- One consistent ranking definition, computed in the DB:
--   p_sort = 'aura'  → order by profiles.aura_points (season score)
--   p_sort = 'karma' → order by profiles.karma_points (lifetime)
--   p_sort = 'combined' → order by the composite score (karma +
--     GitHub + LeetCode + streak) — kept for backward compatibility.
-- Also exposes aura_points so the UI no longer needs to re-sort
-- or recompute scores client-side.
-- No RLS changes: the function remains SECURITY DEFINER but keeps
-- its is_public + status='active' guards, so no private data and
-- no non-public profiles can leak.
-- ============================================================

-- ── 1. Indexes: fast ordered scans for public leaderboards ──
CREATE INDEX IF NOT EXISTS idx_profiles_aura_public
  ON public.profiles (aura_points DESC)
  WHERE is_public = TRUE AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_profiles_karma_public
  ON public.profiles (karma_points DESC)
  WHERE is_public = TRUE AND status = 'active';

-- ── 2. Leaderboard RPC: aura_points in output + server-side sort ──
-- DROP first: CREATE OR REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS public.get_enhanced_leaderboard(UUID, INT);
DROP FUNCTION IF EXISTS public.get_enhanced_leaderboard(UUID, INT, TEXT);

CREATE FUNCTION public.get_enhanced_leaderboard(
  p_campus_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_sort TEXT DEFAULT 'aura'
)
RETURNS TABLE (
  user_id UUID,
  full_name text,
  username text,
  avatar_url text,
  department text,
  karma_points int,
  aura_points int,
  streak_days int,
  github_repos int,
  github_contributions int,
  leetcode_solved int,
  leetcode_rating int,
  combined_score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH github_stats AS (
    SELECT
      istats.user_id,
      COALESCE((istats.stats->>'public_repos')::int, 0) as repos,
      COALESCE((istats.stats->>'total_contributions')::int, 0) as contributions
    FROM public.integration_stats istats
    WHERE istats.platform = 'github'
  ),
  leetcode_stats AS (
    SELECT
      istats.user_id,
      COALESCE((istats.stats->>'total_solved')::int, 0) as solved,
      COALESCE((istats.stats->>'rating')::int, 0) as rating
    FROM public.integration_stats istats
    WHERE istats.platform = 'leetcode'
  ),
  ranked AS (
    SELECT
      p.id as user_id,
      p.full_name,
      p.username,
      p.avatar_url,
      d.short_name as department,
      COALESCE(p.karma_points, 0) as karma_points,
      COALESCE(p.aura_points, 0) as aura_points,
      COALESCE(p.streak_days, 0) as streak_days,
      COALESCE(gs.repos, 0) as github_repos,
      COALESCE(gs.contributions, 0) as github_contributions,
      COALESCE(ls.solved, 0) as leetcode_solved,
      COALESCE(ls.rating, 0) as leetcode_rating,
      (
        COALESCE(p.karma_points, 0) * 1.0
        + COALESCE(gs.contributions, 0) * 0.5
        + COALESCE(ls.solved, 0) * 0.3
        + COALESCE(ls.rating, 0) * 0.2
        + COALESCE(p.streak_days, 0) * 2.0
      ) as combined_score
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN github_stats gs ON gs.user_id = p.id
    LEFT JOIN leetcode_stats ls ON ls.user_id = p.id
    WHERE p.is_public = true
      AND p.status = 'active'
      AND (p_campus_id IS NULL OR p.campus_id = p_campus_id)
  )
  SELECT * FROM ranked
  ORDER BY
    CASE
      WHEN p_sort = 'karma' THEN karma_points
      WHEN p_sort = 'combined' THEN combined_score
      ELSE aura_points
    END DESC,
    user_id  -- stable tie-break so pagination/order never flickers
  LIMIT p_limit;
$fn$;

-- Keep the default grant posture consistent with other leaderboard RPCs.
REVOKE EXECUTE ON FUNCTION public.get_enhanced_leaderboard(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enhanced_leaderboard(UUID, INT, TEXT) TO authenticated, anon;
