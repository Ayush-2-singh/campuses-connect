-- ============================================================
-- CampusConnect V3 — Authorization Engine + RLS (migration 003)
-- Centralized, data-driven. UI and DB both consult these functions.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Scope helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scope_level(p_scope TEXT)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT CASE p_scope
    WHEN 'campus' THEN 1
    WHEN 'college_network' THEN 2
    WHEN 'global' THEN 3
    ELSE 0 END;
$$;

-- ------------------------------------------------------------
-- 2. Resolve the effective admin actor for a context.
--    Precedence: platform_admin > campus_admin > community_admin > student
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_admin_type(
  p_user_id UUID,
  p_campus_id UUID DEFAULT NULL,
  p_college_id UUID DEFAULT NULL,
  p_community_id UUID DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_grants
             WHERE user_id = p_user_id AND admin_type = 'platform_admin') THEN
    RETURN 'platform_admin';
  END IF;

  IF p_campus_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_grants
    WHERE user_id = p_user_id AND admin_type = 'campus_admin' AND campus_id = p_campus_id) THEN
    RETURN 'campus_admin';
  END IF;

  IF p_college_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_grants g
    JOIN public.campuses c ON c.college_id = p_college_id
    WHERE g.user_id = p_user_id AND g.admin_type = 'campus_admin'
      AND (g.campus_id = c.id OR (g.campus_id IS NULL AND g.college_id = p_college_id))) THEN
    RETURN 'campus_admin';
  END IF;

  IF p_community_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_grants
    WHERE user_id = p_user_id AND admin_type = 'community_admin' AND community_id = p_community_id) THEN
    RETURN 'community_admin';
  END IF;

  RETURN 'student';
END;
$$;

-- ------------------------------------------------------------
-- 3. ★ can_create_post — the dynamic matrix check
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

  -- Community admins may only act inside their community; community posts are always global
  IF v_actor = 'community_admin' AND p_community_id IS NULL THEN RETURN FALSE; END IF;
  IF p_community_id IS NOT NULL AND p_scope <> 'global' THEN RETURN FALSE; END IF;
  -- Campus admins must always have a campus/college context for their posts
  IF v_actor = 'campus_admin' AND p_campus_id IS NULL AND p_college_id IS NULL THEN RETURN FALSE; END IF;

  SELECT cp.max_scope INTO v_max
  FROM public.content_permissions cp
  JOIN public.content_categories cc ON cc.id = cp.category_id
  WHERE cp.actor_type = v_actor AND cc.key = p_category_key;

  RETURN v_max IS NOT NULL AND public.scope_level(v_max) >= public.scope_level(p_scope);
END;
$$;

-- 3b. ★ can_create_post by category ID (used by the RLS policy — no NEW-in-subquery)
CREATE OR REPLACE FUNCTION public.can_create_post_by_category(
  p_user_id UUID,
  p_category_id UUID,
  p_scope TEXT,
  p_community_id UUID DEFAULT NULL,
  p_campus_id UUID DEFAULT NULL,
  p_college_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key TEXT;
BEGIN
  SELECT cc.key INTO v_key FROM public.content_categories cc WHERE cc.id = p_category_id;
  IF v_key IS NULL THEN RETURN FALSE; END IF;
  RETURN public.can_create_post(p_user_id, v_key, p_scope, p_community_id, p_campus_id, p_college_id);
END;
$$;

-- What can this user create, right now, in this context? (drives the composer UI)
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
  ORDER BY cc.sort_order;
$$;

-- ------------------------------------------------------------
-- 4. Moderation capability check (granular layer)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_mod_permission(
  p_user_id UUID,
  p_key TEXT,
  p_campus_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_grants
             WHERE user_id = p_user_id AND admin_type = 'platform_admin') THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.moderation_permissions mp
    WHERE mp.user_id = p_user_id AND mp.permission_key = p_key
      AND (mp.scope = 'global'
           OR (p_campus_id IS NOT NULL AND mp.scope = 'campus' AND mp.campus_id = p_campus_id))
  );
