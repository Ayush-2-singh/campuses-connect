-- 20261021_score_model.sql
--
-- THE FOUR-METRIC SCORE MODEL
--
-- CampusConnect has exactly four progression/identity metrics. They are kept
-- conceptually and physically separate, and none is a substitute for another:
--
--   🏆 Karma   — "How much have I contributed?"       lifetime   (014, existing)
--   📈 XP      — "How much have I progressed?"        persistent (this file)
--   ✨ Aura    — "How hard am I competing TODAY?"     daily      (this file)
--   ⭐ Rating  — "How strong am I competitively?"     per season (20261020)
--
-- There is deliberately NO "reputation" and NO "combined score". The old
-- activity leaderboard (038) remains for exploration only; the competitive
-- ladder is defined separately in 20261022.
--
-- EXISTING STATE AND WHY THIS FILE EXISTS:
--   * Karma lives in `karma_ledger` + `profiles.karma_points` and is capped at
--     120/day (014). Unchanged here.
--   * `profiles.aura_points` was introduced in 014 as a "seasonal" score, but
--     it is only ever incremented — there is no season reset anywhere — so it
--     is really a lifetime accumulator. 048 narrowed its *source* to game wins
--     but not its *lifetime*. This migration fixes the CONCEPT: Aura becomes a
--     daily momentum score, with history preserved.
--   * `aura_points` is NOT dropped and NOT reinterpreted in place. It keeps its
--     historical value; the daily score is a new, separate pair of columns.
--
-- ADDITIVE ONLY: new columns, new tables, new functions. Nothing dropped,
-- nothing deleted, no existing value rewritten. `aura_points` continues to be
-- readable for anyone still using it.

-- ============================================================================
-- 1. Daily Aura — columns + history
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_today INT NOT NULL DEFAULT 0,
  -- The day `aura_today` belongs to. NULL/older-than-today means "0 today".
  ADD COLUMN IF NOT EXISTS aura_date  DATE;

-- Compact daily aggregation: one row per user per day. This is the historical
-- record — NOT an event log. Phase 12/31 require exactly this: keep daily
-- totals, never a row per animation or per UI event.
CREATE TABLE IF NOT EXISTS public.aura_history (
  user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  aura     INT  NOT NULL CHECK (aura >= 0),
  PRIMARY KEY (user_id, day)
);

-- "Top Aura today" board and the user's own history strip.
CREATE INDEX IF NOT EXISTS idx_aura_history_recent
  ON public.aura_history (day DESC, aura DESC);

-- ============================================================================
-- 2. XP — persistent progression, deduped by source
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp_points BIGINT NOT NULL DEFAULT 0;

-- Append-only ledger, same tamper-evidence shape as karma_ledger. The
-- UNIQUE(ref_type, ref_id) constraint is the anti-duplication guarantee: the
-- same completed challenge can never award XP twice, no matter how many times a
-- client retries.
CREATE TABLE IF NOT EXISTS public.xp_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  points     INT NOT NULL CHECK (points <> 0),
  ref_type   TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ref_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user
  ON public.xp_events (user_id, created_at DESC);

