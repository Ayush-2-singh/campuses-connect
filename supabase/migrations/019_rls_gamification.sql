-- ============================================================
-- CampusConnect — 019 RLS FOR GAMIFICATION
-- Hardening: RLS on every new table + hidden test cases are NEVER
-- readable by clients. The judge fetches them through a
-- secret-gated SECURITY DEFINER RPC (secret = sha256 of the
-- server-only ADMIN_PASSWORD, same pattern as /api/admin/verify).
-- ============================================================

-- ── 1. Enable RLS everywhere ──
ALTER TABLE public.karma_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsa_problems        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsa_submissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_challenges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_gallery       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members   ENABLE ROW LEVEL SECURITY;

-- ── 2. Column-level protection: hidden test cases stay server-side ──
REVOKE SELECT (test_cases) ON public.dsa_problems FROM authenticated;
REVOKE SELECT (test_cases) ON public.dsa_problems FROM anon;

-- ── 3. Policies ──
-- karma_ledger: read your own only; writes flow through award_karma()
DROP POLICY IF EXISTS karma_ledger_select_own ON public.karma_ledger;
CREATE POLICY karma_ledger_select_own ON public.karma_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- seasons: readable by all authenticated
DROP POLICY IF EXISTS seasons_select ON public.seasons;
CREATE POLICY seasons_select ON public.seasons
  FOR SELECT TO authenticated USING (TRUE);

-- dsa_problems: readable (minus test_cases) by all authenticated
DROP POLICY IF EXISTS dsa_problems_select ON public.dsa_problems;
CREATE POLICY dsa_problems_select ON public.dsa_problems
  FOR SELECT TO authenticated USING (is_active = TRUE);

-- dsa_submissions: own rows only, own inserts
DROP POLICY IF EXISTS dsa_submissions_select_own ON public.dsa_submissions;
CREATE POLICY dsa_submissions_select_own ON public.dsa_submissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS dsa_submissions_insert_own ON public.dsa_submissions;
CREATE POLICY dsa_submissions_insert_own ON public.dsa_submissions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- contests: readable
DROP POLICY IF EXISTS contests_select ON public.contests;
CREATE POLICY contests_select ON public.contests
  FOR SELECT TO authenticated USING (TRUE);

-- contest_registrations: own
DROP POLICY IF EXISTS contest_reg_select_own ON public.contest_registrations;
CREATE POLICY contest_reg_select_own ON public.contest_registrations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS contest_reg_insert_own ON public.contest_registrations;
CREATE POLICY contest_reg_insert_own ON public.contest_registrations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- daily_challenges: readable
DROP POLICY IF EXISTS daily_challenges_select ON public.daily_challenges;
CREATE POLICY daily_challenges_select ON public.daily_challenges
  FOR SELECT TO authenticated USING (TRUE);

-- campus_events: published visible to all; creators manage their own
DROP POLICY IF EXISTS campus_events_select ON public.campus_events;
CREATE POLICY campus_events_select ON public.campus_events
  FOR SELECT TO authenticated USING (status = 'published' OR created_by = auth.uid());
DROP POLICY IF EXISTS campus_events_insert ON public.campus_events;
CREATE POLICY campus_events_insert ON public.campus_events
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS campus_events_update_own ON public.campus_events;
CREATE POLICY campus_events_update_own ON public.campus_events
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

-- event_attendees: own
DROP POLICY IF EXISTS attendees_select_own ON public.event_attendees;
CREATE POLICY attendees_select_own ON public.event_attendees
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS attendees_insert_own ON public.event_attendees;
CREATE POLICY attendees_insert_own ON public.event_attendees
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS attendees_delete_own ON public.event_attendees;
CREATE POLICY attendees_delete_own ON public.event_attendees
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- event_gallery: visible to all authenticated, uploads own
DROP POLICY IF EXISTS gallery_select ON public.event_gallery;
CREATE POLICY gallery_select ON public.event_gallery
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS gallery_insert_own ON public.event_gallery;
CREATE POLICY gallery_insert_own ON public.event_gallery
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- reviews: readable; writes via submit_review() RPC only
DROP POLICY IF EXISTS reviews_select ON public.reviews;
CREATE POLICY reviews_select ON public.reviews
  FOR SELECT TO authenticated USING (TRUE);

-- communities: readable (privacy enforced via join RPC)
DROP POLICY IF EXISTS communities_select ON public.communities;
CREATE POLICY communities_select ON public.communities
  FOR SELECT TO authenticated USING (TRUE);
-- memberships: own view; own joins (open communities) via direct insert;
-- approval/private flows go through join_community() RPC
DROP POLICY IF EXISTS members_select_own ON public.community_members;
CREATE POLICY members_select_own ON public.community_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS members_insert_own ON public.community_members;
CREATE POLICY members_insert_own ON public.community_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS members_delete_own ON public.community_members;
CREATE POLICY members_delete_own ON public.community_members
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── 4. Judge access note ──
-- Hidden test_cases are read ONLY by the Next.js server using the
-- SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). The client can never
-- SELECT test_cases because the column is revoked from authenticated.
--   * add SUPABASE_SERVICE_ROLE_KEY to .env.local and Vercel env
--   * keep NEXT_PUBLIC_SUPABASE_ANON_KEY public as-is
