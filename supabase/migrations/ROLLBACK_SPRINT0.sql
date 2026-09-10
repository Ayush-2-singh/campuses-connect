-- ============================================================
-- CampusConnect — Sprint 0 rollback reference (manual, in reverse order)
-- Run 007 → 006 → 005 → 004 rollbacks only if a Sprint-0 fix must be reverted.
-- NOTE: reverting 007 restores the BROKEN trigger behavior (likes/connects
-- fail); it is listed for completeness, not as a desirable state.
-- ============================================================

-- ── Rollback 007 (notification triggers) ───────────────────
DROP TRIGGER IF EXISTS on_post_like        ON public.post_reactions;
DROP TRIGGER IF EXISTS on_post_comment     ON public.post_comments;
DROP TRIGGER IF EXISTS on_connection_request ON public.connections;
DROP FUNCTION IF EXISTS public.notify_on_like();
DROP FUNCTION IF EXISTS public.notify_on_comment();
DROP FUNCTION IF EXISTS public.notify_on_connection();

-- ── Rollback 006 (RPC hardening) ───────────────────────────
-- Restore the caller-supplied-id signatures (original V3 definitions).
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
DROP FUNCTION IF EXISTS public.add_karma(INT);
DROP FUNCTION IF EXISTS public.update_streak();
CREATE OR REPLACE FUNCTION public.my_admin_grants(p_user_id UUID)
RETURNS TABLE (admin_type TEXT, community_id UUID, college_id UUID, campus_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.admin_type, g.community_id, g.college_id, g.campus_id
  FROM public.admin_grants g WHERE g.user_id = p_user_id;
$$;
DROP FUNCTION IF EXISTS public.my_admin_grants();
-- Re-open anon EXECUTE (was PUBLIC before 006).
GRANT EXECUTE ON FUNCTION public.add_karma(INT), public.update_streak(), public.my_admin_grants(),
  public.can_create_post(UUID, TEXT, TEXT, UUID, UUID, UUID), public.can_create_post_by_category(UUID, UUID, TEXT, UUID, UUID, UUID),
  public.list_creatable_categories(UUID, UUID, UUID, UUID), public.has_mod_permission(UUID, TEXT, UUID),
  public.user_admin_type(UUID, UUID, UUID, UUID), public.can_view_post(public.posts), public.can_view_post_id(UUID),
  public.can_interact_post(public.posts), public.can_interact_post_id(UUID), public.log_audit(TEXT, TEXT, UUID, JSONB)
  TO PUBLIC;

-- ── Rollback 005 (legacy RLS) ──────────────────────────────
ALTER TABLE public.connections               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports                   DISABLE ROW LEVEL SECURITY;

-- ── Rollback 004 (relationship FKs) ────────────────────────
ALTER TABLE public.team_requests  DROP CONSTRAINT IF EXISTS team_requests_posted_by_profiles_fkey;
ALTER TABLE public.travel_buddies DROP CONSTRAINT IF EXISTS travel_buddies_posted_by_profiles_fkey;
ALTER TABLE public.lost_found     DROP CONSTRAINT IF EXISTS lost_found_posted_by_profiles_fkey;
ALTER TABLE public.admin_grants   DROP CONSTRAINT IF EXISTS admin_grants_user_id_profiles_fkey;
