-- ============================================================
-- CampusConnect — 027 LIVE ALL CAMPUSES
-- Noida / Bangalore / Pune (and any other) campuses were locked
-- with is_active = false ("Coming Soon") AND had no departments —
-- so students from those campuses got stuck on the empty
-- Department step in onboarding and could never join.
-- This makes every campus live and fully joinable:
--   1. Ensure the canonical PW IOI campuses exist (idempotent).
--   2. Unlock every campus under an active college.
--   3. Seed the standard departments for any campus that has none.
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ensure the canonical PW IOI campuses exist (by college+slug)
-- ------------------------------------------------------------
INSERT INTO public.campuses (college_id, name, slug, city, state, is_active)
SELECT c.id, v.name, v.slug, v.city, v.state, TRUE
FROM public.colleges c
CROSS JOIN (VALUES
  ('PW IOI Lucknow',   'lucknow',            'Lucknow',   'Uttar Pradesh'),
  ('PW IOI Noida',     'noida',              'Noida',     'Uttar Pradesh'),
  ('PW IOI Bangalore', 'pw-ioi-bangalore',   'Bangalore', 'Karnataka'),
  ('PW IOI Pune',      'pw-ioi-pune',        'Pune',      'Maharashtra'),
  ('PW IOI Delhi',     'delhi',              'Delhi',     NULL)
) AS v(name, slug, city, state)
WHERE c.slug = 'pw-ioi'
ON CONFLICT (college_id, slug) DO UPDATE
  SET is_active = TRUE, name = EXCLUDED.name;

-- ------------------------------------------------------------
-- 2. Unlock every campus under an active college
-- ------------------------------------------------------------
UPDATE public.campuses
SET is_active = TRUE
WHERE is_active = FALSE
  AND college_id IN (SELECT id FROM public.colleges WHERE is_active = TRUE);

-- ------------------------------------------------------------
-- 3. Seed departments for any campus that has none — otherwise
--    students there can never finish the Department step.
--    Mirrors the department set already live on Lucknow.
-- ------------------------------------------------------------
INSERT INTO public.departments (campus_id, name, short_name)
SELECT camp.id, v.name, v.short_name
FROM public.campuses camp
CROSS JOIN (VALUES
  ('Computer Science & Engineering',  'CSE'),
  ('Electronics & Communication',     'ECE'),
  ('Mechanical Engineering',          'ME'),
  ('Civil Engineering',               'CE'),
  ('Artificial Intelligence & ML',    'AIML'),
  ('Information Technology',          'IT'),
  ('Data Science',                    'DS'),
  ('Cyber Security',                  'CYSEC')
) AS v(name, short_name)
WHERE camp.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.departments d WHERE d.campus_id = camp.id
  );

-- ------------------------------------------------------------
-- Verify: every live campus now has departments
-- ------------------------------------------------------------
SELECT c.name AS campus, c.slug, c.is_active,
       COUNT(d.id) AS departments
FROM public.campuses c
LEFT JOIN public.departments d ON d.campus_id = c.id
WHERE c.college_id IN (SELECT id FROM public.colleges WHERE is_active = TRUE)
GROUP BY c.id
ORDER BY c.name;