END;
$$;

-- ------------------------------------------------------------
-- 5. Post visibility (scope-aware read)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_post(p_post public.posts)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
        v_prof RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  IF p_post.status = 'removed' THEN RETURN FALSE; END IF;

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
$$;

CREATE OR REPLACE FUNCTION public.can_view_post_id(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.posts;
BEGIN
  SELECT * INTO p FROM public.posts WHERE id = p_post_id;
  RETURN p.id IS NOT NULL AND public.can_view_post(p);
END;
$$;

-- Comment/like/save interaction: view + (for community posts) membership
CREATE OR REPLACE FUNCTION public.can_interact_post(p_post public.posts)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.can_view_post(p_post) THEN RETURN FALSE; END IF;
  IF p_post.community_id IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.community_members
                   WHERE community_id = p_post.community_id AND user_id = v_uid);
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_interact_post_id(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.posts;
BEGIN
  SELECT * INTO p FROM public.posts WHERE id = p_post_id;
  RETURN p.id IS NOT NULL AND public.can_interact_post(p);
END;
$$;

-- ------------------------------------------------------------
-- 6. RLS — purge legacy policies, enable RLS, create new ones
-- ------------------------------------------------------------
-- Remove ANY existing policies (e.g. dashboard-generated "Enable read for all")
-- that would otherwise override the scope-aware policies below.
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles','posts','post_comments','post_reactions','saved_posts',
        'communities','community_members','content_categories','admin_types',
        'admin_grants','content_permissions','moderation_permissions',
        'ai_agents','campus_ai_agents','moderation_queue','content_reports',
        'audit_log','college_email_verifications','lost_found','clubs',
        'club_members','study_groups','study_group_members','campus_insights'
      )
  ) LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6a. Self-heal: pre-V3 projects had legacy-shaped, EMPTY clubs /
--     club_members tables (campus_id, profile_id, slug, ...) that
--     don't match the V3 schema the policies below expect.
--     They hold no data, so rebuild them to the V3 shape.
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.club_members;
DROP TABLE IF EXISTS public.clubs;

CREATE TABLE public.clubs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id  UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  logo_url    TEXT,
  created_by  UUID REFERENCES auth.users(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.club_members (
  club_id    UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_grants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_ai_agents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_found           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_insights      ENABLE ROW LEVEL SECURITY;

-- profiles -------------------------------------------------
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (id = auth.uid() OR is_public);

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());   -- trigger also creates rows

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'users.manage')
  )
  WITH CHECK (
    id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'users.manage')
  );
-- NOTE: "no self status changes" is enforced by trg_profiles_status_guard below
-- (RLS policy expressions cannot reference NEW/OLD).

-- posts ----------------------------------------------------
DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts
  FOR SELECT USING (public.can_view_post(posts));

DROP POLICY IF EXISTS posts_insert ON public.posts;
CREATE POLICY posts_insert ON public.posts
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND public.can_create_post_by_category(auth.uid(), category_id, scope,
        community_id, campus_id, college_id)
  );

DROP POLICY IF EXISTS posts_update ON public.posts;
CREATE POLICY posts_update ON public.posts
  FOR UPDATE USING (
    author_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'post.manage', posts.campus_id)
  )
  WITH CHECK (
    author_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'post.manage', posts.campus_id)
  );
-- NOTE: "authors cannot re-scope/re-categorize/publish held posts" is enforced
-- by trg_posts_update_guard below (RLS policy expressions cannot reference NEW/OLD).

DROP POLICY IF EXISTS posts_delete ON public.posts;
CREATE POLICY posts_delete ON public.posts
  FOR DELETE USING (
    author_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'post.manage', posts.campus_id)
  );

