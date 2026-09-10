-- ============================================================
-- 042: Admin Manual Verification System
--
-- Admins can manually verify users for anything:
-- - Campus change (no ID card needed)
-- - Identity verification
-- - Email verification
-- - Skill endorsements
-- - Custom verifications
--
-- This eliminates AI API costs — pure manual admin power.
-- ============================================================

-- ── User Verifications ────────────────────────────────────
-- Tracks all admin verifications for any user
CREATE TABLE IF NOT EXISTS public.user_verifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL CHECK (verification_type IN (
    'campus_change',     -- Admin manually changes campus
    'identity',          -- Admin verifies user identity
    'email',             -- Admin verifies email
    'skill',             -- Admin endorses a skill
    'role',              -- Admin assigns role (TA, Placement Head, etc.)
    'custom'             -- Any custom verification
  )),
  -- For campus_change: the new campus_id
  -- For role: the role name
  -- For skill: the skill name
  -- For custom: custom label
  metadata        JSONB NOT NULL DEFAULT '{}',
  -- Status tracking
  status          TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'revoked')),
  -- Who did it
  verified_by     UUID NOT NULL REFERENCES auth.users(id),
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  -- Optional notes
  admin_notes     TEXT,
  -- Link to original request if any
  request_id      UUID, -- references campus_change_requests.id or similar
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uv_user ON public.user_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_uv_type ON public.user_verifications (verification_type);
CREATE INDEX IF NOT EXISTS idx_uv_status ON public.user_verifications (status);

-- ── RLS Policies ───────────────────────────────────────────
ALTER TABLE public.user_verifications ENABLE ROW LEVEL SECURITY;

-- Users can see their own verifications
DROP POLICY IF EXISTS uv_select_own ON public.user_verifications;
CREATE POLICY uv_select_own ON public.user_verifications
  FOR SELECT USING (auth.uid() = user_id);

-- Platform admins can see all verifications
DROP POLICY IF EXISTS uv_select_admin ON public.user_verifications;
CREATE POLICY uv_select_admin ON public.user_verifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
  );

-- Platform admins can insert verifications
DROP POLICY IF EXISTS uv_insert_admin ON public.user_verifications;
CREATE POLICY uv_insert_admin ON public.user_verifications
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
  );

-- Platform admins can revoke verifications
DROP POLICY IF EXISTS uv_update_admin ON public.user_verifications;
CREATE POLICY uv_update_admin ON public.user_verifications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
  );

