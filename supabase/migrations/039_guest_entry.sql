-- ============================================================
-- ConnectToCampus — 039 GUEST ENTRY
-- Frictionless entry: user types their name, picks a campus,
-- enters the app. Google OAuth stays fully intact; this only
-- adds a Supabase anonymous-sign-in path so guests get a REAL
-- session (RLS, profiles, karma, compete all work normally).
--
-- In the Supabase Dashboard also enable:
--   Authentication → Sign In / Providers → Anonymous sign-ins → ON
--   (reversible one-toggle; leave Google provider untouched)
--
-- Revert: flip the dashboard toggle off. Nothing here weakens RLS
-- or touches any existing table data.
-- ============================================================

-- ── 1. Usernames become optional ──
-- Anonymous users get an auto-generated placeholder (g-a1b2c3) that
-- onboarding replaces with a real unique username before they post.
ALTER TABLE public.profiles ALTER COLUMN username DROP NOT NULL;

-- ── 2. Profile auto-creation covers anonymous users ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Guest'),
    CASE
      WHEN NEW.is_anonymous THEN
        -- unique placeholder; onboarding will replace it
        'g-' || lower(substr(replace(NEW.id::text, '-', ''), 1, 6))
      ELSE NEW.raw_user_meta_data->>'full_name'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
