-- ============================================================
-- 040: Streak Rewards, Smart Reminders, Push Notifications
--
-- Streak rewards: badges earned for consistent activity,
-- feature unlocks based on streak milestones.
-- Smart reminders: deadline alerts, event reminders.
-- Push notifications: web push infrastructure.
-- ============================================================

-- ── Streak Rewards: Badges ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT NOT NULL DEFAULT '🏆',
  tier        TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
  requirement TEXT NOT NULL,          -- human-readable: "Post 7 days in a row"
  req_type    TEXT NOT NULL,           -- 'streak_days', 'total_posts', 'total_comments', 'total_karma', 'github_contributions', 'leetcode_solved'
  req_value   INT NOT NULL,           -- threshold value
  unlock_key  TEXT,                    -- optional: feature key unlocked by this badge
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Streak Rewards: User Badges (earned) ───────────────────
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- ── Streak Rewards: Daily Activity Log ─────────────────────
-- Tracks what the user did each day to maintain streaks.
CREATE TABLE IF NOT EXISTS public.daily_activity (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  posts_created  INT NOT NULL DEFAULT 0,
  comments_made  INT NOT NULL DEFAULT 0,
  reactions_given INT NOT NULL DEFAULT 0,
  logins        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, activity_date)
);

-- ── Streak Rewards: Feature Unlocks ────────────────────────
-- Maps badge tiers to feature unlocks.
CREATE TABLE IF NOT EXISTS public.feature_unlocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key     TEXT NOT NULL REFERENCES public.badges(key),
  feature_key   TEXT NOT NULL,        -- matches feature_flags.key
  unlock_level  TEXT NOT NULL,        -- badge tier required
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (badge_key, feature_key)
);

-- ── Smart Reminders ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('deadline', 'event', 'custom', 'streak', 'goal')),
  entity_type   TEXT,                 -- 'job_posting', 'event', 'poll', etc.
  entity_id     UUID,
  remind_at     TIMESTAMPTZ NOT NULL,
  is_sent       BOOLEAN NOT NULL DEFAULT FALSE,
  is_recurring  BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence    TEXT,                 -- 'daily', 'weekly', 'monthly'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.reminders (user_id, remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON public.reminders (is_sent, remind_at);

-- ── Push Subscriptions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth_key      TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- ── Notification Log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  url           TEXT,
  notification_type TEXT NOT NULL DEFAULT 'info' CHECK (notification_type IN ('info', 'reminder', 'streak', 'achievement', 'message')),
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications_log (user_id, is_read, created_at DESC);

-- ── RLS Policies ───────────────────────────────────────────

-- badges (read for all, write for admin)
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS badges_select ON public.badges;
CREATE POLICY badges_select ON public.badges FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS badges_insert ON public.badges;
CREATE POLICY badges_insert ON public.badges FOR INSERT WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS badges_update ON public.badges;
CREATE POLICY badges_update ON public.badges FOR UPDATE USING (public.is_platform_admin());

-- user_badges
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_badges_select ON public.user_badges;
CREATE POLICY user_badges_select ON public.user_badges FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS user_badges_insert ON public.user_badges;
CREATE POLICY user_badges_insert ON public.user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

-- daily_activity
ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_activity_select ON public.daily_activity;
CREATE POLICY daily_activity_select ON public.daily_activity FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS daily_activity_insert ON public.daily_activity;
CREATE POLICY daily_activity_insert ON public.daily_activity FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS daily_activity_update ON public.daily_activity;
CREATE POLICY daily_activity_update ON public.daily_activity FOR UPDATE USING (auth.uid() = user_id);

-- reminders
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminders_select ON public.reminders;
CREATE POLICY reminders_select ON public.reminders FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS reminders_insert ON public.reminders;
CREATE POLICY reminders_insert ON public.reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS reminders_update ON public.reminders;
CREATE POLICY reminders_update ON public.reminders FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS reminders_delete ON public.reminders;
CREATE POLICY reminders_delete ON public.reminders FOR DELETE USING (auth.uid() = user_id);

-- push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_sub_select ON public.push_subscriptions;
CREATE POLICY push_sub_select ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS push_sub_insert ON public.push_subscriptions;
CREATE POLICY push_sub_insert ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS push_sub_delete ON public.push_subscriptions;
CREATE POLICY push_sub_delete ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- notifications_log
ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_log_select ON public.notifications_log;
CREATE POLICY notif_log_select ON public.notifications_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notif_log_insert ON public.notifications_log;
CREATE POLICY notif_log_insert ON public.notifications_log FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_platform_admin());
DROP POLICY IF EXISTS notif_log_update ON public.notifications_log;
CREATE POLICY notif_log_update ON public.notifications_log FOR UPDATE USING (auth.uid() = user_id);

-- ── RPC: Get user's badges ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT jsonb_agg(jsonb_build_object(
    'key', b.key, 'name', b.name, 'description', b.description,
    'icon', b.icon, 'tier', b.tier, 'earned_at', ub.earned_at,
    'unlock_key', b.unlock_key
  ))
  FROM public.user_badges ub
  JOIN public.badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user_id
  ORDER BY ub.earned_at DESC;