-- comments ------------------------------------------------
DROP POLICY IF EXISTS comments_select ON public.post_comments;
CREATE POLICY comments_select ON public.post_comments
  FOR SELECT USING (public.can_view_post_id(post_id) AND NOT is_deleted);

DROP POLICY IF EXISTS comments_insert ON public.post_comments;
CREATE POLICY comments_insert ON public.post_comments
  FOR INSERT WITH CHECK (author_id = auth.uid() AND public.can_interact_post_id(post_id));

DROP POLICY IF EXISTS comments_update ON public.post_comments;
CREATE POLICY comments_update ON public.post_comments
  FOR UPDATE USING (author_id = auth.uid());

DROP POLICY IF EXISTS comments_delete ON public.post_comments;
CREATE POLICY comments_delete ON public.post_comments
  FOR DELETE USING (
    author_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

-- reactions -----------------------------------------------
DROP POLICY IF EXISTS reactions_select ON public.post_reactions;
CREATE POLICY reactions_select ON public.post_reactions
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS reactions_insert ON public.post_reactions;
CREATE POLICY reactions_insert ON public.post_reactions
  FOR INSERT WITH CHECK (profile_id = auth.uid() AND public.can_interact_post_id(post_id));

DROP POLICY IF EXISTS reactions_update ON public.post_reactions;
CREATE POLICY reactions_update ON public.post_reactions
  FOR UPDATE USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid() AND public.can_interact_post_id(post_id));

DROP POLICY IF EXISTS reactions_delete ON public.post_reactions;
CREATE POLICY reactions_delete ON public.post_reactions
  FOR DELETE USING (profile_id = auth.uid());

-- saved posts ---------------------------------------------
DROP POLICY IF EXISTS saved_select ON public.saved_posts;
CREATE POLICY saved_select ON public.saved_posts
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS saved_insert ON public.saved_posts;
CREATE POLICY saved_insert ON public.saved_posts
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.can_view_post_id(post_id));

DROP POLICY IF EXISTS saved_delete ON public.saved_posts;
CREATE POLICY saved_delete ON public.saved_posts
  FOR DELETE USING (user_id = auth.uid());

-- communities ---------------------------------------------
DROP POLICY IF EXISTS communities_select ON public.communities;
CREATE POLICY communities_select ON public.communities
  FOR SELECT USING (is_active);

DROP POLICY IF EXISTS communities_write ON public.communities;
CREATE POLICY communities_write ON public.communities
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'users.manage'));

-- community_members ---------------------------------------
DROP POLICY IF EXISTS cmembers_select ON public.community_members;
CREATE POLICY cmembers_select ON public.community_members
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS cmembers_insert ON public.community_members;
CREATE POLICY cmembers_insert ON public.community_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cmembers_delete ON public.community_members;
CREATE POLICY cmembers_delete ON public.community_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'users.manage')
  );

-- catalogs (read for all authenticated, write = platform admins) --
DROP POLICY IF EXISTS cat_select ON public.content_categories;
CREATE POLICY cat_select ON public.content_categories FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS cat_write ON public.content_categories;
CREATE POLICY cat_write ON public.content_categories
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS atypes_select ON public.admin_types;
CREATE POLICY atypes_select ON public.admin_types FOR SELECT USING (TRUE);

-- admin_grants --------------------------------------------
DROP POLICY IF EXISTS grants_select ON public.admin_grants;
CREATE POLICY grants_select ON public.admin_grants
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'users.manage')
    OR public.has_mod_permission(auth.uid(), 'agent.manage')
  );

DROP POLICY IF EXISTS grants_write ON public.admin_grants;
CREATE POLICY grants_write ON public.admin_grants
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'users.manage'));

-- content_permissions (matrix) — read for all, write = platform --
DROP POLICY IF EXISTS matrix_select ON public.content_permissions;
CREATE POLICY matrix_select ON public.content_permissions FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS matrix_write ON public.content_permissions;
CREATE POLICY matrix_write ON public.content_permissions
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'users.manage'));

