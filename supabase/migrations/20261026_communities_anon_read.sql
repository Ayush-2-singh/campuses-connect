-- 20261026_communities_anon_read.sql
--
-- PUBLIC COMMUNITY BROWSE (final UX spec, rule 1: no login wall for browsing).
--
-- `communities_select` was scoped to the `authenticated` role only, so a
-- logged-out visitor saw an empty Communities page even though the rows are
-- public content. This adds an anon-role SELECT policy (permissive policies
-- OR together) so communities are browsable without login.
--
-- Writes are untouched: communities_write still requires a moderator grant
-- for every command, and joining a community still requires an account
-- (join_community RPC / UI gate).
--
-- ADDITIVE ONLY. Idempotent. Safe to re-run.

DROP POLICY IF EXISTS communities_select_anon ON public.communities;
CREATE POLICY communities_select_anon ON public.communities
  FOR SELECT TO anon
  USING (true);
