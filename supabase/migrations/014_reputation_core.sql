-- ============================================================
-- CampusConnect — 014 REPUTATION CORE (fairness engine)
-- Karma (lifetime trust) + Aura (seasonal score) on ONE ledger.
-- Everything rewards-related must flow through award_karma() so
-- caps, uniqueness and self-award rules are enforced centrally.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Seasons — competitive windows. Aura = karma in current season.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seasons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- The single "current season" (only one can be active at a time)
CREATE UNIQUE INDEX IF NOT EXISTS one_active_season
  ON public.seasons ((is_active)) WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION public.get_current_season()
RETURNS public.seasons
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM public.seasons WHERE is_active = TRUE LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 2. Karma ledger — append-only, tamper-evident source of truth.
--    UNIQUE (ref_type, ref_id) prevents double-awarding the same
--    action (the core anti-farming defense).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.karma_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id   UUID REFERENCES public.seasons(id) ON DELETE SET NULL,
  reason      TEXT NOT NULL,              -- 'note_uploaded', 'answer_accepted', 'dsa_solved'...
  points      INT NOT NULL,               -- positive earn / negative penalty
  ref_type    TEXT,                       -- 'post', 'note', 'answer', 'dsa_submission', 'opportunity'
  ref_id      TEXT,                       -- opaque ref (uuid or slug)
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ref_type, ref_id)               -- ★ one award per action, ever
);

CREATE INDEX IF NOT EXISTS idx_karma_user      ON public.karma_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_karma_season    ON public.karma_ledger (season_id, user_id);
CREATE INDEX IF NOT EXISTS idx_karma_reason    ON public.karma_ledger (reason, created_at DESC);