-- moderation_permissions ----------------------------------
DROP POLICY IF EXISTS mperm_select ON public.moderation_permissions;
CREATE POLICY mperm_select ON public.moderation_permissions
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'users.manage')
    OR public.has_mod_permission(auth.uid(), 'agent.manage')
  );

DROP POLICY IF EXISTS mperm_write ON public.moderation_permissions;
CREATE POLICY mperm_write ON public.moderation_permissions
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'users.manage'));

-- ai_agents -----------------------------------------------
DROP POLICY IF EXISTS ai_select ON public.ai_agents;
CREATE POLICY ai_select ON public.ai_agents FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS ai_write ON public.ai_agents;
CREATE POLICY ai_write ON public.ai_agents
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'ai_agent.configure'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'ai_agent.configure'));

DROP POLICY IF EXISTS cai_select ON public.campus_ai_agents;
CREATE POLICY cai_select ON public.campus_ai_agents FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS cai_write ON public.campus_ai_agents;
CREATE POLICY cai_write ON public.campus_ai_agents
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'ai_agent.configure'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'ai_agent.configure'));

-- moderation_queue ----------------------------------------
DROP POLICY IF EXISTS queue_select ON public.moderation_queue;
CREATE POLICY queue_select ON public.moderation_queue
  FOR SELECT USING (public.has_mod_permission(auth.uid(), 'content.moderation'));

DROP POLICY IF EXISTS queue_update ON public.moderation_queue;
CREATE POLICY queue_update ON public.moderation_queue
  FOR UPDATE USING (public.has_mod_permission(auth.uid(), 'content.moderation'));

-- content_reports -----------------------------------------
DROP POLICY IF EXISTS reports_insert ON public.content_reports;
CREATE POLICY reports_insert ON public.content_reports
  FOR INSERT WITH CHECK (reported_by = auth.uid());

DROP POLICY IF EXISTS reports_select ON public.content_reports;
CREATE POLICY reports_select ON public.content_reports
  FOR SELECT USING (public.has_mod_permission(auth.uid(), 'report.manage'));

DROP POLICY IF EXISTS reports_update ON public.content_reports;
CREATE POLICY reports_update ON public.content_reports
  FOR UPDATE USING (public.has_mod_permission(auth.uid(), 'report.manage'));

-- audit_log -----------------------------------------------
DROP POLICY IF EXISTS audit_select ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log
  FOR SELECT USING (public.has_mod_permission(auth.uid(), 'analytics.view'));

