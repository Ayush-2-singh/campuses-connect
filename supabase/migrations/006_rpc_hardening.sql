-- ============================================================
-- CampusConnect P0-3 — SECURITY DEFINER RPC hardening (migration 006)
-- Never trust caller-supplied user ids. Identity is always auth.uid().
-- * user_admin_type / has_mod_permission / can_create_post*  -> reject foreign ids
-- * add_karma / update_streak / my_admin_grants              -> derive auth.uid()
-- * revoke anon EXECUTE on the whole authz surface
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Single choke point: the actor resolver rejects foreign ids.
--    Every other check funnels through this, so one guard covers all.
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
  -- Identity guard: results are only ever meaningful for the caller.
  IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN
    RETURN 'student';
  END IF;

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

-- Defense in depth on the moderation check (called directly by the app).
CREATE OR REPLACE FUNCTION public.has_mod_permission(
  p_user_id UUID,
  p_key TEXT,
  p_campus_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
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

-- Direct RPC probe guard on the create checks.
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
  IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_scope NOT IN ('campus', 'college_network', 'global') THEN RETURN FALSE; END IF;

  v_actor := public.user_admin_type(p_user_id, p_campus_id, p_college_id, p_community_id);

  IF v_actor = 'community_admin' AND p_community_id IS NULL THEN RETURN FALSE; END IF;
  IF p_community_id IS NOT NULL AND p_scope <> 'global' THEN RETURN FALSE; END IF;
  IF v_actor = 'campus_admin' AND p_campus_id IS NULL AND p_college_id IS NULL THEN RETURN FALSE; END IF;

  SELECT cp.max_scope INTO v_max
  FROM public.content_permissions cp
  JOIN public.content_categories cc ON cc.id = cp.category_id
  WHERE cp.actor_type = v_actor AND cc.key = p_category_key;

  RETURN v_max IS NOT NULL AND public.scope_level(v_max) >= public.scope_level(p_scope);
END;
$$;

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
  IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT cc.key INTO v_key FROM public.content_categories cc WHERE cc.id = p_category_id;
  IF v_key IS NULL THEN RETURN FALSE; END IF;
  RETURN public.can_create_post(p_user_id, v_key, p_scope, p_community_id, p_campus_id, p_college_id);
END;
$$;

-- Composer helper: only ever resolves the CALLER's matrix.
CREATE OR REPLACE FUNCTION public.list_creatable_categories(
  p_user_id UUID,
  p_community_id UUID DEFAULT NULL,
  p_campus_id UUID DEFAULT NULL,
  p_college_id UUID DEFAULT NULL
) RETURNS TABLE (category_key TEXT, label TEXT, max_scope TEXT, category_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT cc.key, cc.label, cp.max_scope, cc.id
    FROM public.content_categories cc
    JOIN public.content_permissions cp ON cp.category_id = cc.id
    WHERE cp.actor_type = public.user_admin_type(auth.uid(), p_campus_id, p_college_id, p_community_id)
      AND cp.max_scope IS NOT NULL
    ORDER BY cc.sort_order;
END;
$$;

-- ------------------------------------------------------------
-- 2. Gamification + grants: derive identity, never accept it.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_karma(UUID, INT);
CREATE OR REPLACE FUNCTION public.add_karma(p_points INT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET karma_points = COALESCE(karma_points, 0) + p_points
  WHERE id = auth.uid();
$$;

DROP FUNCTION IF EXISTS public.update_streak(UUID);
CREATE OR REPLACE FUNCTION public.update_streak()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE last_active DATE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT (last_streak_date::date) INTO last_active FROM public.profiles WHERE id = auth.uid();
  UPDATE public.profiles
  SET streak_days = CASE
        WHEN last_active = CURRENT_DATE THEN streak_days
        WHEN last_active = CURRENT_DATE - 1 THEN COALESCE(streak_days, 0) + 1
        ELSE 1 END,
      last_streak_date = now()
  WHERE id = auth.uid();
END;
$$;

DROP FUNCTION IF EXISTS public.my_admin_grants(UUID);
CREATE OR REPLACE FUNCTION public.my_admin_grants()
RETURNS TABLE (admin_type TEXT, community_id UUID, college_id UUID, campus_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.admin_type, g.community_id, g.college_id, g.campus_id
  FROM public.admin_grants g WHERE g.user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 3. Revoke anon EXECUTE on the entire authorization surface.
--    (REVOKE FROM PUBLIC, then GRANT back to authenticated only, so
--    the RLS policy calls — which run as 'authenticated' — keep working
--    while the 'anon' role loses all access.)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.user_admin_type(UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_mod_permission(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_create_post(UUID, TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_create_post_by_category(UUID, UUID, TEXT, UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_creatable_categories(UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_karma(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_streak() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_admin_grants() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_post(public.posts) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_post_id(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_interact_post(public.posts) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_interact_post_id(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit(TEXT, TEXT, UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_admin_type(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_mod_permission(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_post(UUID, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_post_by_category(UUID, UUID, TEXT, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_creatable_categories(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_karma(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_streak() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_admin_grants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_post(public.posts) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_post_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_interact_post(public.posts) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_interact_post_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- Verify: privilege escalation attempts must now fail.
--   SELECT has_function_privilege('anon', 'public.add_karma(integer)', 'EXECUTE')
--   -> false   (and true for 'authenticated')
-- ------------------------------------------------------------
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('add_karma','update_streak','my_admin_grants','can_create_post')
ORDER BY 1;
