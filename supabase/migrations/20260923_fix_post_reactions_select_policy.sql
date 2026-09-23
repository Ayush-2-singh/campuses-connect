-- ============================================================================
-- 20260923_fix_post_reactions_select_policy.sql
-- Fix "likes sometimes don't increase" — the count query returned only the
-- caller's own reactions.
-- ============================================================================
-- SYMPTOM
-- Like counts on feed cards did not grow when other students liked a post;
-- sometimes a like appeared to "not increase" at all.
--
-- ROOT CAUSE
-- The SELECT policy on post_reactions is:
--
--     reactions_select: (profile_id = auth.uid())
--
-- which hides every reaction that is not the caller's own. PostCard counts
-- likes with a head/count query through the same RLS, so the count can never
-- exceed 1 (and is 0 for a signed-out viewer): the data is there, the policy
-- just refuses to show it.
--
-- The insert/update side is already correct — (profile_id = auth.uid()) there
-- means "you may only create/change YOUR OWN reaction", which is the intended
-- rule. Only the read side is wrong.
--
-- FIX
-- Widen SELECT to "anyone who can view the parent post" using the existing
-- can_interact_post_id() helper — the same predicate reactions_insert already
-- uses. Authenticated users see real counts; anonymous visitors can read
-- counts on posts they can view. Writes stay owner-only: no one can forge or
-- alter someone else's like, and no one can enumerate hidden reactions beyond
-- counting them on a visible post (the same exposure the old policy already
-- allowed for your own rows and that every social app grants by design).
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY is safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS reactions_select ON public.post_reactions;

CREATE POLICY reactions_select ON public.post_reactions
  FOR SELECT TO authenticated, anon
  USING (public.can_interact_post_id(post_id));
