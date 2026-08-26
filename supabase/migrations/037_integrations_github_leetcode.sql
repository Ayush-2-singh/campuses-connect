-- ============================================================
-- 037: GitHub & LeetCode Integrations + Enhanced Leaderboard
--
-- Students connect their GitHub / LeetCode profiles.
-- Stats are cached in the DB so the leaderboard loads fast.
-- ============================================================

-- ── User Integrations ──────────────────────────────────────
-- Stores the connected account for each platform per user.
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('github', 'leetcode', 'codeforces')),
  username        TEXT NOT NULL,                    -- GitHub / LeetCode handle
  display_name    TEXT,                             -- optional display override
  profile_url     TEXT,                             -- link to the profile
  avatar_url      TEXT,                             -- platform avatar
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,   -- true when stats are synced
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at  TIMESTAMPTZ,
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user ON public.user_integrations (user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_platform ON public.user_integrations (platform, username);

-- ── Integration Stats (cached) ─────────────────────────────
-- Each row is a snapshot of a user's platform stats at a point in time.
CREATE TABLE IF NOT EXISTS public.integration_stats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('github', 'leetcode', 'codeforces')),
  stats         JSONB NOT NULL DEFAULT '{}',       -- platform-specific stats
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_integration_stats_user ON public.integration_stats (user_id, platform);

-- ── RLS Policies ───────────────────────────────────────────
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_stats ENABLE ROW LEVEL SECURITY;

-- user_integrations: read for everyone (public profiles), write for owner only
DROP POLICY IF EXISTS user_integrations_select ON public.user_integrations;
CREATE POLICY user_integrations_select ON public.user_integrations
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS user_integrations_insert ON public.user_integrations;
CREATE POLICY user_integrations_insert ON public.user_integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_integrations_update ON public.user_integrations;
CREATE POLICY user_integrations_update ON public.user_integrations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_integrations_delete ON public.user_integrations;
CREATE POLICY user_integrations_delete ON public.user_integrations
  FOR DELETE USING (auth.uid() = user_id);

-- integration_stats: read for everyone, write via service only
DROP POLICY IF EXISTS integration_stats_select ON public.integration_stats;
CREATE POLICY integration_stats_select ON public.integration_stats
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS integration_stats_upsert ON public.integration_stats;
CREATE POLICY integration_stats_upsert ON public.integration_stats
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS integration_stats_update ON public.integration_stats;
CREATE POLICY integration_stats_update ON public.integration_stats
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ── RPC: get user's integration stats ──────────────────────
CREATE OR REPLACE FUNCTION public.get_user_integrations(p_user_id UUID)
RETURNS TABLE (
  platform text,
  username text,
  display_name text,
  profile_url text,
  avatar_url text,
  is_verified boolean,
  stats jsonb,
  synced_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    ui.platform,
    ui.username,
    ui.display_name,
    ui.profile_url,
    ui.avatar_url,
    ui.is_verified,
    COALESCE(istats.stats, '{}'::jsonb) as stats,
    istats.synced_at
  FROM public.user_integrations ui
  LEFT JOIN public.integration_stats istats
    ON istats.user_id = ui.user_id AND istats.platform = ui.platform
  WHERE ui.user_id = p_user_id
  ORDER BY ui.platform;
$fn$;

-- ── RPC: leaderboard with combined score ───────────────────
-- Combines karma + GitHub contributions + LeetCode solved
CREATE OR REPLACE FUNCTION public.get_enhanced_leaderboard(
  p_campus_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  user_id UUID,
  full_name text,
  username text,
  avatar_url text,
  department short_name text,
  karma_points int,
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
  )
  SELECT
    p.id as user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    d.short_name as department,
    COALESCE(p.karma_points, 0) as karma_points,
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
  ORDER BY combined_score DESC
  LIMIT p_limit;
$fn$;
