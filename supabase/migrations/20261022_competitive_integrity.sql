-- 20261022_competitive_integrity.sql
--
-- COMPETITIVE LEADERBOARD + LIVE-MATCH SECURITY + SETTLEMENT
--
-- Three related fixes to the competitive layer introduced in 20261020:
--
--   1. `get_competitive_leaderboard` — the ladder a competitor actually cares
--      about, sorted by *rating*, with a games qualification gate. This is NOT
--      the old activity board (038), which stays as-is for exploration but must
--      not be used for official competitive ranking.
--
--   2. Live-match security. 20261020 gave `competitive_matches` a
--      `SELECT USING (TRUE)` policy, which exposes `problem_ids` and `metadata`
--      of a match that is *currently being played* — i.e. the answers. This
--      replaces that policy with participants-or-finished, and adds a
--      deliberately narrow public view for "live battles" that carries no
--      problem data.
--
--   3. `settle_competitive_match` — one atomic, idempotent call that records
--      the result, moves every rating, writes Aura and XP, and refuses to run
--      twice. The rating maths stays in TypeScript (src/lib/rating.ts); this
--      function persists the *already-computed* deltas, which only the server
--      route is allowed to supply.
--
-- ADDITIVE where possible; the only removal is the over-broad matches SELECT
-- policy, which is replaced by a strictly narrower one. No data is touched.

