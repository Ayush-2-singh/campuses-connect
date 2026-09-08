-- ============================================================
-- Security Hardening Migration (2026-09-08)
-- 
-- GOAL: Allow public website to READ intentionally public data
--       while preventing unauthorized INSERT/UPDATE/DELETE.
--
-- CRITICAL FIXES:
--   1. Enable RLS on rate_limits and feature_unlocks (were open)
--   2. Allow anonymous read for global notes
--   3. Allow anonymous read for global published posts
--   4. Allow anonymous read for published events
--   5. Lock down internal tables
--
-- SAFE: No data deleted, no tables dropped, no functionality broken.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- 1. INTERNAL TABLES — Enable RLS, lock down
-- ══════════════════════════════════════════════════════════════

-- rate_limits: server-side only via SECURITY DEFINER functions
-- No client access needed at all
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = no client access (SECURITY DEFINER functions bypass RLS)

-- feature_unlocks: config data, public read is fine (it's just badge→feature mapping)
ALTER TABLE public.feature_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_unlocks_select ON public.feature_unlocks;
CREATE POLICY feature_unlocks_select ON public.feature_unlocks
  FOR SELECT USING (TRUE);

-- Admin-only write for feature_unlocks
DROP POLICY IF EXISTS feature_unlocks_write ON public.feature_unlocks;
CREATE POLICY feature_unlocks_write ON public.feature_unlocks
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());


-- ══════════════════════════════════════════════════════════════
-- 2. NOTES — Allow anonymous read for global/verified notes
-- ══════════════════════════════════════════════════════════════

-- Update can_view_note to allow anonymous read for global notes
CREATE OR REPLACE FUNCTION public.can_view_note(p_note public.notes)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
        v_prof RECORD;
BEGIN
  -- Allow anonymous read for global notes (public website content)
  IF v_uid IS NULL THEN
    RETURN p_note.visibility = 'global'
       OR (SELECT value FROM public.app_settings WHERE key = 'campus_content_to_global') = 'true';
  END IF;

  IF p_note.visibility = 'global' THEN RETURN TRUE; END IF;

  IF (SELECT value FROM public.app_settings WHERE key = 'campus_content_to_global') = 'true' THEN
    RETURN TRUE;
  END IF;

  SELECT campus_id, college_id INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF v_prof IS NULL THEN RETURN FALSE; END IF;
  IF v_prof.campus_id IS NULL AND v_prof.college_id IS NULL THEN RETURN FALSE; END IF;

  RETURN (p_note.campus_id IS NOT NULL AND v_prof.campus_id = p_note.campus_id)
      OR (p_note.campus_id IS NULL AND p_note.college_id IS NOT NULL AND v_prof.college_id = p_note.college_id)
      OR (p_note.campus_id IS NULL AND p_note.college_id IS NULL);
END;
$function$;

-- Grant anon SELECT on notes (RLS policy handles visibility)
GRANT SELECT ON public.notes TO anon;

-- Fix notes INSERT policy: allow any authenticated user to submit notes
-- (admin approval via is_verified flag handles quality control)
-- Previously: students could NOT insert notes due to content_permissions matrix (NULL for student+notes)
DROP POLICY IF EXISTS notes_insert ON public.notes;
CREATE POLICY notes_insert ON public.notes
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
  );


-- ══════════════════════════════════════════════════════════════
-- 3. POSTS — Allow anonymous read for global published posts
-- ══════════════════════════════════════════════════════════════

-- Update can_view_post to allow anonymous read for global posts
CREATE OR REPLACE FUNCTION public.can_view_post(p_post public.posts)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
        v_prof RECORD;
BEGIN
  IF p_post.status = 'removed' THEN RETURN FALSE; END IF;

  -- Allow anonymous read for global published posts
  IF v_uid IS NULL THEN
    RETURN p_post.scope = 'global' AND p_post.status = 'published';
  END IF;

  -- Held (AI) posts: only author and moderators see them
  IF p_post.status = 'held' THEN
    RETURN p_post.author_id = v_uid
        OR public.has_mod_permission(v_uid, 'content.moderation', p_post.campus_id);
  END IF;

  IF p_post.scope = 'global' THEN RETURN TRUE; END IF;

  SELECT college_id, campus_id INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF v_prof IS NULL THEN RETURN FALSE; END IF;

  IF p_post.scope = 'college_network' THEN
    RETURN v_prof.college_id IS NOT NULL AND v_prof.college_id = p_post.college_id;
  END IF;

  IF p_post.scope = 'campus' THEN
    RETURN v_prof.campus_id IS NOT NULL AND v_prof.campus_id = p_post.campus_id;
  END IF;

  RETURN FALSE;
END;
$function$;

-- Grant anon SELECT on posts (RLS policy handles visibility)
GRANT SELECT ON public.posts TO anon;
GRANT SELECT ON public.post_comments TO anon;
GRANT SELECT ON public.post_reactions TO anon;


-- ══════════════════════════════════════════════════════════════
-- 4. EVENTS — Allow anonymous read for published public events
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events
  FOR SELECT USING (
    -- Anonymous: only published public events
    (auth.uid() IS NULL AND is_published AND (visibility IS NULL OR visibility = 'public'))
    OR
    -- Authenticated: published events they can see
    (auth.uid() IS NOT NULL AND is_published
     AND (visibility IS NULL OR visibility = 'public'
          OR campus_id IN (SELECT campus_id FROM public.profiles WHERE id = auth.uid())
          OR college_id IN (SELECT college_id FROM public.profiles WHERE id = auth.uid())))
  );

-- Grant anon SELECT on events
GRANT SELECT ON public.events TO anon;


-- ══════════════════════════════════════════════════════════════
-- 5. BLOG — Already allows anonymous read (status = 'published')
--    Just ensure anon has SELECT grant
-- ══════════════════════════════════════════════════════════════

GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT ON public.blog_comments TO anon;
GRANT SELECT ON public.blog_likes TO anon;
GRANT SELECT ON public.blog_comment_likes TO anon;


-- ══════════════════════════════════════════════════════════════
-- 6. COMMUNITIES & CATALOGS — Already public read, ensure anon grants
-- ══════════════════════════════════════════════════════════════

GRANT SELECT ON public.communities TO anon;
GRANT SELECT ON public.content_categories TO anon;
GRANT SELECT ON public.admin_types TO anon;
GRANT SELECT ON public.ai_agents TO anon;
GRANT SELECT ON public.clubs TO anon;
GRANT SELECT ON public.study_groups TO anon;
GRANT SELECT ON public.campus_insights TO anon;


-- ══════════════════════════════════════════════════════════════
-- 7. POLL ANON READ — Already has GRANT from 20260907 fix
--    But RLS policy requires auth.uid() IS NOT NULL.
--    Update policy to also allow anon read.
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS polls_select ON public.polls;
CREATE POLICY polls_select ON public.polls
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS poll_votes_select ON public.poll_votes;
CREATE POLICY poll_votes_select ON public.poll_votes
  FOR SELECT USING (TRUE);


-- ══════════════════════════════════════════════════════════════
-- 8. AUDIT: Verify all tables have RLS enabled
-- ══════════════════════════════════════════════════════════════

-- This query shows any tables still missing RLS
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
    ORDER BY 1
  ) LOOP
    RAISE WARNING 'Table % still has RLS DISABLED', r.tbl;
  END LOOP;
END $$;