-- ------------------------------------------------------------
-- 3. Profiles: Aura + streak freezes
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_points INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_freezes INT NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- 4. The single reward gateway. All karma flows through here.
--    Rules enforced server-side (cannot be bypassed by clients):
--      • reasons are whitelisted with per-reason points
--      • daily cap per reason (stops farming loops)
--      • hard daily total cap
--      • UNIQUE(ref_type, ref_id) stops double-award
--      • negative points require note (moderation penalties)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_karma(
  p_reason TEXT,
  p_ref_type TEXT,
  p_ref_id TEXT,
  p_target_user UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user       UUID;
  v_points     INT;
  v_season     UUID;
  v_daily      INT;
  v_today      DATE := CURRENT_DATE;
BEGIN
  -- Identity is ALWAYS the caller; target only usable by security-definer paths
  v_user := COALESCE(p_target_user, auth.uid());
  IF v_user IS NULL THEN RETURN FALSE; END IF;

  -- ── Whitelist with per-reason points (single place to tune economy) ──
  SELECT CASE p_reason
    WHEN 'note_uploaded'       THEN 10
    WHEN 'note_helpful'        THEN 3     -- capped daily, see below
    WHEN 'opportunity_posted'  THEN 8
    WHEN 'answer_submitted'    THEN 5
    WHEN 'answer_accepted'     THEN 15
    WHEN 'question_asked'      THEN 2
    WHEN 'event_hosted'        THEN 20
    WHEN 'event_attended'      THEN 5
    WHEN 'community_created'   THEN 10
    WHEN 'dsa_solved_easy'     THEN 5
    WHEN 'dsa_solved_medium'   THEN 10
    WHEN 'dsa_solved_hard'     THEN 20
    WHEN 'contest_top10'       THEN 25
    WHEN 'contest_participated' THEN 5
    WHEN 'mentor_session'      THEN 15
    WHEN 'review_written'      THEN 3
    WHEN 'review_helpful'      THEN 2
    WHEN 'spam_penalty'        THEN -25
    WHEN 'abuse_penalty'       THEN -50
    WHEN 'bad_faith_penalty'   THEN -100
    ELSE NULL
  END INTO v_points;

  IF v_points IS NULL THEN
    RAISE EXCEPTION 'unknown karma reason: %', p_reason;
  END IF;

  -- Negative awards (moderation) must carry a note and be gated
  IF v_points < 0 THEN
    IF p_note IS NULL OR length(p_note) < 3 THEN
      RAISE EXCEPTION 'negative karma requires a note';
    END IF;
  END IF;

  -- Ref is required for earn events (prevents unlimited self-awards)
  IF v_points > 0 AND (p_ref_type IS NULL OR p_ref_id IS NULL) THEN
    RAISE EXCEPTION 'earn events require a ref';
  END IF;

  -- ── Anti-farming: daily caps ──
  SELECT COALESCE(SUM(points), 0)
    INTO v_daily
    FROM public.karma_ledger
   WHERE user_id = v_user AND created_at >= v_today;

  IF v_points > 0 AND v_daily + v_points > 120 THEN
    RETURN FALSE;                          -- hard daily total cap (120)
  END IF;

  -- Per-reason cap: "note_helpful" and "review_helpful" are high-volume
  IF v_points > 0 AND p_reason IN ('note_helpful', 'review_helpful') THEN
    SELECT COALESCE(SUM(points), 0)
      INTO v_daily
      FROM public.karma_ledger
     WHERE user_id = v_user AND reason = p_reason AND created_at >= v_today;
    IF v_daily + v_points > 30 THEN RETURN FALSE;  -- 30/day per source
    END IF;
  END IF;

  -- Uniqueness is enforced by the UNIQUE(ref_type, ref_id) constraint;
  -- catch it here for a clean FALSE instead of an exception.
  IF v_points > 0 AND EXISTS (
    SELECT 1 FROM public.karma_ledger
     WHERE ref_type = p_ref_type AND ref_id = p_ref_id
  ) THEN
    RETURN FALSE;
  END IF;

  v_season := (SELECT id FROM public.seasons WHERE is_active = TRUE LIMIT 1);

  INSERT INTO public.karma_ledger
    (user_id, season_id, reason, points, ref_type, ref_id, note)
  VALUES
    (v_user, v_season, p_reason, v_points, p_ref_type, p_ref_id, p_note);

  -- Materialized totals (ledger remains the source of truth)
  UPDATE public.profiles
     SET karma_points = COALESCE(karma_points, 0) + v_points,
         aura_points  = COALESCE(aura_points, 0) + CASE WHEN v_season IS NOT NULL THEN v_points ELSE 0 END
   WHERE id = v_user;

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.award_karma(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.award_karma(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- Safe read: my karma breakdown (no schema exposure)
CREATE OR REPLACE FUNCTION public.my_karma_summary()
RETURNS TABLE (lifetime INT, aura INT, daily_earned INT, season_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COALESCE(SUM(points),0) FROM public.karma_ledger WHERE user_id = auth.uid()),
    (SELECT COALESCE(aura_points,0) FROM public.profiles WHERE id = auth.uid()),
    (SELECT COALESCE(SUM(points),0) FROM public.karma_ledger
      WHERE user_id = auth.uid() AND points > 0 AND created_at >= CURRENT_DATE),
    (SELECT name FROM public.seasons WHERE is_active = TRUE LIMIT 1);
$$;

REVOKE EXECUTE ON FUNCTION public.my_karma_summary() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.my_karma_summary() TO authenticated;

-- ------------------------------------------------------------
-- 5. Streak rework — only MEANINGFUL actions advance the streak.
--    Login/viewing never counts. Freezes: a missed day uses one
--    freeze before the streak breaks.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_meaningful_action()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last DATE;
  v_streak INT;
  v_freezes INT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT last_streak_date::date, COALESCE(streak_days,0), COALESCE(streak_freezes,0)
    INTO v_last, v_streak, v_freezes
    FROM public.profiles WHERE id = auth.uid();

  -- Already did a meaningful action today
  IF v_last = CURRENT_DATE THEN RETURN; END IF;

  -- Consecutive yesterday → advance
  IF v_last = CURRENT_DATE - 1 THEN
    UPDATE public.profiles
       SET streak_days = v_streak + 1, last_streak_date = now()
     WHERE id = auth.uid();
    RETURN;
  END IF;

  -- Missed ≥1 day but have a freeze → consume one, keep the streak
  IF v_last IS NOT NULL AND v_last < CURRENT_DATE - 1 AND v_freezes > 0 THEN
    UPDATE public.profiles
       SET streak_freezes = v_freezes - 1,
           last_streak_date = now()
     WHERE id = auth.uid();
    RETURN;
  END IF;

  -- Fresh start (or streak broke)
  UPDATE public.profiles
     SET streak_days = 1, last_streak_date = now()
   WHERE id = auth.uid();
END $$;

REVOKE EXECUTE ON FUNCTION public.record_meaningful_action() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_meaningful_action() TO authenticated;

-- Weekly grant: 2 freezes/week for active students (simple, capped)
CREATE OR REPLACE FUNCTION public.grant_streak_freezes()
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles
     SET streak_freezes = LEAST(2, COALESCE(streak_freezes, 0) + 2)
   WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.grant_streak_freezes() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grant_streak_freezes() TO authenticated;

-- ------------------------------------------------------------
-- 6. Seed Season 1 (3 months, starting now)
-- ------------------------------------------------------------
INSERT INTO public.seasons (name, starts_at, ends_at, is_active)
SELECT 'Season 1', now(), now() + interval '3 months', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.seasons);
