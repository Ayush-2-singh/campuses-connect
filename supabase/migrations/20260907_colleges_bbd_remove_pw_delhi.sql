-- 1. Deactivate PW IOI Delhi campus (not a real PW campus)
UPDATE public.campuses
SET is_active = FALSE
WHERE slug = 'delhi' AND college_id = (SELECT id FROM public.colleges WHERE slug = 'pw-ioi');

-- 2. Add BBD college
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified)
SELECT 'BBD University', 'bbd-university', 'Lucknow', 'Uttar Pradesh', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.colleges WHERE slug = 'bbd-university');

-- 3. Add BBD campuses
INSERT INTO public.campuses (college_id, name, slug, city, is_active)
SELECT c.id, v.name, v.slug, v.city, TRUE
FROM (VALUES
  ('BBD Lucknow', 'bbd-lucknow', 'Lucknow'),
  ('BBD Noida', 'bbd-noida', 'Noida')
) AS v(name, slug, city)
JOIN public.colleges c ON c.slug = 'bbd-university'
WHERE NOT EXISTS (SELECT 1 FROM public.campuses WHERE slug = v.slug);

-- 4. Add departments for BBD Lucknow campus
INSERT INTO public.departments (campus_id, name, short_name)
SELECT camp.id, v.name, v.short_name
FROM (VALUES
  ('Computer Science & Engineering', 'CSE'),
  ('Information Technology', 'IT'),
  ('Artificial Intelligence & ML', 'AIML'),
  ('Electronics & Communication', 'ECE'),
  ('Mechanical Engineering', 'ME')
) AS v(name, short_name)
CROSS JOIN (SELECT id FROM public.campuses WHERE slug = 'bbd-lucknow') AS camp
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.campus_id = camp.id AND d.name = v.name
);

-- 5. Add departments for BBD Noida campus
INSERT INTO public.departments (campus_id, name, short_name)
SELECT camp.id, v.name, v.short_name
FROM (VALUES
  ('Computer Science & Engineering', 'CSE'),
  ('Information Technology', 'IT'),
  ('Data Science', 'DS')
) AS v(name, short_name)
CROSS JOIN (SELECT id FROM public.campuses WHERE slug = 'bbd-noida') AS camp
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.campus_id = camp.id AND d.name = v.name
);
