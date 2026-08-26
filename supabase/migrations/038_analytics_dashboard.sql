-- ============================================================
-- 038: Analytics Dashboard
--
-- Gives platform admins real-time metrics, growth tracking,
-- heatmaps, and content performance — all from the admin panel.
-- ============================================================

-- ── RPC: Platform overview stats ───────────────────────────
CREATE OR REPLACE FUNCTION public.get_analytics_overview()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH
  user_stats AS (
    SELECT
      count(*) as total_users,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '1 day') as daily_new,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') as weekly_new,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '30 days') as monthly_new,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '1 day' AND status = 'active') as dau,
      count(*) FILTER (WHERE status = 'suspended') as suspended_users,
      count(*) FILTER (WHERE status = 'banned') as banned_users
    FROM public.profiles
  ),
  post_stats AS (
    SELECT
      count(*) as total_posts,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '1 day') as daily_posts,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') as weekly_posts,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '30 days') as monthly_posts,
      count(DISTINCT author_id) as active_posters,
      coalesce(sum(view_count), 0) as total_views,
      coalesce(sum(share_count), 0) as total_shares
    FROM public.posts
    WHERE status = 'published'
  ),
  comment_stats AS (
    SELECT
      count(*) as total_comments,
      count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') as weekly_comments
    FROM public.post_comments
  ),
  engagement_stats AS (
    SELECT
      count(*) as total_likes
    FROM public.post_likes
  ),
  other_stats AS (
    SELECT
      (SELECT count(*) FROM public.colleges WHERE is_active = true) as active_colleges,
      (SELECT count(*) FROM public.communities WHERE is_active = true) as active_communities,
      (SELECT count(*) FROM public.notes) as total_notes,
      (SELECT count(*) FROM public.opportunities) as total_opportunities,
      (SELECT count(*) FROM public.events) as total_events,
      (SELECT count(*) FROM public.moderation_queue WHERE status = 'open') as open_mod_items
  )
  SELECT jsonb_build_object(
    'users', jsonb_build_object(
      'total', us.total_users,
      'daily_new', us.daily_new,
      'weekly_new', us.weekly_new,
      'monthly_new', us.monthly_new,
      'suspended', us.suspended_users,
      'banned', us.banned_users
    ),
    'posts', jsonb_build_object(
      'total', ps.total_posts,
      'daily', ps.daily_posts,
      'weekly', ps.weekly_posts,
      'monthly', ps.monthly_posts,
      'active_posters', ps.active_posters,
      'total_views', ps.total_views,
      'total_shares', ps.total_shares
    ),
    'engagement', jsonb_build_object(
      'total_comments', cs.total_comments,
      'weekly_comments', cs.weekly_comments,
      'total_likes', es.total_likes
    ),
    'platform', jsonb_build_object(
      'active_colleges', os.active_colleges,
      'active_communities', os.active_communities,
      'total_notes', os.total_notes,
      'total_opportunities', os.total_opportunities,
      'total_events', os.total_events,
      'open_mod_items', os.open_mod_items
    )
  ) FROM user_stats us, post_stats ps, comment_stats cs, engagement_stats es, other_stats os;
$fn$;

-- ── RPC: Daily growth (last 30 days) ───────────────────────
CREATE OR REPLACE FUNCTION public.get_analytics_growth()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH days AS (
    SELECT generate_series(
      (now() - INTERVAL '29 days')::date,
      now()::date,
      '1 day'::interval
    )::date as day
  ),
  user_growth AS (
    SELECT
      d.day,
      coalesce(up.daily_count, 0) as new_users
    FROM days d
    LEFT JOIN (
      SELECT created_at::date as day, count(*) as daily_count
      FROM public.profiles
      WHERE created_at > now() - INTERVAL '30 days'
      GROUP BY created_at::date
    ) up ON up.day = d.day
    ORDER BY d.day
  ),
  post_growth AS (
    SELECT
      d.day,
      coalesce(pp.daily_count, 0) as new_posts
    FROM days d
    LEFT JOIN (
      SELECT created_at::date as day, count(*) as daily_count
      FROM public.posts
      WHERE created_at > now() - INTERVAL '30 days' AND status = 'published'
      GROUP BY created_at::date
    ) pp ON pp.day = d.day
    ORDER BY d.day
  )
  SELECT jsonb_build_object(
    'labels', (SELECT jsonb_agg(day::text ORDER BY day) FROM user_growth),
    'users', (SELECT jsonb_agg(new_users ORDER BY day) FROM user_growth),
    'posts', (SELECT jsonb_agg(new_posts ORDER BY day) FROM post_growth)
  );