-- ============================================================================
-- 3. Daily-cap helper (shared by Aura and XP)
-- ============================================================================
-- One place that answers "how many points of X has this user earned today",
-- so both award functions apply the same rule and a future cap change is a
-- single edit.
CREATE OR REPLACE FUNCTION public.points_earned_today(p_user UUID, p_kind TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN p_kind = 'xp' THEN COALESCE((
      SELECT SUM(points) FROM public.xp_events
       WHERE user_id = p_user AND points > 0 AND created_at >= CURRENT_DATE
    ), 0)
    ELSE COALESCE((
      -- Aura's daily total is its whole definition.
      SELECT aura_today FROM public.profiles
       WHERE id = p_user AND aura_date = CURRENT_DATE
    ), 0)
  END;
$fn$;

-- ============================================================================
-- 3b. Aura dedup ledger
-- ============================================================================
-- Kept separate from aura_history so history is purely a daily aggregate and
-- never a log of sources. One row per (ref_type, ref_id) = one award per event.
CREATE TABLE IF NOT EXISTS public.aura_award_refs (
  ref_type   TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  points     INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ref_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_aura_award_refs_user
  ON public.aura_award_refs (user_id, created_at DESC);

-- ============================================================================
-- 4. award_aura — daily competitive momentum
-- ============================================================================
-- LAZY RESET (Phase 3): there is no midnight job. Before anything is added, if
-- the stored `aura_date` is not today, yesterday's total is flushed into
-- `aura_history` and today's counter starts at zero. Reading `aura_today` when
-- `aura_date <> CURRENT_DATE` therefore naturally yields 0.
--
-- Server-only: identity is the caller, or `p_target_user` on trusted internal
-- paths. Points come from a whitelist keyed by reason, never from the caller.
CREATE OR REPLACE FUNCTION public.award_aura(
  p_reason      TEXT,
  p_ref_type    TEXT,
  p_ref_id      TEXT,
  p_target_user UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user   UUID := COALESCE(p_target_user, auth.uid());
  v_points INT;
  v_stored_date DATE;
  v_today  INT;
  v_daily  INT;
  -- Hard ceiling on a single day's Aura. A grinder cannot out-earn this, and
  -- it is high enough that a normal competitive session is never clipped.
  c_daily_cap CONSTANT INT := 300;
BEGIN
  IF v_user IS NULL THEN RETURN FALSE; END IF;

  IF p_ref_type IS NULL OR p_ref_id IS NULL THEN
    RAISE EXCEPTION 'aura awards require a ref (prevents unlimited self-awards)';
  END IF;

  SELECT CASE p_reason
    WHEN 'ranked_win'        THEN 25   -- entering + winning a ranked battle
    WHEN 'ranked_loss'       THEN 5    -- participation still counts a little
    WHEN 'ranked_draw'       THEN 12
    WHEN 'upset_win'         THEN 15   -- bonus: beat a stronger opponent
    WHEN 'daily_challenge'   THEN 20
    WHEN 'boss_battle'       THEN 40
    WHEN 'contest_participation' THEN 15
    WHEN 'win_streak_bonus'  THEN 10
    WHEN '2v2_win'           THEN 20
    ELSE NULL
  END INTO v_points;

  IF v_points IS NULL THEN
    RAISE EXCEPTION 'unknown aura reason: %', p_reason;
  END IF;

  -- Idempotency: one award per source. Mirrors karma_ledger's rule.
  IF EXISTS (
    SELECT 1 FROM public.aura_award_refs
     WHERE ref_type = p_ref_type AND ref_id = p_ref_id
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT aura_date, aura_today INTO v_stored_date, v_today
    FROM public.profiles WHERE id = v_user FOR UPDATE;

  -- ── Lazy daily rollover ──────────────────────────────────────────────
  IF v_stored_date IS NOT NULL AND v_stored_date <> CURRENT_DATE THEN
    INSERT INTO public.aura_history (user_id, day, aura)
    VALUES (v_user, v_stored_date, GREATEST(v_today, 0))
    ON CONFLICT (user_id, day) DO UPDATE SET aura = EXCLUDED.aura;
    v_today := 0;
  ELSIF v_stored_date IS NULL THEN
    v_today := 0;
  END IF;

  v_daily := COALESCE(v_today, 0);
  IF v_daily + v_points > c_daily_cap THEN
    RETURN FALSE;  -- daily ceiling reached
  END IF;

  UPDATE public.profiles
     SET aura_today = v_daily + v_points,
         aura_date  = CURRENT_DATE
   WHERE id = v_user;

  INSERT INTO public.aura_award_refs (ref_type, ref_id, user_id, reason, points)
  VALUES (p_ref_type, p_ref_id, v_user, p_reason, v_points);

  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.award_aura(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_aura(TEXT, TEXT, TEXT, UUID) TO service_role;

-- ============================================================================
-- 5. award_xp — persistent learning progression
-- ============================================================================
CREATE OR REPLACE FUNCTION public.award_xp(
  p_reason      TEXT,
  p_ref_type    TEXT,
  p_ref_id      TEXT,
  p_target_user UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user   UUID := COALESCE(p_target_user, auth.uid());
  v_points INT;
  c_daily_cap CONSTANT INT := 500;
BEGIN
  IF v_user IS NULL THEN RETURN FALSE; END IF;
  IF p_ref_type IS NULL OR p_ref_id IS NULL THEN
    RAISE EXCEPTION 'xp awards require a ref';
  END IF;

  SELECT CASE p_reason
    WHEN 'problem_solved_easy'   THEN 10
    WHEN 'problem_solved_medium' THEN 20
    WHEN 'problem_solved_hard'   THEN 35
    WHEN 'challenge_completed'   THEN 15
    WHEN 'daily_challenge'       THEN 25
    WHEN 'boss_battle'           THEN 60
    WHEN 'contest_participated'  THEN 40
    WHEN 'library_resource_read' THEN 2
    WHEN 'community_milestone'   THEN 20
    ELSE NULL
  END INTO v_points;

  IF v_points IS NULL THEN
    RAISE EXCEPTION 'unknown xp reason: %', p_reason;
  END IF;

  -- Daily ceiling so XP cannot be farmed with trivial repeated actions.
  IF public.points_earned_today(v_user, 'xp') + v_points > c_daily_cap THEN
    RETURN FALSE;
  END IF;

  -- The UNIQUE constraint is the real guard; this turns a violation into FALSE.
  IF EXISTS (SELECT 1 FROM public.xp_events WHERE ref_type = p_ref_type AND ref_id = p_ref_id) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.xp_events (user_id, reason, points, ref_type, ref_id)
  VALUES (v_user, p_reason, v_points, p_ref_type, p_ref_id);

  UPDATE public.profiles
     SET xp_points = COALESCE(xp_points, 0) + v_points
   WHERE id = v_user;

  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.award_xp(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(TEXT, TEXT, TEXT, UUID) TO service_role;

-- ============================================================================
-- 6. Read helpers
-- ============================================================================
-- One call for the profile / Compete header. Rating is read from the current
-- season's ratings, so "⭐ DSA Rating" is always the live number.
CREATE OR REPLACE FUNCTION public.my_score_summary()
RETURNS TABLE (
  karma       INT,
  xp          BIGINT,
  aura_today  INT,
  aura_date   DATE,
  dsa_rating  NUMERIC,
  games       INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    COALESCE(p.karma_points, 0),
    COALESCE(p.xp_points, 0),
    -- Treat a stale day as zero WITHOUT writing anything (read is pure).
    CASE WHEN p.aura_date = CURRENT_DATE THEN COALESCE(p.aura_today, 0) ELSE 0 END,
    CURRENT_DATE,
    COALESCE((SELECT r.rating FROM public.competitive_ratings r
               WHERE r.user_id = auth.uid()
                 AND r.skill = 'dsa'
                 AND r.season_id = public.current_competitive_season()), 1200),
    COALESCE((SELECT r.games FROM public.competitive_ratings r
               WHERE r.user_id = auth.uid()
                 AND r.skill = 'dsa'
                 AND r.season_id = public.current_competitive_season()), 0)
  FROM public.profiles p
  WHERE p.id = auth.uid();
$fn$;

REVOKE ALL ON FUNCTION public.my_score_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_score_summary() TO authenticated;

-- Historical daily Aura for the profile strip.
CREATE OR REPLACE FUNCTION public.my_aura_history(p_days INT DEFAULT 14)
RETURNS TABLE (day DATE, aura INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT h.day, h.aura
    FROM public.aura_history h
   WHERE h.user_id = auth.uid()
   ORDER BY h.day DESC
   LIMIT LEAST(GREATEST(p_days, 1), 90);
$fn$;

REVOKE ALL ON FUNCTION public.my_aura_history(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_aura_history(INT) TO authenticated;

-- ============================================================================
-- 7. RLS
-- ============================================================================
ALTER TABLE public.aura_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_award_refs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_events          ENABLE ROW LEVEL SECURITY;

-- A user reads their own history; nobody reads anyone else's.
DROP POLICY IF EXISTS aura_history_select_own ON public.aura_history;
CREATE POLICY aura_history_select_own ON public.aura_history
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS xp_events_select_own ON public.xp_events;
CREATE POLICY xp_events_select_own ON public.xp_events
  FOR SELECT USING (user_id = auth.uid());

-- aura_award_refs: no policy at all. Only the SECURITY DEFINER functions and
-- the service role can reach it; it is an internal dedup ledger.

-- ============================================================================
-- 8. Verification
-- ============================================================================
-- A. Columns exist and are zeroed:
--    SELECT id, aura_today, aura_date, xp_points FROM public.profiles LIMIT 5;
--
-- B. Lazy reset behaves: set yesterday, read today:
--    UPDATE public.profiles SET aura_today = 340, aura_date = CURRENT_DATE - 1 WHERE id = auth.uid();
--    SELECT aura_today, aura_date FROM public.profiles WHERE id = auth.uid();
--    SELECT * FROM public.my_score_summary();   -- aura_today should read 0
--
-- C. History after an award (service role):
--    SELECT public.award_aura('ranked_win', 'match', 'test-match-1', '<uuid>');
--    SELECT * FROM public.aura_history WHERE user_id = '<uuid>' ORDER BY day DESC;
