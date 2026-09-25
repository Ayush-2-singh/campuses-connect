-- 20260924_archive_legacy_communities.sql
--
-- COMMUNITY AUDIT — enforce the approved global community set.
--
-- AUDIT RESULT (2026-09-24, production project tnlbqirrrjrkxkxlkpat):
--   The `communities` table contains exactly 8 rows, all part of the approved
--   product architecture:
--     * core:   dsa, web-development, startups   (002_v3_seeds.sql)
--     * chat:   ai-ml, academics, career, compete, general (20261017_live_chat.sql)
--   The legacy surfaces the audit brief named — "Lost & Found" and "Travel
--   Buddies" — were NEVER rows in `communities`. They lived as standalone
--   campus features (`lost_found`, `travel_buddies` tables) and are being
--   retired in the application layer in the same change that ships this file.
--
-- So this migration is a GUARD, not a purge:
--   1. It re-asserts the 8 approved rows (idempotent upsert on `key` — fixes
--      name drift, never creates a 9th community).
--   2. It deactivates (archives) any OTHER row that may have been inserted
--      manually or by a stray tool: `is_active = false`, `chat_enabled =
--      false`. Nothing is deleted — historical references in posts, members,
--      notifications or moderation records stay intact, and an admin can
--      re-activate a row by flipping the flags back.
--
-- Rule 4 of the audit brief: "prefer an archival/deactivation strategy rather
-- than destructive deletion" — this file implements exactly that.

-- ============================================================================
-- 1. The approved active set (upsert; ON CONFLICT keeps admin edits of
--    tagline/description but re-asserts the canonical name + active flags).
-- ============================================================================
INSERT INTO public.communities (key, name, tagline, description, icon, is_global, is_active, chat_enabled) VALUES
  ('dsa',             'DSA',             'Data Structures & Algorithms', 'Solve, discuss and level up your DSA together.',              '🧩', TRUE, TRUE, TRUE),
  ('web-development', 'Web Development', 'Frontend, backend & full-stack', 'Build the web — share stacks, roadmaps and projects.',       '🌐', TRUE, TRUE, TRUE),
  ('startups',        'Startups',        'Founders, builders & interns',  'Ideas, collabs, internships and founder stories.',            '🚀', TRUE, TRUE, TRUE),
  ('ai-ml',           'AI / ML',         'Models, maths & datasets',      'LLMs, computer vision, classical ML and everything between.', '🤖', TRUE, TRUE, TRUE),
  ('academics',       'Academics',       'Semester, exams & syllabus',    'Subject doubts, PYQs, curriculum talk across every college.', '📚', TRUE, TRUE, TRUE),
  ('career',          'Career',          'Internships & placements',      'Resumes, interviews, referrals and offer discussions.',       '💼', TRUE, TRUE, TRUE),
  ('compete',         'Compete',         'Battles & contest talk',        'Matchmaking, contest strategy, post-battle analysis.',        '⚔️', TRUE, TRUE, TRUE),
  ('general',         'General',         'Anything campus',               'The lobby — introduce yourself and talk about anything.',     '💬', TRUE, TRUE, TRUE)
ON CONFLICT (key) DO UPDATE
  SET name         = EXCLUDED.name,
      is_global    = TRUE,
      is_active    = TRUE,
      chat_enabled = TRUE;

-- ============================================================================
-- 2. Archive everything that is NOT the approved set (defensive; today this
--    matches zero rows in production).
-- ============================================================================
UPDATE public.communities
SET is_active = FALSE,
    chat_enabled = FALSE
WHERE key NOT IN (
  'dsa', 'web-development', 'startups',
  'ai-ml', 'academics', 'career', 'compete', 'general'
);

-- ============================================================================
-- 3. Make the active set explicit and queryable (used by the app + tests).
-- ============================================================================
CREATE OR REPLACE VIEW public.active_communities AS
SELECT id, key, name, tagline, description, icon, is_global, chat_enabled
FROM public.communities
WHERE is_active AND (chat_enabled OR NOT is_global);

COMMENT ON VIEW public.active_communities IS
  'Canonical source for user-facing community lists: only active rows. Global chat rooms additionally require chat_enabled.';

-- ============================================================================
-- 4. Verification queries (run manually after applying):
--    SELECT key, name FROM public.communities WHERE is_active ORDER BY name;
--    SELECT count(*) FROM public.communities WHERE NOT is_active;  -- archived set
-- ============================================================================
