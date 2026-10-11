-- PRIVILEGE GUARD — closes a self-verification hole in profiles updates.
--
-- `profiles_update` lets every user edit their own row, and the previous
-- guard (003_v3_authz.sql) only protected `status`. Nothing stopped a user
-- running this from the browser console:
--
--   supabase.from('profiles').update({ is_verified: true }).eq('id', me)
--
-- which granted a fake verified badge (and fake college-email verification)
-- with zero server involvement. From now on the verification columns move
-- only when:
--
--   • a moderator with `users.manage` flips them (admin review flows), or
--   • trusted SERVER code does — the service role runs with auth.uid()
--     IS NULL (/api/verify-college-email was moved to the service-role
--     client for exactly this reason).
--
-- Column reads go through to_jsonb so a column that does not exist on a
-- given environment's baseline cannot break every profiles update.

CREATE OR REPLACE FUNCTION public.guard_profile_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT public.has_mod_permission(auth.uid(), 'users.manage') THEN
    RAISE EXCEPTION 'Only moderators can change account status';
  END IF;

  IF ((v_old -> 'is_verified') IS DISTINCT FROM (v_new -> 'is_verified')
      OR (v_old -> 'college_email_verified') IS DISTINCT FROM (v_new -> 'college_email_verified'))
     AND auth.uid() IS NOT NULL
     AND NOT public.has_mod_permission(auth.uid(), 'users.manage') THEN
    RAISE EXCEPTION 'Only moderators can change verification status';
  END IF;

  RETURN NEW;
END;
$$;

-- The BEFORE UPDATE trigger from 003_v3_authz.sql stays attached; replacing
-- the function body is all that is needed.
