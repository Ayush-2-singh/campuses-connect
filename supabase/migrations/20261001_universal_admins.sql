-- ============================================================
-- Migration: Make all admins global (platform_admin)
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_admin_type(
  p_user_id UUID,
  p_campus_id UUID DEFAULT NULL,
  p_college_id UUID DEFAULT NULL,
  p_community_id UUID DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN
    RETURN 'student';
  END IF;

  -- Any grant makes you a platform_admin globally
  IF EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = p_user_id) THEN
    RETURN 'platform_admin';
  END IF;

  RETURN 'student';
END;
$$;

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

  -- Any grant makes you pass the permission check
  IF EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = p_user_id) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;
