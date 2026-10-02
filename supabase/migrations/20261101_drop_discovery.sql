-- ============================================================
-- 20261101_drop_discovery.sql
--
-- Removes the Discovery feature from the database. The Discovery
-- section (/discover, swipe deck, idea boards) was removed from the
-- product; this migration drops its tables, functions, policies and
-- grants so the schema matches the app.
--
-- Notes:
--   * IF EXISTS everywhere — safe to run against any environment,
--     including ones where 20261024/25/27 never applied cleanly.
--   * discovery_interests is dropped before discovery_posts (FK).
--   * The notifications rows pointing at discovery no longer have a
--     surface; the app routes those types to /communities.
-- ============================================================

-- ── Functions ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.discovery_feed(TIMESTAMPTZ, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.record_discovery_action(UUID, TEXT);
DROP FUNCTION IF EXISTS public.record_discovery_action(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.accept_discovery_interest(UUID, UUID);

-- ── Tables (interests first: FK → discovery_posts) ──────────
DROP TABLE IF EXISTS public.discovery_interests CASCADE;
DROP TABLE IF EXISTS public.discovery_posts CASCADE;