-- ── RPC: Get user's verification status ────────────────────
-- Returns active verifications for a user
CREATE OR REPLACE FUNCTION public.get_user_verifications(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  verification_type TEXT,
  metadata JSONB,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  admin_notes TEXT,
  verifier_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    uv.id,
    uv.verification_type,
    uv.metadata,
    uv.verified_by,
    uv.verified_at,
    uv.admin_notes,
    p.full_name as verifier_name
  FROM public.user_verifications uv
  LEFT JOIN public.profiles p ON p.id = uv.verified_by
  WHERE uv.user_id = p_user_id
    AND uv.status = 'approved'
  ORDER BY uv.verified_at DESC;
$fn$;

-- ── RPC: Admin manually change user's campus ───────────────
-- No ID card needed — admin is the authority
CREATE OR REPLACE FUNCTION public.admin_change_user_campus(
  p_user_id UUID,
  p_new_campus_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_old_campus_id UUID;
  v_request_id UUID;
BEGIN
  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = p_admin_id AND admin_type = 'platform_admin') THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required';
  END IF;

  -- Get current campus
  SELECT campus_id INTO v_old_campus_id FROM public.profiles WHERE id = p_user_id;
  IF v_old_campus_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Update campus
  UPDATE public.profiles SET campus_id = v_new_campus_id WHERE id = p_user_id;

  -- Create verification record
  INSERT INTO public.user_verifications (user_id, verification_type, metadata, verified_by, admin_notes)
  VALUES (
    p_user_id,
    'campus_change',
    jsonb_build_object(
      'from_campus_id', v_old_campus_id,
      'to_campus_id', p_new_campus_id,
      'method', 'admin_manual'
    ),
    p_admin_id,
    p_notes
  );

  -- If there's a pending campus change request, approve it
  UPDATE public.campus_change_requests
  SET status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
  WHERE user_id = p_user_id AND status = 'pending'
  RETURNING id INTO v_request_id;

  -- Log the action
  PERFORM public.log_admin_action(
    'admin_campus_change',
    'user',
    p_user_id,
    jsonb_build_object(
      'from_campus', v_old_campus_id,
      'to_campus', p_new_campus_id,
      'notes', p_notes,
      'request_id', v_request_id
    )
  );
END;
$fn$;

-- ── RPC: Admin verify user (general) ──────────────────────
-- Can verify identity, email, skills, roles, etc.
CREATE OR REPLACE FUNCTION public.admin_verify_user(
  p_user_id UUID,
  p_verification_type TEXT,
  p_metadata JSONB DEFAULT '{}',
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = p_admin_id AND admin_type = 'platform_admin') THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required';
  END IF;

  -- Create verification record
  INSERT INTO public.user_verifications (user_id, verification_type, metadata, verified_by, admin_notes)
  VALUES (p_user_id, p_verification_type, p_metadata, p_admin_id, p_notes);

  -- Log the action
  PERFORM public.log_admin_action(
    'admin_verify_' || p_verification_type,
    'user',
    p_user_id,
    jsonb_build_object(
      'type', p_verification_type,
      'metadata', p_metadata,
      'notes', p_notes
    )
  );
END;
$fn$;

-- ── RPC: Admin revoke verification ─────────────────────────
CREATE OR REPLACE FUNCTION public.admin_revoke_verification(
  p_verification_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_verification RECORD;
BEGIN
  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = p_admin_id AND admin_type = 'platform_admin') THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required';
  END IF;

  -- Get verification
  SELECT * INTO v_verification FROM public.user_verifications WHERE id = p_verification_id AND status = 'approved';
  IF v_verification IS NULL THEN
    RAISE EXCEPTION 'Verification not found or already revoked';
  END IF;

  -- Revoke
  UPDATE public.user_verifications
  SET status = 'revoked', revoked_at = now(), admin_notes = COALESCE(p_notes, admin_notes)
  WHERE id = p_verification_id;

  -- If campus change, revert
  IF v_verification.verification_type = 'campus_change' THEN
    UPDATE public.profiles
    SET campus_id = (v_verification.metadata->>'from_campus_id')::UUID
    WHERE id = v_verification.user_id;
  END IF;

  -- Log
  PERFORM public.log_admin_action(
    'admin_revoke_' || v_verification.verification_type,
    'user',
    v_verification.user_id,
    jsonb_build_object('verification_id', p_verification_id, 'notes', p_notes)
  );
END;
$fn$;

-- ── RPC: Search users for admin verification ───────────────
CREATE OR REPLACE FUNCTION public.admin_search_users_for_verification(
  p_search TEXT DEFAULT '',
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  username TEXT,
  email TEXT,
  avatar_url TEXT,
  campus_name TEXT,
  campus_id UUID,
  karma_points INT,
  is_verified BOOLEAN,
  verification_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    p.id as user_id,
    p.full_name,
    p.username,
    au.email,
    p.avatar_url,
    c.name as campus_name,
    p.campus_id,
    COALESCE(p.karma_points, 0) as karma_points,
    COALESCE(p.is_verified, false) as is_verified,
    (SELECT count(*) FROM public.user_verifications uv WHERE uv.user_id = p.id AND uv.status = 'approved') as verification_count
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.campuses c ON c.id = p.campus_id
  WHERE (
    p_search = ''
    OR p.full_name ILIKE '%' || p_search || '%'
    OR p.username ILIKE '%' || p_search || '%'
    OR au.email ILIKE '%' || p_search || '%'
  )
  ORDER BY p.full_name
  LIMIT p_limit;
$fn$;
