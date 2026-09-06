-- Fix polls RLS — auth.role() is deprecated in newer Supabase.
-- Use auth.uid() IS NOT NULL instead for authenticated checks.

DROP POLICY IF EXISTS polls_select ON public.polls;
CREATE POLICY polls_select ON public.polls
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS poll_votes_select ON public.poll_votes;
CREATE POLICY poll_votes_select ON public.poll_votes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Also grant anon read access for unauthenticated users to see polls
GRANT SELECT ON public.polls TO anon;
GRANT SELECT ON public.poll_votes TO anon;
