-- ─────────────────────────────────────────────────────────────────────────────
-- 022 — Unlock all PW IOI campuses for onboarding
-- Bangalore, Noida, Pune were created with is_active = false ("Coming Soon")
-- and thus locked out of the Campus selection step. Make every campus under
-- the PW IOI institution selectable so students from all campuses can join.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.campuses
SET is_active = TRUE
WHERE is_active = FALSE
  AND college_id IN (SELECT id FROM public.colleges WHERE is_active = TRUE);
