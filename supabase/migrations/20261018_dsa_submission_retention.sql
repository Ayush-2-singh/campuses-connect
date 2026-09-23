-- 20261018_dsa_submission_retention.sql
--
-- DSA SUBMISSION CODE RETENTION — mechanism only, deliberately NOT scheduled.
--
-- `dsa_submissions.code` is `TEXT NOT NULL` and every judge run stores the full
-- source (capped at 20,000 chars). So the table carries the largest per-row
-- payload in the schema and grows with every attempt, including all the failed
-- ones. Verdict, runtime and pass counts are small and worth keeping forever;
-- the source of an old wrong-answer is not.
--
-- Phase 18 asks for "a migration + verification + scheduled job" and also says
-- not to destroy submission history immediately. So this migration:
--
--   1. relaxes `code` to nullable  (a constraint change, not data loss),
--   2. adds an archive table that keeps the code somewhere recoverable,
--   3. adds archive_dsa_submission_code() — move-then-null, never delete,
--   4. adds restore_dsa_submission_code() — a real rollback path,
--   5. schedules NOTHING.
--
-- ==  ACTION REQUIRED BEFORE THIS DOES ANYTHING  ==
-- The archive function nulls data. That is the destructive part, and it is left
-- switched OFF on purpose. To enable it, after reviewing the dry run below:
--
--   SELECT cron.schedule('ctc-archive-dsa-code', '41 4 * * *',
--                        'SELECT public.archive_dsa_submission_code(3, 90);');
--
-- To switch it back off:
--
--   SELECT cron.unschedule('ctc-archive-dsa-code');
--
-- Nothing in the application reads `code` for anything except showing a past
-- submission, and the archive keeps every byte, so the blast radius of the
-- scheduled job is "old failed code moves to another table".

-- ============================================================================
-- 1. Allow the code column to be emptied (constraint only — no data touched)
-- ============================================================================
-- Required before any archival can happen: the column is NOT NULL today, so
-- `SET code = NULL` would fail with a constraint violation.
ALTER TABLE public.dsa_submissions
  ALTER COLUMN code DROP NOT NULL;

-- ============================================================================
-- 2. Archive table — the code lives here afterwards, not in the bin
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dsa_submission_code_archive (
  submission_id UUID PRIMARY KEY REFERENCES public.dsa_submissions(id) ON DELETE CASCADE,
  user_id       UUID,
  problem_id    UUID,
  language      TEXT,
  code          TEXT NOT NULL,
  archived_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Denormalised so the archive can be read (and restored) without joining, and
-- so ownership is provable if the submissions row is ever removed.
CREATE INDEX IF NOT EXISTS idx_dsa_code_archive_user
  ON public.dsa_submission_code_archive (user_id, archived_at DESC);

-- RLS on, and NO policies: reachable only through the SECURITY DEFINER
-- functions below (and the service role). Archived student code is not public
-- content and should not be selectable by another student.
ALTER TABLE public.dsa_submission_code_archive ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Archive (move, never delete)
-- ============================================================================
-- Keeps, for each (user, problem):
--   * every `accepted` submission, forever
--   * the latest p_keep_latest attempts, whatever their verdict
-- and archives the source of the rest once they are older than p_min_age_days.
--
-- verdict / passed / total / runtime_ms / created_at stay untouched, so
-- history, streaks and ratings are unaffected.
CREATE OR REPLACE FUNCTION public.archive_dsa_submission_code(
  p_keep_latest   INT DEFAULT 3,
  p_min_age_days  INT DEFAULT 90
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ids   UUID[];
  v_count INT := 0;
BEGIN
  -- Refuse silly parameters rather than surprising a future operator.
  IF p_min_age_days < 30 THEN
    RAISE EXCEPTION 'archive_dsa_submission_code: p_min_age_days must be >= 30 (got %)', p_min_age_days;
  END IF;
  IF p_keep_latest < 1 THEN
    RAISE EXCEPTION 'archive_dsa_submission_code: p_keep_latest must be >= 1 (got %)', p_keep_latest;
  END IF;

  SELECT array_agg(q.id)
    INTO v_ids
    FROM (
      SELECT s.id
        FROM public.dsa_submissions s
       WHERE s.code IS NOT NULL
         AND s.verdict <> 'accepted'
         AND s.created_at < now() - make_interval(days => p_min_age_days)
         -- Keep the most recent few attempts per user+problem.
         AND s.id NOT IN (
           SELECT ranked.id
             FROM (
               SELECT id,
                      row_number() OVER (PARTITION BY user_id, problem_id ORDER BY created_at DESC) AS rn
                 FROM public.dsa_submissions
                WHERE code IS NOT NULL
             ) ranked
            WHERE ranked.rn <= p_keep_latest
         )
    ) q;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.dsa_submission_code_archive (submission_id, user_id, problem_id, language, code)
  SELECT s.id, s.user_id, s.problem_id, s.language, s.code
    FROM public.dsa_submissions s
   WHERE s.id = ANY(v_ids)
  ON CONFLICT (submission_id) DO NOTHING;

  UPDATE public.dsa_submissions
     SET code = NULL
   WHERE id = ANY(v_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- ============================================================================
-- 4. Rollback path — put every archived byte back
-- ============================================================================
CREATE OR REPLACE FUNCTION public.restore_dsa_submission_code()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.dsa_submissions s
     SET code = a.code
    FROM public.dsa_submission_code_archive a
   WHERE a.submission_id = s.id
     AND s.code IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- ============================================================================
-- 5. Grants — service-side only
-- ============================================================================
REVOKE ALL ON FUNCTION public.archive_dsa_submission_code(int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_dsa_submission_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_dsa_submission_code(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_dsa_submission_code() TO service_role;

-- ============================================================================
-- 6. Verification — run these BEFORE enabling the schedule
-- ============================================================================
-- A. How much would a 3-latest / 90-day run actually touch?
--    SELECT count(*) AS would_archive
--      FROM public.dsa_submissions s
--     WHERE s.code IS NOT NULL
--       AND s.verdict <> 'accepted'
--       AND s.created_at < now() - INTERVAL '90 days'
--       AND s.id NOT IN (
--         SELECT id FROM (
--           SELECT id, row_number() OVER (PARTITION BY user_id, problem_id ORDER BY created_at DESC) rn
--             FROM public.dsa_submissions WHERE code IS NOT NULL
--         ) t WHERE t.rn <= 3
--       );
--
-- B. Size of the payload involved (bytes the heap would stop carrying):
--    SELECT pg_size_pretty(SUM(pg_column_size(code))) AS code_bytes
--      FROM public.dsa_submissions WHERE code IS NOT NULL;
--
-- C. After a manual run, confirm nothing was lost:
--    SELECT public.archive_dsa_submission_code(3, 90);
--    SELECT count(*) FROM public.dsa_submission_code_archive;
--    SELECT count(*) FROM public.dsa_submissions WHERE code IS NULL;
--    -- and that history is intact:
--    SELECT verdict, passed, total, runtime_ms FROM public.dsa_submissions LIMIT 5;
--
-- D. Rollback rehearsal (restores every archived row, then you can re-run the
--    archive if you want the space back):
--    SELECT public.restore_dsa_submission_code();
