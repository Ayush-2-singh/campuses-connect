-- ============================================================
-- 041: Campus Change with ID Verification
--
-- Students can request to change their campus by uploading
-- their college ID card. Admin reviews and approves/rejects.
-- ============================================================

-- ── Campus Change Requests ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campus_change_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_campus_id     UUID NOT NULL REFERENCES public.campuses(id),
  requested_campus_id   UUID NOT NULL REFERENCES public.campuses(id),
  id_card_url           TEXT NOT NULL,                     -- Supabase Storage URL
  id_card_filename      TEXT,                              -- original filename
  roll_number           TEXT,                              -- optional roll number
  college_email         TEXT,                              -- optional college email
  reason                TEXT,                              -- optional reason for change
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason      TEXT,                              -- admin's rejection reason
  ai_verification_score NUMERIC DEFAULT 0,                 -- 0-100 auto verification score
  ai_verification_notes TEXT,                              -- what AI found/missed
  reviewed_by           UUID REFERENCES auth.users(id),    -- admin who reviewed
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccr_user ON public.campus_change_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status ON public.campus_change_requests (status);

-- ── Updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_ccr_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ccr_updated ON public.campus_change_requests;
CREATE TRIGGER trg_ccr_updated BEFORE UPDATE ON public.campus_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_ccr_updated_at();

-- ── RLS Policies ───────────────────────────────────────────
ALTER TABLE public.campus_change_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
DROP POLICY IF EXISTS ccr_select_own ON public.campus_change_requests;
CREATE POLICY ccr_select_own ON public.campus_change_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Platform admins can see all requests
DROP POLICY IF EXISTS ccr_select_admin ON public.campus_change_requests;
CREATE POLICY ccr_select_admin ON public.campus_change_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.admin_grants
      WHERE user_id = auth.uid() AND admin_type = 'platform_admin'
    )
  );

-- Users can insert their own requests (with cooldown check via function)
DROP POLICY IF EXISTS ccr_insert_own ON public.campus_change_requests;
CREATE POLICY ccr_insert_own ON public.campus_change_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can cancel their pending requests
DROP POLICY IF EXISTS ccr_update_own ON public.campus_change_requests;
CREATE POLICY ccr_update_own ON public.campus_change_requests
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

-- Platform admins can update any request (approve/reject)
DROP POLICY IF EXISTS ccr_update_admin ON public.campus_change_requests;
CREATE POLICY ccr_update_admin ON public.campus_change_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.admin_grants
      WHERE user_id = auth.uid() AND admin_type = 'platform_admin'
    )
  );

-- ── RPC: Check if user can request campus change ───────────
-- Returns: can_request (bool), reason (text), cooldown_days_left (int)
CREATE OR REPLACE FUNCTION public.can_request_campus_change(p_user_id UUID)
RETURNS TABLE (can_request BOOLEAN, reason TEXT, cooldown_days_left INT, changes_this_year INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_last_change TIMESTAMPTZ;
  v_pending_count INT;
  v_changes_year INT;
  v_campus_id UUID;
BEGIN
  -- Get user's campus
  SELECT campus_id INTO v_campus_id FROM public.profiles WHERE id = p_user_id;
  IF v_campus_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Profile not found', 0, 0;
    RETURN;
  END IF;

  -- Check for pending request
  SELECT count(*) INTO v_pending_count
  FROM public.campus_change_requests
  WHERE user_id = p_user_id AND status = 'pending';

  IF v_pending_count > 0 THEN
    RETURN QUERY SELECT FALSE, 'You already have a pending campus change request', 0, 0;
    RETURN;
  END IF;

  -- Check cooldown (30 days since last approved change)
  SELECT reviewed_at INTO v_last_change
  FROM public.campus_change_requests
  WHERE user_id = p_user_id AND status = 'approved'
  ORDER BY reviewed_at DESC LIMIT 1;

  IF v_last_change IS NOT NULL AND (now() - v_last_change) < INTERVAL '30 days' THEN
    v_changes_year := EXTRACT(DAY FROM (now() - v_last_change));
    RETURN QUERY SELECT FALSE,
      'Please wait ' || (30 - v_changes_year) || ' more days before requesting another campus change',
      (30 - v_changes_year)::INT,
      0;
    RETURN;
  END IF;

  -- Count changes this year
  SELECT count(*) INTO v_changes_year
  FROM public.campus_change_requests
  WHERE user_id = p_user_id
    AND status = 'approved'
    AND reviewed_at >= date_trunc('year', now());

  IF v_changes_year >= 3 THEN
    RETURN QUERY SELECT FALSE, 'Maximum 3 campus changes allowed per year', 0, v_changes_year;
    RETURN;
  END IF;

  -- All good
  RETURN QUERY SELECT TRUE, 'You can request a campus change', 0, v_changes_year;
END;
$fn$;

-- ── RPC: Approve campus change request ─────────────────────
-- Updates the user's profile campus_id and marks request as approved
CREATE OR REPLACE FUNCTION public.approve_campus_change(
  p_request_id UUID,
  p_admin_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_request RECORD;
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_grants
    WHERE user_id = p_admin_id AND admin_type = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required';
  END IF;

  -- Get request
  SELECT * INTO v_request
  FROM public.campus_change_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;

  -- Update user's campus
  UPDATE public.profiles
  SET campus_id = v_request.requested_campus_id
  WHERE id = v_request.user_id;

  -- Mark request as approved
  UPDATE public.campus_change_requests
  SET status = 'approved',
      reviewed_by = p_admin_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  -- Log the action
  PERFORM public.log_admin_action(
    'campus_change_approved',
    'campus_change_request',
    p_request_id,
    jsonb_build_object(
      'user_id', v_request.user_id,
      'from_campus', v_request.current_campus_id,
      'to_campus', v_request.requested_campus_id
    )
  );
END;
$fn$;

-- ── RPC: Reject campus change request ──────────────────────
CREATE OR REPLACE FUNCTION public.reject_campus_change(
  p_request_id UUID,
  p_admin_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_request RECORD;
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_grants
    WHERE user_id = p_admin_id AND admin_type = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required';
  END IF;

  -- Get request
  SELECT * INTO v_request
  FROM public.campus_change_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;

  -- Mark request as rejected
  UPDATE public.campus_change_requests
  SET status = 'rejected',
      rejection_reason = p_reason,
      reviewed_by = p_admin_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  -- Log the action
  PERFORM public.log_admin_action(
    'campus_change_rejected',
    'campus_change_request',
    p_request_id,
    jsonb_build_object(
      'user_id', v_request.user_id,
      'reason', p_reason
    )
  );
END;
$fn$;

-- ── Storage bucket for ID cards ────────────────────────────
-- Run in Supabase Dashboard: Storage → New bucket → "id-cards"
-- Settings: Public = false, File size limit = 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
