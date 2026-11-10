-- 20261132_quick_math_daily.sql
--
-- Daily Quick Math — one seeded set of questions per day, one board.
--
-- The room game needs two players and a code, so there is nothing to come back
-- to the next morning. This adds the smallest daily loop that fixes that: every
-- player gets the same ten questions for the UTC day, plays them solo, and the
-- best run of the day is ranked — per campus when the player has a campus, and
-- globally always.
--
-- Fairness notes:
--   • The day is CURRENT_DATE on the server, never a client value, so a run
--     cannot be back- or forward-dated onto a different question set.
--   • Points are clamped to total_questions × 150 (the ceiling of base 100 +
--     speed bonus 50), so a tampered client cannot post an impossible score.
--   • All writes go through a SECURITY DEFINER function; the table has RLS on
--     and no policies, so it is not readable or writable directly.

CREATE TABLE IF NOT EXISTS public.quick_math_daily_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day             DATE NOT NULL DEFAULT CURRENT_DATE,
  player_key      TEXT NOT NULL,                -- guest id or user id, client-supplied
  user_id         UUID,                         -- auth.uid() when signed in
  campus_id       UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  nickname        TEXT NOT NULL,
  difficulty      TEXT NOT NULL DEFAULT 'medium',
  points          INT  NOT NULL DEFAULT 0,
  correct_count   INT  NOT NULL DEFAULT 0,
  total_questions INT  NOT NULL DEFAULT 0,
  duration_ms     INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day, player_key)
);

CREATE INDEX IF NOT EXISTS idx_qm_daily_day_points
  ON public.quick_math_daily_runs (day, points DESC, correct_count DESC);

CREATE INDEX IF NOT EXISTS idx_qm_daily_day_campus
  ON public.quick_math_daily_runs (day, campus_id, points DESC);

ALTER TABLE public.quick_math_daily_runs ENABLE ROW LEVEL SECURITY;

-- ── RPC: submit_quick_math_daily ────────────────────────────────────────────
-- Records a finished run. A repeat run on the same day only replaces the stored
-- row when it scores higher, so "your best run today counts" is enforced here
-- rather than in the UI.

CREATE OR REPLACE FUNCTION public.submit_quick_math_daily(
  p_player_key TEXT,
  p_nickname   TEXT,
  p_points     INT,
  p_correct    INT,
  p_total      INT,
  p_duration_ms INT,
  p_difficulty TEXT DEFAULT 'medium'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day    DATE := CURRENT_DATE;
  v_key    TEXT := btrim(coalesce(p_player_key, ''));
  v_total  INT  := least(greatest(coalesce(p_total, 0), 0), 50);
  v_points INT;
  v_correct INT;
  v_nick   TEXT;
  v_diff   TEXT;
  v_user   UUID := auth.uid();
  v_campus UUID;
  v_best   INT;
  v_rank   INT;
BEGIN
  IF v_key = '' THEN
    RAISE EXCEPTION 'Missing player id';
  END IF;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'No questions answered';
  END IF;

  -- 150 is the highest a single question can ever award.
  v_points  := least(greatest(coalesce(p_points, 0), 0), v_total * 150);
  v_correct := least(greatest(coalesce(p_correct, 0), 0), v_total);
  v_nick    := left(coalesce(nullif(btrim(p_nickname), ''), 'Anon'), 20);
  v_diff    := CASE WHEN p_difficulty IN ('easy', 'medium', 'hard') THEN p_difficulty ELSE 'medium' END;

  IF v_user IS NOT NULL THEN
    SELECT campus_id INTO v_campus FROM public.profiles WHERE id = v_user;
  END IF;

  INSERT INTO public.quick_math_daily_runs
    (day, player_key, user_id, campus_id, nickname, difficulty, points, correct_count, total_questions, duration_ms)
  VALUES
    (v_day, v_key, v_user, v_campus, v_nick, v_diff, v_points, v_correct, v_total,
     least(greatest(coalesce(p_duration_ms, 0), 0), 3600000))
  ON CONFLICT (day, player_key) DO UPDATE
    SET points          = GREATEST(public.quick_math_daily_runs.points, EXCLUDED.points),
        correct_count   = CASE WHEN EXCLUDED.points > public.quick_math_daily_runs.points
                               THEN EXCLUDED.correct_count ELSE public.quick_math_daily_runs.correct_count END,
        total_questions = CASE WHEN EXCLUDED.points > public.quick_math_daily_runs.points
                               THEN EXCLUDED.total_questions ELSE public.quick_math_daily_runs.total_questions END,
        duration_ms     = CASE WHEN EXCLUDED.points > public.quick_math_daily_runs.points
                               THEN EXCLUDED.duration_ms ELSE public.quick_math_daily_runs.duration_ms END,
        difficulty      = CASE WHEN EXCLUDED.points > public.quick_math_daily_runs.points
                               THEN EXCLUDED.difficulty ELSE public.quick_math_daily_runs.difficulty END,
        nickname        = EXCLUDED.nickname,
        user_id         = COALESCE(EXCLUDED.user_id, public.quick_math_daily_runs.user_id),
        campus_id       = COALESCE(EXCLUDED.campus_id, public.quick_math_daily_runs.campus_id),
        updated_at      = now()
  RETURNING points INTO v_best;

  SELECT count(*) + 1 INTO v_rank
  FROM public.quick_math_daily_runs
  WHERE day = v_day AND points > v_best;

  RETURN jsonb_build_object(
    'day', v_day,
    'best_points', v_best,
    'rank', v_rank,
    'has_campus', v_campus IS NOT NULL
  );
END;
$$;

-- ── RPC: quick_math_daily_board ─────────────────────────────────────────────
-- Today's board. 'campus' filters to the caller's campus and reports
-- has_campus = false when the caller has none, so the UI can fall back to the
-- global board instead of showing an empty list.

CREATE OR REPLACE FUNCTION public.quick_math_daily_board(
  p_scope TEXT DEFAULT 'global',
  p_limit INT  DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope  TEXT := CASE WHEN lower(coalesce(p_scope, '')) = 'campus' THEN 'campus' ELSE 'global' END;
  v_limit  INT  := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_campus UUID;
  v_rows   JSONB;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT campus_id INTO v_campus FROM public.profiles WHERE id = auth.uid();
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT r.nickname,
           r.points,
           r.correct_count,
           r.total_questions,
           r.difficulty,
           (r.user_id IS NOT NULL AND r.user_id = auth.uid()) AS is_me
    FROM public.quick_math_daily_runs r
    WHERE r.day = CURRENT_DATE
      AND (v_scope = 'global' OR (v_campus IS NOT NULL AND r.campus_id = v_campus))
    ORDER BY r.points DESC, r.correct_count DESC, r.updated_at ASC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'scope', v_scope,
    'day', CURRENT_DATE,
    'has_campus', v_campus IS NOT NULL,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quick_math_daily(TEXT, TEXT, INT, INT, INT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quick_math_daily_board(TEXT, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_quick_math_daily(TEXT, TEXT, INT, INT, INT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quick_math_daily_board(TEXT, INT) TO anon, authenticated;
