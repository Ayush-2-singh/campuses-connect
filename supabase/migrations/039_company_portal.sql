-- ============================================================
-- 039: Company / Recruiter Portal
--
-- Companies, job postings, applications tracker, and interview
-- experiences — the campus placement pipeline.
-- ============================================================

-- ── Companies ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  website         TEXT,
  description     TEXT,
  industry        TEXT,              -- 'tech', 'finance', 'consulting', 'startup', etc.
  hq_location     TEXT,
  company_size    TEXT,              -- '1-10', '11-50', '51-200', '201-500', '500+'
  founded_year    INT,
  tech_stack      TEXT[],            -- array of technologies
  glassdoor_rating NUMERIC(3,2),
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies (slug);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON public.companies (industry);

CREATE OR REPLACE FUNCTION public.set_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated ON public.companies;
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_companies_updated_at();

-- ── Company Followers (watchlist) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.company_followers (
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

-- ── Job Postings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_postings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  job_type        TEXT NOT NULL DEFAULT 'internship' CHECK (job_type IN ('internship', 'full_time', 'part_time', 'contract', 'freelance')),
  location        TEXT,
  location_type   TEXT CHECK (location_type IN ('remote', 'hybrid', 'onsite')),
  stipend         TEXT,              -- e.g. "₹50,000/month" or "$20/hr"
  salary_range    TEXT,              -- e.g. "₹8-15 LPA"
  skills_required TEXT[],
  apply_link      TEXT,
  deadline        TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  posted_by       UUID REFERENCES auth.users(id),
  view_count      INT NOT NULL DEFAULT 0,
  apply_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_company ON public.job_postings (company_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_type ON public.job_postings (job_type);
CREATE INDEX IF NOT EXISTS idx_job_postings_active ON public.job_postings (is_active, created_at DESC);

DROP TRIGGER IF EXISTS trg_job_postings_updated ON public.job_postings;
CREATE TRIGGER trg_job_postings_updated BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.set_companies_updated_at();

-- ── Applications Tracker ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_posting_id  UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'shortlisted', 'interview', 'offer', 'rejected', 'withdrawn')),
  resume_url      TEXT,
  cover_note      TEXT,
  notes           TEXT,              -- private notes from student
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_posting_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON public.applications (user_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_job ON public.applications (job_posting_id);

DROP TRIGGER IF EXISTS trg_applications_updated ON public.applications;
CREATE TRIGGER trg_applications_updated BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_companies_updated_at();

-- ── Interview Experiences ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_experiences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  experience      TEXT NOT NULL,     -- the full experience text
  role            TEXT,              -- 'SDE Intern', 'ML Engineer', etc.
  round_count     INT,
  result          TEXT CHECK (result IN ('selected', 'rejected', 'pending', 'withdrawn')),
  difficulty      TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  rating          INT CHECK (rating >= 1 AND rating <= 5),
  tips            TEXT,              -- preparation tips
  offer_salary    TEXT,
  upvotes         INT NOT NULL DEFAULT 0,
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_exp_company ON public.interview_experiences (company_id);
CREATE INDEX IF NOT EXISTS idx_interview_exp_user ON public.interview_experiences (user_id);

-- ── Interview Experience Votes ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_votes (
  experience_id UUID NOT NULL REFERENCES public.interview_experiences(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote          INT NOT NULL CHECK (vote IN (-1, 1)),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experience_id, user_id)
);

-- ── RLS Policies ───────────────────────────────────────────

-- companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS companies_insert ON public.companies;
CREATE POLICY companies_insert ON public.companies FOR INSERT WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS companies_update ON public.companies;
CREATE POLICY companies_update ON public.companies FOR UPDATE USING (public.is_platform_admin() OR created_by = auth.uid());

-- company_followers
ALTER TABLE public.company_followers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_followers_select ON public.company_followers;
CREATE POLICY company_followers_select ON public.company_followers FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS company_followers_insert ON public.company_followers;
CREATE POLICY company_followers_insert ON public.company_followers FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS company_followers_delete ON public.company_followers;
CREATE POLICY company_followers_delete ON public.company_followers FOR DELETE USING (auth.uid() = user_id);

-- job_postings
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_postings_select ON public.job_postings;
CREATE POLICY job_postings_select ON public.job_postings FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS job_postings_insert ON public.job_postings;
CREATE POLICY job_postings_insert ON public.job_postings FOR INSERT WITH CHECK (public.is_platform_admin() OR posted_by = auth.uid());
DROP POLICY IF EXISTS job_postings_update ON public.job_postings;
CREATE POLICY job_postings_update ON public.job_postings FOR UPDATE USING (public.is_platform_admin() OR posted_by = auth.uid());

-- applications
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS applications_select_own ON public.applications;
CREATE POLICY applications_select_own ON public.applications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS applications_select_admin ON public.applications;
CREATE POLICY applications_select_admin ON public.applications FOR SELECT USING (public.is_platform_admin());
DROP POLICY IF EXISTS applications_insert ON public.applications;
CREATE POLICY applications_insert ON public.applications FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS applications_update ON public.applications;
CREATE POLICY applications_update ON public.applications FOR UPDATE USING (auth.uid() = user_id OR public.is_platform_admin());

-- interview_experiences
ALTER TABLE public.interview_experiences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interview_exp_select ON public.interview_experiences;
CREATE POLICY interview_exp_select ON public.interview_experiences FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS interview_exp_insert ON public.interview_experiences;
CREATE POLICY interview_exp_insert ON public.interview_experiences FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS interview_exp_update ON public.interview_experiences;
CREATE POLICY interview_exp_update ON public.interview_experiences FOR UPDATE USING (auth.uid() = user_id);

-- interview_votes
ALTER TABLE public.interview_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interview_votes_select ON public.interview_votes;
CREATE POLICY interview_votes_select ON public.interview_votes FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS interview_votes_insert ON public.interview_votes;
CREATE POLICY interview_votes_insert ON public.interview_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS interview_votes_update ON public.interview_votes;
CREATE POLICY interview_votes_update ON public.interview_votes FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS interview_votes_delete ON public.interview_votes;
CREATE POLICY interview_votes_delete ON public.interview_votes FOR DELETE USING (auth.uid() = user_id);

-- ── Seed: Popular companies ────────────────────────────────
INSERT INTO public.companies (name, slug, industry, company_size, description, is_verified, created_by) VALUES
  ('Google', 'google', 'tech', '500+', 'Multinational technology company', true, NULL),
  ('Microsoft', 'microsoft', 'tech', '500+', 'Multinational technology corporation', true, NULL),
  ('Amazon', 'amazon', 'tech', '500+', 'Multinational technology and e-commerce company', true, NULL),
  ('Apple', 'apple', 'tech', '500+', 'Multinational technology company', true, NULL),
  ('Meta', 'meta', 'tech', '500+', 'Social technology company', true, NULL),
  ('Flipkart', 'flipkart', 'tech', '500+', 'Indian e-commerce company', true, NULL),
  ('Razorpay', 'razorpay', 'tech', '201-500', 'Indian fintech company', true, NULL),
  ('Swiggy', 'swiggy', 'tech', '500+', 'Indian food delivery company', true, NULL),
  ('Zerodha', 'zerodha', 'finance', '51-200', 'Indian stockbroking company', true, NULL),
  ('Goldman Sachs', 'goldman-sachs', 'finance', '500+', 'Global investment banking firm', true, NULL)
ON CONFLICT (slug) DO NOTHING;
