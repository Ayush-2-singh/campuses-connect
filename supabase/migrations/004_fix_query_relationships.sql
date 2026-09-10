-- ============================================================
-- CampusConnect P0-1 — Fix broken query relationships (migration 004)
-- Issue: pages embed `profiles(...)` on tables that have no FK to
-- public.profiles, so PostgREST returns HTTP 400 PGRST200 and the
-- pages render empty. Adding explicit FKs lets the embeds resolve.
-- Idempotent. Safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_requests_posted_by_profiles_fkey') THEN
    ALTER TABLE public.team_requests
      ADD CONSTRAINT team_requests_posted_by_profiles_fkey
      FOREIGN KEY (posted_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_buddies_posted_by_profiles_fkey') THEN
    ALTER TABLE public.travel_buddies
      ADD CONSTRAINT travel_buddies_posted_by_profiles_fkey
      FOREIGN KEY (posted_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lost_found_posted_by_profiles_fkey') THEN
    ALTER TABLE public.lost_found
      ADD CONSTRAINT lost_found_posted_by_profiles_fkey
      FOREIGN KEY (posted_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_grants_user_id_profiles_fkey') THEN
    ALTER TABLE public.admin_grants
      ADD CONSTRAINT admin_grants_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Verify: every embed used by the app now resolves to a single FK.
SELECT conrelid::regclass AS table_name, confrelid::regclass AS references_table
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid IN ('public.team_requests'::regclass, 'public.travel_buddies'::regclass,
                   'public.lost_found'::regclass, 'public.admin_grants'::regclass)
ORDER BY 1;
