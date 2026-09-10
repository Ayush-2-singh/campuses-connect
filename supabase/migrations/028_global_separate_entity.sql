-- ============================================================
-- CampusConnect — 028 GLOBAL AS A SEPARATE ENTITY
-- Global posts belong to no college and no campus. They are the
-- platform's own nationwide layer — not "a campus post shared
-- wider". This migration cleans any campus/college references
-- left on pure-global posts (community posts keep their
-- community_id; they never had campus/college either).
-- Idempotent. Safe to re-run.
-- ============================================================

UPDATE public.posts
SET campus_id  = NULL,
    college_id = NULL
WHERE scope = 'global'
  AND community_id IS NULL
  AND (campus_id IS NOT NULL OR college_id IS NOT NULL);