$fn$;

-- ── RPC: Get all badges with unlock status for a user ──────
CREATE OR REPLACE FUNCTION public.get_badge_progress(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH earned AS (
    SELECT badge_id FROM public.user_badges WHERE user_id = p_user_id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'key', b.key, 'name', b.name, 'description', b.description,
    'icon', b.icon, 'tier', b.tier, 'req_type', b.req_type, 'req_value', b.req_value,
    'unlock_key', b.unlock_key, 'earned', (eb.badge_id IS NOT NULL),
    'sort_order', b.sort_order
  ) ORDER BY b.sort_order)
  FROM public.badges b
  LEFT JOIN earned eb ON eb.badge_id = b.id
  WHERE b.is_active = true;
$fn$;

-- ── RPC: Record daily activity ─────────────────────────────
CREATE OR REPLACE FUNCTION public.record_daily_activity(
  p_activity_type TEXT,
  p_count INT DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO public.daily_activity (user_id, activity_date, posts_created, comments_made, reactions_given, logins)
  VALUES (
    auth.uid(), CURRENT_DATE,
    CASE WHEN p_activity_type = 'post' THEN p_count ELSE 0 END,
    CASE WHEN p_activity_type = 'comment' THEN p_count ELSE 0 END,
    CASE WHEN p_activity_type = 'reaction' THEN p_count ELSE 0 END,
    CASE WHEN p_activity_type = 'login' THEN p_count ELSE 0 END
  )
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    posts_created = daily_activity.posts_created + EXCLUDED.posts_created,
    comments_made = daily_activity.comments_made + EXCLUDED.comments_made,
    reactions_given = daily_activity.reactions_given + EXCLUDED.reactions_given,
    logins = daily_activity.logins + EXCLUDED.logins;
END;
$fn$;

-- ── Seed: Streak Badges ────────────────────────────────────
INSERT INTO public.badges (key, name, description, icon, tier, requirement, req_type, req_value, sort_order) VALUES
  -- Streak badges
  ('streak_3',    'Getting Started',     '3-day activity streak',       '🔥', 'bronze',   'Login 3 days in a row',      'streak_days',   3,   1),
  ('streak_7',    'Week Warrior',        '7-day activity streak',       '🔥', 'silver',   'Login 7 days in a row',      'streak_days',   7,   2),
  ('streak_14',   'Fortnight Fighter',   '14-day activity streak',      '🔥', 'gold',     'Login 14 days in a row',     'streak_days',   14,  3),
  ('streak_30',   'Monthly Master',      '30-day activity streak',      '🔥', 'platinum', 'Login 30 days in a row',     'streak_days',   30,  4),
  ('streak_100',  'Century Champion',    '100-day activity streak',     '💎', 'diamond',  'Login 100 days in a row',    'streak_days',   100, 5),

  -- Post badges
  ('posts_10',    'First Poster',        'Create 10 posts',             '📝', 'bronze',   'Create 10 posts',            'total_posts',   10,  10),
  ('posts_50',    'Prolific Writer',     'Create 50 posts',             '📝', 'silver',   'Create 50 posts',            'total_posts',   50,  11),
  ('posts_100',   'Content King',        'Create 100 posts',            '📝', 'gold',     'Create 100 posts',           'total_posts',   100, 12),

  -- Comment badges
  ('comments_25', 'Helpful Hand',        'Write 25 comments',           '💬', 'bronze',   'Write 25 comments',          'total_comments', 25, 20),
  ('comments_100','Discussion Pro',      'Write 100 comments',          '💬', 'silver',   'Write 100 comments',         'total_comments', 100, 21),

  -- Karma badges
  ('karma_100',   'Rising Star',         'Earn 100 karma points',       '⭐', 'bronze',   'Earn 100 karma points',      'total_karma',   100, 30),
  ('karma_500',   'Campus Hero',         'Earn 500 karma points',       '⭐', 'silver',   'Earn 500 karma points',      'total_karma',   500, 31),
  ('karma_1000',  'Legend',              'Earn 1000 karma points',      '⭐', 'gold',     'Earn 1000 karma points',     'total_karma',   1000, 32),

  -- GitHub badges
  ('github_connected', 'Open Source Dev', 'Connect your GitHub profile',  '🐙', 'bronze',   'Connect GitHub',             'github_contributions', 0, 40),

  -- LeetCode badges
  ('leetcode_connected', 'DSA Warrior',  'Connect your LeetCode profile', '🧩', 'bronze',   'Connect LeetCode',           'leetcode_solved', 0, 41),
  ('leetcode_100', 'Century Solver',      'Solve 100 LeetCode problems', '🧩', 'silver',   'Solve 100 problems',         'leetcode_solved', 100, 42),
  ('leetcode_500', 'Problem Master',      'Solve 500 LeetCode problems', '🧩', 'gold',     'Solve 500 problems',         'leetcode_solved', 500, 43)
ON CONFLICT (key) DO NOTHING;
