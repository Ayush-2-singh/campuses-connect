-- ============================================================
-- Live Battle — OPEN HOSTING
--
-- Product decision: anyone who is signed in may run a competition.
-- The allow-list introduced with 20261117 is retired.
--
-- `is_live_quiz_host()` is kept as the single gate instead of deleting
-- the check from `live_quiz_create()`: tightening hosting again later
-- (verified teachers only, paid tier, campus admins) is then a one-row
-- change here rather than an edit to every RPC and policy.
--
-- Anonymous visitors still cannot host: p_user_id is NULL without a
-- session. Moderation is unchanged — platform admins keep their
-- read/manage rights through is_platform_admin().
--
-- Idempotent, like every other migration in this repo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_live_quiz_host(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Any authenticated account. No allow-list, no admin requirement.
  SELECT p_user_id IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.is_live_quiz_host(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_live_quiz_host(UUID) TO authenticated;

-- Creating a competition is now "authenticated + this is your own row".
-- The write itself still goes through live_quiz_create() (SECURITY DEFINER).
DROP POLICY IF EXISTS competitions_host_all ON public.competitions;
CREATE POLICY competitions_host_all ON public.competitions
  FOR ALL TO authenticated
  USING (host_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (host_id = auth.uid());

-- The allow-list is superseded; leaving it would imply a gate that no
-- longer exists. Dropping it also drops its two policies (CASCADE).
DROP TABLE IF EXISTS public.live_quiz_hosts CASCADE;
