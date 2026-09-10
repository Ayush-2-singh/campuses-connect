-- ============================================================
-- CampusConnect — 026 GLOBAL LAYER
-- "Global is the default home; campus is an optional layer."
--   1. Students can post at GLOBAL scope (discussion / resource /
--      project / opportunity / hackathon) — no campus needed.
--   2. Students are blocked from the middle 'college_network'
--      scope (admin territory), so the ladder stays: campus|global.
--   3. Posting inside a global community requires being an
--      approved member (or having a grant for that community).
--   4. Published global posts are readable by logged-out visitors
--      (the public face of the product); posting/joining still
--      requires an account.
--   5. college_requests — "my college isn't listed" demand signal.
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Student matrix: campus → global for the global-appropriate
--    categories. Engine untouched — data change only.
-- ------------------------------------------------------------
INSERT INTO public.content_permissions (actor_type, category_id, max_scope)
SELECT 'student', cc.id, 'global'
FROM public.content_categories cc
WHERE cc.key IN ('discussion', 'resource', 'project', 'opportunity', 'hackathon')
ON CONFLICT (actor_type, category_id) DO UPDATE SET max_scope = EXCLUDED.max_scope;

-- ------------------------------------------------------------
-- 2. can_create_post — scope + community guards
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_create_post(
  p_user_id UUID,
  p_category_key TEXT,
  p_scope TEXT,
  p_community_id UUID DEFAULT NULL,
  p_campus_id UUID DEFAULT NULL,
  p_college_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor TEXT;
        v_max   TEXT;
BEGIN
  IF p_scope NOT IN ('campus', 'college_network', 'global') THEN RETURN FALSE; END IF;

  v_actor := public.user_admin_type(p_user_id, p_campus_id, p_college_id, p_community_id);

  -- Community admins may only act inside their community
  IF v_actor = 'community_admin' AND p_community_id IS NULL THEN RETURN FALSE; END IF;
  -- Campus admins must always have a campus/college context for their posts
  IF v_actor = 'campus_admin' AND p_campus_id IS NULL AND p_college_id IS NULL THEN RETURN FALSE; END IF;

  -- Community posts are always global AND require an approved membership
  -- (or an admin grant for that community / platform grant).
  IF p_community_id IS NOT NULL THEN
    IF p_scope <> 'global' THEN RETURN FALSE; END IF;
    IF NOT (
      EXISTS (SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = p_community_id AND cm.user_id = p_user_id AND cm.status = 'approved')
      OR EXISTS (SELECT 1 FROM public.admin_grants g
                 WHERE g.user_id = p_user_id AND g.admin_type = 'community_admin'
                   AND g.community_id = p_community_id)
      OR EXISTS (SELECT 1 FROM public.admin_grants g
                 WHERE g.user_id = p_user_id AND g.admin_type = 'platform_admin')
    ) THEN RETURN FALSE; END IF;
  END IF;

  -- Students: their own campus or global — never the whole-college layer
  IF v_actor = 'student' AND p_scope = 'college_network' THEN RETURN FALSE; END IF;

  SELECT cp.max_scope INTO v_max
  FROM public.content_permissions cp
  JOIN public.content_categories cc ON cc.id = cp.category_id
  WHERE cp.actor_type = v_actor AND cc.key = p_category_key;

  RETURN v_max IS NOT NULL AND public.scope_level(v_max) >= public.scope_level(p_scope);
END;
$$;

-- list_creatable_categories: in a community context only categories that
-- can actually be posted there (community posts are always global).
CREATE OR REPLACE FUNCTION public.list_creatable_categories(
  p_user_id UUID,
  p_community_id UUID DEFAULT NULL,
  p_campus_id UUID DEFAULT NULL,
  p_college_id UUID DEFAULT NULL
) RETURNS TABLE (category_key TEXT, label TEXT, max_scope TEXT, category_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cc.key, cc.label, cp.max_scope, cc.id
  FROM public.content_categories cc
  JOIN public.content_permissions cp ON cp.category_id = cc.id
  WHERE cp.actor_type = public.user_admin_type(p_user_id, p_campus_id, p_college_id, p_community_id)
    AND cp.max_scope IS NOT NULL
    AND (p_community_id IS NULL OR cp.max_scope = 'global')
  ORDER BY cc.sort_order;
$$;

-- ------------------------------------------------------------
-- 3. can_view_post — published global posts are the public layer,
--    readable by everyone (even logged-out visitors). Held posts
--    stay author/moderator-only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_post(p_post public.posts)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
        v_prof RECORD;
BEGIN
  IF p_post.status = 'removed' THEN RETURN FALSE; END IF;

  -- Held (AI) posts: only author and moderators see them
  IF p_post.status = 'held' THEN
    IF v_uid IS NULL THEN RETURN FALSE; END IF;
    RETURN p_post.author_id = v_uid
        OR public.has_mod_permission(v_uid, 'content.moderation', p_post.campus_id);
  END IF;

  -- Global posts are the public layer — visible to everyone
  IF p_post.scope = 'global' THEN RETURN TRUE; END IF;

  IF v_uid IS NULL THEN RETURN FALSE; END IF;

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
$$;

-- ------------------------------------------------------------
-- 4. college_requests — "my college isn't listed" signal
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.college_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  city         TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'added', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_college_requests_status ON public.college_requests (status, created_at);

ALTER TABLE public.college_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can request a college; users see their own requests
CREATE POLICY cr_insert ON public.college_requests
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

CREATE POLICY cr_select_own ON public.college_requests
  FOR SELECT TO authenticated USING (requested_by = auth.uid());

-- Admins see everything and can mark colleges as added
CREATE POLICY cr_admin_all ON public.college_requests
  FOR ALL TO authenticated
  USING (public.has_mod_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'users.manage'));

-- ------------------------------------------------------------
-- Verify: student matrix now has global rows
-- ------------------------------------------------------------
SELECT actor_type, cc.key, cp.max_scope
FROM public.content_permissions cp
JOIN public.content_categories cc ON cc.id = cp.category_id
WHERE cp.actor_type = 'student'
ORDER BY cc.sort_order;