-- college_email_verifications (own + verifier) ------------
DROP POLICY IF EXISTS cever_select ON public.college_email_verifications;
CREATE POLICY cever_select ON public.college_email_verifications
  FOR SELECT USING (user_id = auth.uid() OR public.has_mod_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS cever_insert ON public.college_email_verifications;
CREATE POLICY cever_insert ON public.college_email_verifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- lost_found (students can post; same-college visibility) -
DROP POLICY IF EXISTS lf_select ON public.lost_found;
CREATE POLICY lf_select ON public.lost_found
  FOR SELECT USING (
    posted_by = auth.uid()
    OR campus_id IN (SELECT campus_id FROM public.profiles WHERE id = auth.uid())
    OR college_id IN (SELECT college_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS lf_insert ON public.lost_found;
CREATE POLICY lf_insert ON public.lost_found
  FOR INSERT WITH CHECK (posted_by = auth.uid());

DROP POLICY IF EXISTS lf_update ON public.lost_found;
CREATE POLICY lf_update ON public.lost_found
  FOR UPDATE USING (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

-- clubs / study groups / insights ------------------------
DROP POLICY IF EXISTS clubs_select ON public.clubs;
CREATE POLICY clubs_select ON public.clubs FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS clubs_insert ON public.clubs;
CREATE POLICY clubs_insert ON public.clubs
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND public.has_mod_permission(auth.uid(), 'campus.settings')
  );

DROP POLICY IF EXISTS clubm_all ON public.club_members;
CREATE POLICY clubm_all ON public.club_members
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS sg_select ON public.study_groups;
CREATE POLICY sg_select ON public.study_groups FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS sg_insert ON public.study_groups;
CREATE POLICY sg_insert ON public.study_groups
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS sgm_all ON public.study_group_members;
CREATE POLICY sgm_all ON public.study_group_members
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS insights_select ON public.campus_insights;
CREATE POLICY insights_select ON public.campus_insights
  FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS insights_insert ON public.campus_insights;
CREATE POLICY insights_insert ON public.campus_insights
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND public.has_mod_permission(auth.uid(), 'campus.settings')
  );

-- ------------------------------------------------------------
-- 6b. Guard triggers — RLS expressions can't use NEW/OLD, so old-vs-new
--     rules live in BEFORE UPDATE triggers.
-- ------------------------------------------------------------
-- Profile status changes (suspend/ban) are moderator-only
CREATE OR REPLACE FUNCTION public.guard_profile_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT public.has_mod_permission(auth.uid(), 'users.manage') THEN
    RAISE EXCEPTION 'Only moderators can change account status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_status_guard ON public.profiles;
CREATE TRIGGER trg_profiles_status_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_status_change();

-- Authors may not re-scope, re-categorize, change community, or publish held posts
CREATE OR REPLACE FUNCTION public.guard_post_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.author_id = auth.uid()
     AND NOT public.has_mod_permission(auth.uid(), 'post.manage', OLD.campus_id) THEN
    IF NEW.scope IS DISTINCT FROM OLD.scope
       OR NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.community_id IS DISTINCT FROM OLD.community_id
       OR (NEW.status = 'published' AND OLD.status <> 'published') THEN
      RAISE EXCEPTION 'Authors cannot change scope, category, community, or publish held posts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_update_guard ON public.posts;
CREATE TRIGGER trg_posts_update_guard BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_post_update();

-- ------------------------------------------------------------
-- 7. RPCs used by the app
-- ------------------------------------------------------------
-- Drop legacy signatures first (CREATE OR REPLACE cannot rename params)
DROP FUNCTION IF EXISTS public.add_karma(UUID, INT);
DROP FUNCTION IF EXISTS public.update_streak(UUID);
DROP FUNCTION IF EXISTS public.my_admin_grants(UUID);
DROP FUNCTION IF EXISTS public.log_audit(TEXT, TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS public.log_audit(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.log_audit(TEXT, TEXT);

-- Gamification (kept from V1)
CREATE OR REPLACE FUNCTION public.add_karma(p_user_id UUID, p_points INT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET karma_points = COALESCE(karma_points, 0) + p_points
  WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE last_active DATE;
BEGIN
  SELECT (last_streak_date::date) INTO last_active FROM public.profiles WHERE id = p_user_id;
  UPDATE public.profiles
  SET streak_days = CASE
        WHEN last_active = CURRENT_DATE THEN streak_days
        WHEN last_active = CURRENT_DATE - 1 THEN COALESCE(streak_days, 0) + 1
        ELSE 1 END,
      last_streak_date = now()
  WHERE id = p_user_id;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_streak_date TIMESTAMPTZ;

-- My admin grants (for UI)
CREATE OR REPLACE FUNCTION public.my_admin_grants(p_user_id UUID)
RETURNS TABLE (admin_type TEXT, community_id UUID, college_id UUID, campus_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.admin_type, g.community_id, g.college_id, g.campus_id
  FROM public.admin_grants g WHERE g.user_id = p_user_id;
$$;

-- Simple vote/audit helpers
CREATE OR REPLACE FUNCTION public.log_audit(p_action TEXT, p_entity_type TEXT, p_entity_id UUID, p_metadata JSONB DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
$$;
