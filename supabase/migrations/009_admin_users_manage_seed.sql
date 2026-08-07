-- ============================================================
-- CampusConnect — grant `users.manage` to platform admins
-- The admin panel manages admin_grants, and the grants_write /
-- grants_select RLS policies require
--   has_mod_permission(auth.uid(), 'users.manage')
-- which is never seeded anywhere. Without it, admin-panel user
-- management silently fails.
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Idempotent — safe to re-run.
-- ============================================================

INSERT INTO public.moderation_permissions (user_id, permission_key, scope, granted_by)
SELECT g.user_id, 'users.manage', 'global', g.user_id
FROM public.admin_grants g
WHERE g.admin_type = 'platform_admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.moderation_permissions mp
    WHERE mp.user_id = g.user_id
      AND mp.permission_key = 'users.manage'
      AND mp.scope = 'global'
  );