-- ============================================================================
-- 1. Competitive leaderboard (by rating)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_competitive_leaderboard(
  p_skill          TEXT DEFAULT 'dsa',
  p_season_id      UUID DEFAULT NULL,
  p_limit          INT  DEFAULT 50,
  p_min_games      INT  DEFAULT 5          -- placement gate (rating.ts PLACEMENT_GAMES)
)
RETURNS TABLE (
  rank        BIGINT,
  user_id     UUID,
  full_name   TEXT,
  username    TEXT,
  avatar_url  TEXT,
  skill       TEXT,
  rating      NUMERIC,
  peak_rating NUMERIC,
  games       INT,
  wins        INT,
  losses      INT,
  win_rate    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH season AS (
    SELECT COALESCE(p_season_id, public.current_competitive_season()) AS id
  ),
  qualified AS (
    SELECT
      r.user_id,
      p.full_name,
      p.username,
      p.avatar_url,
      r.skill,
      r.rating,
      r.peak_rating,
      r.games,
      r.wins,
      r.losses,
      CASE WHEN r.games > 0
           THEN ROUND((r.wins::numeric * 100) / r.games, 1)
           ELSE 0 END AS win_rate
    FROM public.competitive_ratings r
    JOIN public.profiles p ON p.id = r.user_id
    JOIN season s ON s.id = r.season_id
    WHERE r.skill = p_skill
      AND r.games >= p_min_games
      AND p.is_public = TRUE
      AND p.status = 'active'
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY rating DESC, games DESC, user_id) AS rank,
    user_id, full_name, username, avatar_url, skill, rating, peak_rating,
    games, wins, losses, win_rate
  FROM qualified
  ORDER BY rating DESC, games DESC, user_id
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$fn$;

REVOKE ALL ON FUNCTION public.get_competitive_leaderboard(TEXT, UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_competitive_leaderboard(TEXT, UUID, INT, INT) TO authenticated, anon;

-- ============================================================================
-- 2. Live-match security
-- ============================================================================
-- Replace the blanket read policy. A match row is now readable by:
--   * a participant (they need their own match),
--   * anyone, once it is finished (problem sets are no longer secret),
--   * an admin.
-- An ACTIVE match is therefore invisible to a non-participant, including its
-- `problem_ids` and `metadata`.
DROP POLICY IF EXISTS competitive_matches_select ON public.competitive_matches;

DROP POLICY IF EXISTS competitive_matches_select_scoped ON public.competitive_matches;
CREATE POLICY competitive_matches_select_scoped ON public.competitive_matches
  FOR SELECT USING (
    status = 'finished'
    OR EXISTS (
      SELECT 1 FROM public.competitive_match_participants mp
       WHERE mp.match_id = competitive_matches.id
         AND mp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_grants ag
       WHERE ag.user_id = auth.uid()
         AND ag.admin_type IN ('platform_admin', 'campus_admin')
    )
  );

-- A narrow, owner-executed view for "live battles" that exposes match state
-- WITHOUT problem_ids or metadata. It is intentionally still readable by
-- everyone because the *existence* of a live match is the social proof we want.
CREATE OR REPLACE VIEW public.competitive_live_matches
WITH (security_invoker = FALSE) AS
  SELECT
    m.id,
    m.mode,
    m.skill,
    m.status,
    m.started_at,
    m.created_at,
    (SELECT COUNT(*) FROM public.competitive_match_participants mp WHERE mp.match_id = m.id) AS participant_count
  FROM public.competitive_matches m
  WHERE m.status IN ('lobby', 'active')
  ORDER BY m.created_at DESC
  LIMIT 20;

REVOKE ALL ON public.competitive_live_matches FROM PUBLIC;
GRANT SELECT ON public.competitive_live_matches TO authenticated, anon;

-- ============================================================================
-- 3. Atomic, idempotent settlement
-- ============================================================================
-- p_results is the server-computed array:
--   [{ "user_id": uuid, "team": int, "before": n, "after": n, "delta": n,
--      "result": "win"|"loss"|"draw" }, ...]
--
-- The server route produces it from authoritative match data using
-- src/lib/rating.ts. This function NEVER derives a result from client input and
-- is granted only to the service role.
CREATE OR REPLACE FUNCTION public.settle_competitive_match(
  p_match_id UUID,
  p_results  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_match        public.competitive_matches%ROWTYPE;
  v_item         JSONB;
  v_user         UUID;
  v_team         INT;
  v_before       NUMERIC;
  v_after        NUMERIC;
  v_delta        NUMERIC;
  v_result       TEXT;
  v_aura_reason  TEXT;
  v_awarded      INT := 0;
BEGIN
  -- Lock the row so two concurrent settlements cannot both proceed.
  SELECT * INTO v_match
    FROM public.competitive_matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found: %', p_match_id;
  END IF;

  -- Idempotency: a settled match stays settled.
  IF v_match.status = 'finished' THEN
    RETURN jsonb_build_object('settled', FALSE, 'reason', 'already_settled');
  END IF;
  IF v_match.status NOT IN ('lobby', 'active') THEN
    RETURN jsonb_build_object('settled', FALSE, 'reason', 'not_settleable', 'status', v_match.status);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user   := (v_item->>'user_id')::UUID;
    v_team   := COALESCE((v_item->>'team')::INT, 0);
    v_before := (v_item->>'before')::NUMERIC;
    v_after  := (v_item->>'after')::NUMERIC;
    v_delta  := (v_item->>'delta')::NUMERIC;
    v_result := v_item->>'result';

    IF v_result NOT IN ('win', 'loss', 'draw') THEN
      RAISE EXCEPTION 'invalid result for %: %', v_user, v_result;
    END IF;

    -- Invariant: the stored triple must reconcile.
    IF v_before + v_delta <> v_after THEN
      RAISE EXCEPTION 'rating triangle broken for %: % + % <> %', v_user, v_before, v_delta, v_after;
    END IF;

    -- The participant must actually belong to this match.
    IF NOT EXISTS (
      SELECT 1 FROM public.competitive_match_participants
       WHERE match_id = p_match_id AND user_id = v_user
    ) THEN
      RAISE EXCEPTION 'user % is not a participant of match %', v_user, p_match_id;
    END IF;

    UPDATE public.competitive_match_participants
       SET rating_before = v_before,
           rating_after  = v_after,
           rating_delta  = v_delta,
           result        = v_result
     WHERE match_id = p_match_id AND user_id = v_user;

    INSERT INTO public.competitive_ratings
      (user_id, skill, season_id, rating, peak_rating, games, wins, losses, draws)
    VALUES (
      v_user, v_match.skill, v_match.season_id, v_after, GREATEST(v_before, v_after), 1,
      CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'draw' THEN 1 ELSE 0 END
    )
    ON CONFLICT (user_id, skill, season_id) DO UPDATE
      SET rating      = v_after,
          peak_rating = GREATEST(public.competitive_ratings.peak_rating, v_after),
          games       = public.competitive_ratings.games + 1,
          wins        = public.competitive_ratings.wins   + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
          losses      = public.competitive_ratings.losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
          draws       = public.competitive_ratings.draws  + CASE WHEN v_result = 'draw' THEN 1 ELSE 0 END,
          updated_at  = now();

    -- Aura: daily competitive momentum. Entering already earned a little; the
    -- outcome is the bigger swing. Ref is per-match-per-user so it is awarded
    -- exactly once even if this function were somehow re-entered.
    v_aura_reason := CASE v_result
      WHEN 'win'  THEN 'ranked_win'
      WHEN 'loss' THEN 'ranked_loss'
      ELSE 'ranked_draw'
    END;
    PERFORM public.award_aura(
      v_aura_reason, 'match', p_match_id::TEXT || ':' || v_user::TEXT, v_user
    );

    -- XP: progression for taking part at all. Bounded and deduped.
    PERFORM public.award_xp(
      'challenge_completed', 'match_xp', p_match_id::TEXT || ':' || v_user::TEXT, v_user
    );

    v_awarded := v_awarded + 1;
  END LOOP;

  UPDATE public.competitive_matches
     SET status = 'finished',
         ended_at = now(),
         winning_team = v_match.winning_team
   WHERE id = p_match_id;

  RETURN jsonb_build_object('settled', TRUE, 'participants', v_awarded);
END;
$fn$;

REVOKE ALL ON FUNCTION public.settle_competitive_match(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_competitive_match(UUID, JSONB) TO service_role;

-- ============================================================================
-- 4. Verification
-- ============================================================================
-- A. A live match's problem set is NOT visible to a non-participant:
--    -- as a random authenticated user:
--    SELECT id, problem_ids FROM public.competitive_matches WHERE status = 'active';
--    -- should return zero rows for a match you are not in.
--    SELECT * FROM public.competitive_live_matches;   -- safe fields only
--
-- B. The ladder is by rating, not karma:
--    SELECT * FROM public.get_competitive_leaderboard('dsa', NULL, 25, 5);
--
-- C. Settlement is idempotent (service role):
--    SELECT public.settle_competitive_match('<match-uuid>', '[]'::jsonb);  -- run twice
--    -- second call returns {"settled": false, "reason": "already_settled"}
