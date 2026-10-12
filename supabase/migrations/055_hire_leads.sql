-- ============================================================
-- 055: Hire Leads — recruiter demo-batch requests (Phase 1)
--
-- The concierge MVP's front door. The public /hire page posts here; the
-- operator works the lead by hand and delivers the first (free) batch of 10
-- pre-screened students. Writes go through the API's service-role client, so
-- no public INSERT policy exists — only admins may read/update.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hire_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company       TEXT NOT NULL,
  contact_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  role_title    TEXT NOT NULL,
  positions     INT,                                   -- how many they want to hire
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'hire_page',
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'contacted', 'batch_sent', 'hired', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hire_leads_status ON public.hire_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hire_leads_email  ON public.hire_leads (email);

-- ── updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_hire_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hire_leads_updated ON public.hire_leads;
CREATE TRIGGER trg_hire_leads_updated BEFORE UPDATE ON public.hire_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_hire_leads_updated_at();

-- ── RLS: admins only (writes are service-role from the API) ─
ALTER TABLE public.hire_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hire_leads_select_admin ON public.hire_leads;
CREATE POLICY hire_leads_select_admin ON public.hire_leads
  FOR SELECT USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS hire_leads_update_admin ON public.hire_leads;
CREATE POLICY hire_leads_update_admin ON public.hire_leads
  FOR UPDATE USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS hire_leads_delete_admin ON public.hire_leads;
CREATE POLICY hire_leads_delete_admin ON public.hire_leads
  FOR DELETE USING (public.is_platform_admin(auth.uid()));
