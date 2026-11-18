-- ============================================================
-- ConnectToCampus — DAILY CHALLENGE SCHEDULE (self-healing)
--
-- `daily_challenges` was seeded once by migration 015 and never again, so the
-- Compete → Daily Challenge tab has shown "No challenge scheduled for today"
-- since 2026-08-09. Nothing rotated the pointer, and no cron was configured.
--
-- `ensure_daily_challenge(days)` fills a rolling window starting today:
--   • deterministic pick — day N always resolves to the same problem, for
--     every caller, so two simultaneous requests cannot disagree. The pick is
--     the day number modulo the active problems ordered easy → medium → hard,
--     which rotates difficulty the way a daily board should;
--   • idempotent — ON CONFLICT (day) DO NOTHING, so a cron job and a page load
--     can both call it and the second one is free;
--   • self-healing — a row pointing at a deactivated problem is repaired to
--     today's deterministic pick, so the tab never renders empty by accident;
--   • safe to over-call — it only inserts schedule pointers, never scores.
--
-- Called from two places:
--   1. GET /api/compete/daily/ensure (daily cron; tops the window back up);
--   2. the Compete page, only when today has no resolvable problem, which is
--      what keeps the tab alive on a project with no cron configured.
--
-- With zero active problems it returns ok:false / no_problems instead of
-- inventing a row, so the UI keeps its honest empty state.
--
-- Idempotent migration: CREATE OR REPLACE only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_daily_challenge(p_days INT DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days      INT  := least(greatest(coalesce(p_days, 30), 1), 120);
  v_to        DATE := CURRENT_DATE + (v_days - 1);
  v_epoch     DATE := DATE '2026-01-01';
  v_problems  UUID[];
  v_count     INT;
  v_inserted  INT := 0;
  v_day       DATE;
  v_idx       INT;
  v_picked    UUID;
BEGIN
  SELECT array_agg(
           p.id
           ORDER BY CASE p.difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                    p.created_at,
                    p.slug
         )
    INTO v_problems
    FROM public.dsa_problems p
   WHERE p.is_active = TRUE;

  v_count := coalesce(array_length(v_problems, 1), 0);
  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_problems', 'inserted', 0);
  END IF;

  FOR v_day IN
    SELECT generate_series(CURRENT_DATE, v_to, interval '1 day')::date
  LOOP
    -- Same day → same problem, whoever calls. `+ v_count` keeps the modulo
    -- non-negative for days before the epoch.
    v_idx := (((v_day - v_epoch) % v_count) + v_count) % v_count;
    v_picked := v_problems[v_idx + 1];

    INSERT INTO public.daily_challenges (day, problem_id)
    VALUES (v_day, v_picked)
    ON CONFLICT (day) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- A scheduled row whose problem was later deactivated would look empty to
  -- the page (it only lists active problems), so repair today's pointer.
  UPDATE public.daily_challenges d
     SET problem_id = v_problems[((((CURRENT_DATE - v_epoch) % v_count) + v_count) % v_count) + 1]
   WHERE d.day = CURRENT_DATE
     AND NOT EXISTS (
       SELECT 1 FROM public.dsa_problems p
        WHERE p.id = d.problem_id
          AND p.is_active = TRUE
     );

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'days', v_days,
    'problems', v_count,
    'from', CURRENT_DATE,
    'to', v_to,
    'today_problem', (SELECT problem_id FROM public.daily_challenges WHERE day = CURRENT_DATE),
    'scheduled', (SELECT count(*) FROM public.daily_challenges WHERE day BETWEEN CURRENT_DATE AND v_to)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.ensure_daily_challenge(INT) FROM PUBLIC;
-- Signed-in pages heal themselves; the service role runs the cron.
GRANT EXECUTE ON FUNCTION public.ensure_daily_challenge(INT) TO authenticated, service_role;
