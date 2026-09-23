-- 20261020_compete_ratings.sql
--
-- COMPETE PILLAR (Phases 5, 8, 9, 10, 12) — the competitive foundation.
--
-- The existing Compete surface (015_dsa_compete.sql) has problems, submissions,
-- contests and a daily challenge, and 014/019 add a karma/aura/streak layer.
-- What it does NOT have is a *competitive* layer: no rating, no head-to-head
-- match, no season record, no skill progression. `RankingsTab` sorts by karma,
-- which measures activity, not skill — so a student who posts a lot outranks a
-- stronger competitor. That is the gap this migration closes.
--
-- Three separate numbers, kept separate on purpose (Phase 8):
--   * karma / aura        — activity        (existing, untouched)
--   * competitive_ratings — competitive skill (this file)
--   * contribution        — usefulness       (notes/answers; not here)
-- XP must never inflate the ladder, so nothing here reads karma.
--
-- REUSE, NOT DUPLICATE: seasons already exist in 014_reputation_core.sql
-- (`public.seasons` + `one_active_season` + `get_current_season()`). This file
-- references that table rather than inventing a second season concept. A season
-- is seeded only if the table is completely empty, so an operator's real season
-- is never clobbered.
--
-- ADDITIVE ONLY: new tables, new indexes, new policies. No existing table,
-- column, policy or row is modified or removed. The Compete page keeps working
-- exactly as it does today until the new surfaces are switched on.
--
-- WRITE PATH: every rating is settled server-side (the maths lives in
-- src/lib/rating.ts and runs in a route handler with the service role). These
-- tables therefore get SELECT policies only — there is no INSERT/UPDATE/DELETE
-- policy for `authenticated` anywhere below, so a client cannot award itself a
-- rating, a win or a season rank.

-- ============================================================================
-- 0. Season availability (reuse public.seasons — do not create a second one)
-- ============================================================================
-- Seed a first season only when none exists at all. `one_active_season` (014)
-- would reject a second active row, so this must never fire when one is live.
INSERT INTO public.seasons (name, starts_at, ends_at, is_active)
SELECT 'Season 1', now(), now() + INTERVAL '90 days', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.seasons);

-- Typed UUID accessor for the current season. `get_current_season()` already
-- returns the whole row; several callers only need the id, so this avoids
-- re-selecting the whole struct on every match write.
CREATE OR REPLACE FUNCTION public.current_competitive_season()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT id FROM public.seasons WHERE is_active LIMIT 1;
$fn$;

-- ============================================================================
-- 1. Per-skill ratings (Phase 8)
-- ============================================================================
-- One row per (user, skill, season). Keeping season in the key is what makes
-- "peak rating" and "season history" possible without deleting anything when a
-- season ends — the old rows simply stop being the current season.
CREATE TABLE IF NOT EXISTS public.competitive_ratings (
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill        TEXT NOT NULL CHECK (skill IN ('dsa', 'web', 'ai_ml', 'problem_solving')),
  season_id    UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  rating       NUMERIC(8,1) NOT NULL DEFAULT 1200 CHECK (rating >= 100),
  peak_rating  NUMERIC(8,1) NOT NULL DEFAULT 1200 CHECK (peak_rating >= 100),
  games        INT NOT NULL DEFAULT 0 CHECK (games >= 0),
  wins         INT NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses       INT NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws        INT NOT NULL DEFAULT 0 CHECK (draws >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill, season_id)
);

-- Leaderboard read: highest rating first within a season+skill.
CREATE INDEX IF NOT EXISTS idx_competitive_ratings_ladder
  ON public.competitive_ratings (season_id, skill, rating DESC);

-- "My rank across every skill" on the profile.
CREATE INDEX IF NOT EXISTS idx_competitive_ratings_user
  ON public.competitive_ratings (user_id, rating DESC);

-- ============================================================================
-- 2. Matches (Phases 5, 6, 12)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.competitive_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- solo | 1v1 | 2v2 | team | daily_boss | contest   (5v5 needs no schema change)
  mode          TEXT NOT NULL CHECK (mode IN ('solo', '1v1', '2v2', 'team', 'daily_boss', 'contest')),
  skill         TEXT NOT NULL CHECK (skill IN ('dsa', 'web', 'ai_ml', 'problem_solving')),
  status        TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished', 'abandoned')),
  season_id     UUID REFERENCES public.seasons(id) ON DELETE SET NULL,
  -- Ordered problem ids make up the round list (MCQ → debug → complexity → code).
  problem_ids   UUID[] NOT NULL DEFAULT '{}',
  -- NULL = draw / no winner yet. Matches team numbers for team modes.
  winning_team  INT,
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  -- Round transcript / boss phases / shared metadata. Small and bounded.
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitive_matches_recent
  ON public.competitive_matches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitive_matches_live
  ON public.competitive_matches (status, created_at DESC)
  WHERE status IN ('lobby', 'active');
-- Powers "live battles" on the Compete home.
CREATE INDEX IF NOT EXISTS idx_competitive_matches_season_mode
  ON public.competitive_matches (season_id, mode, created_at DESC);