$fn$;

-- ── RPC: Activity heatmap (hourly × day of week) ───────────
CREATE OR REPLACE FUNCTION public.get_analytics_heatmap()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH posts AS (
    SELECT
      EXTRACT(DOW FROM created_at)::int as day_of_week,
      EXTRACT(HOUR FROM created_at)::int as hour_of_day,
      count(*) as count
    FROM public.posts
    WHERE created_at > now() - INTERVAL '30 days'
    GROUP BY day_of_week, hour_of_day
  ),
  comments AS (
    SELECT
      EXTRACT(DOW FROM created_at)::int as day_of_week,
      EXTRACT(HOUR FROM created_at)::int as hour_of_day,
      count(*) as count
    FROM public.post_comments
    WHERE created_at > now() - INTERVAL '30 days'
    GROUP BY day_of_week, hour_of_day
  ),
  combined AS (
    SELECT
      p.day_of_week,
      p.hour_of_day,
      p.count + coalesce(c.count, 0) as total
    FROM posts p
    LEFT JOIN comments c ON c.day_of_week = p.day_of_week AND c.hour_of_day = p.hour_of_day
    UNION
    SELECT
      c.day_of_week,
      c.hour_of_day,
      coalesce(p.count, 0) + c.count as total
    FROM comments c
    LEFT JOIN posts p ON p.day_of_week = c.day_of_week AND p.hour_of_day = c.hour_of_day
    WHERE p.day_of_week IS NULL
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'day', day_of_week,
      'hour', hour_of_day,
      'count', total
    ) ORDER BY day_of_week, hour_of_day
  ) FROM combined;
$fn$;

-- ── RPC: Top posts (content performance) ───────────────────
CREATE OR REPLACE FUNCTION public.get_analytics_top_posts(p_limit INT DEFAULT 20)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'body', left(p.body, 200),
      'post_type', p.post_type,
      'view_count', p.view_count,
      'share_count', p.share_count,
      'created_at', p.created_at,
      'author', jsonb_build_object(
        'full_name', pr.full_name,
        'username', pr.username
      ),
      'comments', (
        SELECT count(*) FROM public.post_comments pc WHERE pc.post_id = p.id AND pc.is_deleted = false
      ),
      'likes', (
        SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id
      )
    )
  )
  FROM (
    SELECT * FROM public.posts
    WHERE status = 'published'
    ORDER BY (view_count + share_count * 3) DESC
    LIMIT p_limit
  ) p
  LEFT JOIN public.profiles pr ON pr.id = p.author_id;
$fn$;

-- ── RPC: Top colleges by activity ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_analytics_top_colleges(p_limit INT DEFAULT 10)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT jsonb_agg(
    jsonb_build_object(
      'college_id', c.id,
      'name', c.name,
      'slug', c.slug,
      'user_count', coalesce(uc.cnt, 0),
      'post_count', coalesce(pc.cnt, 0)
    ) ORDER BY coalesce(uc.cnt, 0) DESC
  )
  FROM public.colleges c
  LEFT JOIN (
    SELECT college_id, count(*) as cnt FROM public.profiles GROUP BY college_id
  ) uc ON uc.college_id = c.id
  LEFT JOIN (
    SELECT college_id, count(*) as cnt FROM public.posts WHERE status = 'published' GROUP BY college_id
  ) pc ON pc.college_id = c.id
  WHERE c.is_active = true
  ORDER BY coalesce(uc.cnt, 0) DESC
  LIMIT p_limit;
$fn$;

-- ── RPC: Feature flag usage stats ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_analytics_feature_usage()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'total_flags', (SELECT count(*) FROM public.feature_flags),
    'enabled_flags', (SELECT count(*) FROM public.feature_flags WHERE enabled = true),
    'disabled_flags', (SELECT count(*) FROM public.feature_flags WHERE enabled = false),
    'categories', (
      SELECT jsonb_agg(jsonb_build_object('category', cat, 'enabled', en, 'disabled', dis))
      FROM (
        SELECT category, count(*) FILTER (WHERE enabled) as en, count(*) FILTER (WHERE NOT enabled) as dis
        FROM public.feature_flags GROUP BY category
      ) sub
    )
  );
$fn$;
