-- ============================================================
-- 043: Premium Users System + Rate Limiting
--
-- Features visible to all but usable only by premium users.
-- Premium = paid membership (or manually granted by admin).
-- Also adds rate limiting to prevent abuse.
-- ============================================================

-- ── Add premium column to feature_flags ────────────────────
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark expensive features as premium
UPDATE public.feature_flags SET is_premium = TRUE WHERE key IN ('brain', 'notes');

-- ── Premium Users Table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_premium (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  is_premium      BOOLEAN NOT NULL DEFAULT TRUE,
  premium_type    TEXT NOT NULL DEFAULT 'pro' CHECK (premium_type IN ('pro', 'enterprise', 'trial', 'admin_granted')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ, -- NULL = never expires
  granted_by      UUID REFERENCES auth.users(id), -- admin who granted
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_up_user ON public.user_premium (user_id);
CREATE INDEX IF NOT EXISTS idx_up_expires ON public.user_premium (expires_at);

-- ── Updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_user_premium_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_up_updated ON public.user_premium;
CREATE TRIGGER trg_up_updated BEFORE UPDATE ON public.user_premium
  FOR EACH ROW EXECUTE FUNCTION public.set_user_premium_updated_at();

-- ── RLS Policies ───────────────────────────────────────────
ALTER TABLE public.user_premium ENABLE ROW LEVEL SECURITY;

-- Users can see their own premium status
DROP POLICY IF EXISTS up_select_own ON public.user_premium;
CREATE POLICY up_select_own ON public.user_premium
  FOR SELECT USING (auth.uid() = user_id);

-- Platform admins can see and manage all
DROP POLICY IF EXISTS up_select_admin ON public.user_premium;
CREATE POLICY up_select_admin ON public.user_premium
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
  );

DROP POLICY IF EXISTS up_insert_admin ON public.user_premium;
CREATE POLICY up_insert_admin ON public.user_premium
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
  );

DROP POLICY IF EXISTS up_update_admin ON public.user_premium;
CREATE POLICY up_update_admin ON public.user_premium
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
  );

DROP POLICY IF EXISTS up_delete_admin ON public.user_premium;
CREATE POLICY up_delete_admin ON public.user_premium
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
  );

-- ── RPC: Check if user is premium ──────────────────────────
CREATE OR REPLACE FUNCTION public.is_user_premium(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_premium
    WHERE user_id = p_user_id
      AND is_premium = TRUE
      AND (expires_at IS NULL OR expires_at > now())
  );
$fn$;

-- ── RPC: Check if feature requires premium ─────────────────
CREATE OR REPLACE FUNCTION public.is_feature_premium(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (SELECT is_premium FROM public.feature_flags WHERE key = p_key),
    FALSE
  );
$fn$;

-- ── RPC: Check if user can use a feature ───────────────────
-- Returns: can_use (bool), reason (text), is_premium_required (bool)
CREATE OR REPLACE FUNCTION public.can_use_feature(p_user_id UUID, p_feature_key TEXT)
RETURNS TABLE (can_use BOOLEAN, reason TEXT, is_premium_required BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    CASE
      WHEN NOT public.is_feature_enabled(p_feature_key) THEN FALSE
      WHEN NOT public.is_feature_premium(p_feature_key) THEN TRUE
      WHEN public.is_user_premium(p_user_id) THEN TRUE
      ELSE FALSE
    END,
    CASE
      WHEN NOT public.is_feature_enabled(p_feature_key) THEN 'Feature is currently disabled'
      WHEN NOT public.is_feature_premium(p_feature_key) THEN ''
      WHEN public.is_user_premium(p_user_id) THEN ''
      ELSE 'This feature requires CampusConnect Pro'
    END,
    public.is_feature_premium(p_feature_key);
$fn$;

-- ── Rate Limiting Table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL, -- e.g. 'brain:ask', 'brain:upload', 'api:github'
  request_count   INT NOT NULL DEFAULT 1,
  window_start    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rl_user_endpoint ON public.rate_limits (user_id, endpoint, window_start);

-- ── RPC: Check rate limit ──────────────────────────────────
-- Returns TRUE if request is allowed, FALSE if rate limited
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_limit INT DEFAULT 10,
  p_window_minutes INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_count INT;
  v_window_start TIMESTAMPTZ;
  v_is_premium BOOLEAN;
BEGIN
  -- Premium users get 5x higher limits
  v_is_premium := public.is_user_premium(p_user_id);
  IF v_is_premium THEN p_limit := p_limit * 5; END IF;

  v_window_start := date_trunc('hour', now()) + (EXTRACT(minute FROM now())::INT / p_window_minutes) * (p_window_minutes || ' minutes')::INTERVAL;

  SELECT request_count INTO v_count
  FROM public.rate_limits
  WHERE user_id = p_user_id AND endpoint = p_endpoint AND window_start = v_window_start;

  IF v_count IS NULL THEN
    INSERT INTO public.rate_limits (user_id, endpoint, request_count, window_start)
    VALUES (p_user_id, p_endpoint, 1, v_window_start)
    ON CONFLICT (user_id, endpoint, window_start) DO UPDATE SET request_count = rate_limits.request_count + 1;
    RETURN TRUE;
  ELSIF v_count < p_limit THEN
    UPDATE public.rate_limits SET request_count = request_count + 1
    WHERE user_id = p_user_id AND endpoint = p_endpoint AND window_start = v_window_start;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$fn$;

-- ── Cleanup old rate limit records (run via cron) ──────────
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '2 hours';
$fn$;

-- ── Premium feature flags ──────────────────────────────────
-- Mark which features are premium
UPDATE public.feature_flags SET is_premium = TRUE WHERE key IN ('brain');
UPDATE public.feature_flags SET is_premium = FALSE WHERE key IN ('feed', 'global_feed', 'events', 'polls', 'communities', 'teams', 'meetings', 'notes', 'ask', 'compete', 'talent', 'lost_found', 'travel', 'connections', 'saved', 'leaderboard', 'weekly_wrap', 'notifications', 'onboarding', 'profile');
