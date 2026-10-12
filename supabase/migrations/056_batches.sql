-- ============================================================
-- 056: Batches — recruiter shortlists (Phase 1 delivery)
--
-- A batch = the N pre-screened students the operator sends a recruiter.
-- Students are existing profiles (batch_students.user_id → auth.users).
-- The public shortlist is read through an API with the service-role client
-- (token-gated), so RLS here stays admin-only.
--
-- NOTE: policy predicates use public.is_platform_admin(auth.uid()) — the
-- zero-arg overload is ambiguous (see 20260926_backfill_missing_pillars.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES public.hire_leads(id) ON DELETE SET NULL,
  token       TEXT NOT NULL UNIQUE,
  title       TEXT,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'sent', 'interviewing', 'closed')),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batches_lead  ON public.batches (lead_id);
CREATE INDEX IF NOT EXISTS idx_batches_token ON public.batches (token);

CREATE TABLE IF NOT EXISTS public.batch_students (
  batch_id  UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (batch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_students_batch ON public.batch_students (batch_id, position);

-- ── updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_batches_updated ON public.batches;
CREATE TRIGGER trg_batches_updated BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.set_batches_updated_at();

-- ── RLS: admins only ───────────────────────────────────────
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batches_admin_all ON public.batches;
CREATE POLICY batches_admin_all ON public.batches
  FOR ALL USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS batch_students_admin_all ON public.batch_students;
CREATE POLICY batch_students_admin_all ON public.batch_students
  FOR ALL USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