CREATE TABLE IF NOT EXISTS public.competitive_match_participants (
  match_id      UUID NOT NULL REFERENCES public.competitive_matches(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Team number: 0 for solo/1v1 sides, 1/2 for 2v2 and team modes.
  team          INT NOT NULL DEFAULT 0,
  score         NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- Denormalised copies of the settled numbers so a match can always be
  -- explained after the fact, even once ratings move on.
  rating_before NUMERIC(8,1),
  rating_after  NUMERIC(8,1),
  rating_delta  NUMERIC(8,1),
  result        TEXT CHECK (result IN ('win', 'loss', 'draw')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_competitive_participants_user
  ON public.competitive_match_participants (user_id, joined_at DESC);

-- Anti-farming lookup: "how often have these two met this season?"
CREATE INDEX IF NOT EXISTS idx_competitive_participants_match_user
  ON public.competitive_match_participants (user_id, match_id);

-- ============================================================================
-- 3. Skill progression (Phase 10)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.skill_topics (
  skill         TEXT NOT NULL CHECK (skill IN ('dsa', 'web', 'ai_ml', 'problem_solving')),
  topic         TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (skill, topic)
);

INSERT INTO public.skill_topics (skill, topic, display_order) VALUES
  ('dsa', 'Arrays', 1), ('dsa', 'Strings', 2), ('dsa', 'Hashing', 3),
  ('dsa', 'Linked Lists', 4), ('dsa', 'Stacks', 5), ('dsa', 'Queues', 6),
  ('dsa', 'Trees', 7), ('dsa', 'Graphs', 8), ('dsa', 'DP', 9),
  ('web', 'HTML', 1), ('web', 'CSS', 2), ('web', 'JavaScript', 3),
  ('web', 'DOM', 4), ('web', 'React', 5), ('web', 'Next.js', 6),
  ('web', 'APIs', 7), ('web', 'Debugging', 8), ('web', 'Performance', 9),
  ('web', 'Accessibility', 10)
ON CONFLICT (skill, topic) DO NOTHING;

-- Aggregated counters, NOT an event log. Phase 31 of the cost audit is explicit
-- that a row per "user viewed challenge" is waste; mastery only needs totals.
CREATE TABLE IF NOT EXISTS public.skill_progress (
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill            TEXT NOT NULL,
  topic            TEXT NOT NULL,
  attempts         INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  correct          INT NOT NULL DEFAULT 0 CHECK (correct >= 0),
  -- Last 5 results for the "recent form" strip — bounded, so no unbounded array.
  recent_results   BOOLEAN[] NOT NULL DEFAULT '{}',
  last_attempted_at TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill, topic),
  FOREIGN KEY (skill, topic) REFERENCES public.skill_topics (skill, topic) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_progress_user
  ON public.skill_progress (user_id, skill);

-- ============================================================================
-- 4. RLS — public ladders, private writes
-- ============================================================================
ALTER TABLE public.competitive_ratings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_matches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_topics                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_progress                ENABLE ROW LEVEL SECURITY;

-- Reference data: world-readable.
DROP POLICY IF EXISTS skill_topics_select ON public.skill_topics;
CREATE POLICY skill_topics_select ON public.skill_topics
  FOR SELECT USING (TRUE);

-- Ratings: the ladder is public — that is the point of a leaderboard.
DROP POLICY IF EXISTS competitive_ratings_select ON public.competitive_ratings;
CREATE POLICY competitive_ratings_select ON public.competitive_ratings
  FOR SELECT USING (TRUE);

-- Matches: public, so "live battles" and match history are visible.
DROP POLICY IF EXISTS competitive_matches_select ON public.competitive_matches;
CREATE POLICY competitive_matches_select ON public.competitive_matches
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS competitive_participants_select ON public.competitive_match_participants;
CREATE POLICY competitive_participants_select ON public.competitive_match_participants
  FOR SELECT USING (TRUE);

-- Skill progress: a student's own weaknesses are theirs alone.
DROP POLICY IF EXISTS skill_progress_select_own ON public.skill_progress;
CREATE POLICY skill_progress_select_own ON public.skill_progress
  FOR SELECT USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated: every write goes through
-- the service role in a route handler, which validates the caller's identity.

-- ============================================================================
-- 5. updated_at maintenance
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_competitive_ratings_touch ON public.competitive_ratings;
CREATE TRIGGER trg_competitive_ratings_touch
  BEFORE UPDATE ON public.competitive_ratings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_skill_progress_touch ON public.skill_progress;
CREATE TRIGGER trg_skill_progress_touch
  BEFORE UPDATE ON public.skill_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 6. Verification
-- ============================================================================
-- A. A season exists and is active:
--    SELECT id, name, is_active, ends_at FROM public.seasons;
--    SELECT public.current_competitive_season();
--
-- B. Ratings ladder for the current season:
--    SELECT p.username, r.skill, r.rating, r.peak_rating, r.games
--      FROM public.competitive_ratings r
--      JOIN public.profiles p ON p.id = r.user_id
--     WHERE r.season_id = public.current_competitive_season()
--     ORDER BY r.rating DESC LIMIT 25;
--
-- C. Skill topics seeded:
--    SELECT skill, count(*) FROM public.skill_topics GROUP BY skill;
