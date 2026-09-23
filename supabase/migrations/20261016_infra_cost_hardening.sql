-- 20261016_infra_cost_hardening.sql
--
-- Additive infrastructure / cost hardening. Nothing here drops a table, drops a
-- column or deletes rows. Every section is either a new object, a replacement of
-- an existing function BODY (signature unchanged), or a new index.
--
-- Sections
--   1. notifications — add the missing index (the table predates the migration
--      set, so it has never had one; the bell badge runs a COUNT per client
--      per minute and every notification list read is a sequential scan).
--   2. notify_on_announcement() — replace the per-recipient plpgsql loop with a
--      single INSERT … SELECT. Same rows, same message, same destination; the
--      O(users) function-call amplification goes away.
--   3. brain_documents — content hashing so the same bytes are never OCR'd or
--      embedded twice (this is the change that makes AI cost bounded).
--   4. prune_notifications() — created but deliberately NOT scheduled. Read it
--      before you turn it on.
--   5. run_infra_cleanup() + pg_cron schedule for the two cleanup functions
--      that already exist but were never called by anything.
--   6. Verification queries to run afterwards.
--
-- Rollback: every section is reversible independently — see the notes at the
-- bottom of each section. The only behavioural change to existing data flow is
-- section 2, and it is rows-identical.

-- ============================================================================
-- 1. notifications — the missing index
-- ============================================================================
-- `public.notifications` is a legacy table: it is never CREATE TABLE'd by any
-- migration (only RLS-locked in 005_legacy_rls_lockdown.sql), and no index on it
-- exists anywhere in supabase/migrations. Meanwhile:
--
--   * Layout.tsx polls   COUNT(*) WHERE recipient_id = <me> AND is_read = false
--     every 60s for every signed-in client;
--   * /notifications selects the list ordered by created_at DESC.
--
-- (recipient_id, is_read, created_at DESC) serves both. This mirrors the shape
-- already used for notifications_log (idx_notifications_user) so the two tables
-- behave consistently.
--
-- Write cost: notifications is insert-heavy (augmented by section 2), so this
-- adds one index maintenance write per insert. That is the trade being made
-- deliberately: one small b-tree write to remove a seq scan on every page load
-- for every user. Confirm the table is actually unindexed before applying —
-- the table predates migrations, so an equivalent index may exist under a
-- different name (see section 6, query A).
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created
  ON public.notifications (recipient_id, is_read, created_at DESC);

-- Rollback: DROP INDEX IF EXISTS public.idx_notifications_recipient_read_created;

-- ============================================================================
-- 2. notify_on_announcement() — batch the fanout
-- ============================================================================
-- Current behaviour (20260922_fix_announcement_assignment_notifications.sql):
--
--   FOR profile_rec IN SELECT id FROM profiles WHERE <audience> LOOP
--     IF profile_rec.id != NEW.author_id THEN
--       PERFORM create_notification(...);   -- one INSERT per student
--     END IF;
--   END LOOP;
--
-- For a global announcement that is one plpgsql iteration, one function call and
-- one INSERT per student in the database — inside the publish trigger. At
-- 100,000 students a single global post writes 100,000 rows through 100,000
-- SECURITY DEFINER calls and holds the statement open long enough to risk the
-- trigger timing out on the post INSERT.
--
-- The replacement is a single INSERT … SELECT: one statement, one scan of
-- profiles, one set-based write. The ROW SET is identical, the body text is
-- byte-for-byte the same, and ref_type='post' / ref_id=NEW.id still route the
-- click to /post/<id> exactly as before.
--
-- Two deliberate small corrections:
--   * `= true` → `IS DISTINCT FROM true` so a NULL is_official can never take
--     the announcement path (posts.is_official is NOT NULL, so this is belt and
--     braces rather than a live bug).
--   * `id != NEW.author_id` → `id IS DISTINCT FROM NEW.author_id`. The old form
--     silently excluded EVERYONE when author_id was NULL (NULL != x is NULL, so
--     the IF never fired). IS DISTINCT FROM does the intended thing: exclude the
--     author, deliver to everyone else.
--
-- NOTE: this makes the fanout fast and atomic. It does not reduce the row COUNT
-- — per-recipient is_read state inherently requires one row per recipient. Row
-- growth is addressed by retention (section 4), not by this rewrite.
CREATE OR REPLACE FUNCTION public.notify_on_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.is_official IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (recipient_id, type, ref_type, ref_id, body, is_read)
  SELECT
    p.id,
    'system',                                  -- was: create_notification(p_type)
    'post',                                    -- was: p_ref_type
    NEW.id,                                    -- was: p_ref_id
    '📢 New official announcement posted',      -- unchanged message
    false
  FROM public.profiles p
  WHERE p.id IS DISTINCT FROM NEW.author_id
    AND (
      NEW.scope = 'global'
      OR (NEW.scope = 'campus' AND p.campus_id = NEW.campus_id)
    );

  RETURN NEW;
END;
$function$;

-- Rollback: re-apply the function body from
-- 20260922_fix_announcement_assignment_notifications.sql (lines ~217-246).

-- ============================================================================
-- 3. brain_documents — content hashing (stop paying to re-OCR / re-embed)
-- ============================================================================
-- The Brain pipeline currently has no memory of what it has already processed:
-- re-uploading the same PDF extracts, (for images) OCRs, chunks and embeds it
-- again, producing duplicate chunks. `content_hash` lets the upload route short
-- -circuit before any AI call.
--
-- processing_status exists so a half-finished upload is never mistaken for a
-- reusable document.
ALTER TABLE public.brain_documents
  ADD COLUMN IF NOT EXISTS content_hash      TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT        NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS ocr_version       INT         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS processed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chunk_count       INT         NOT NULL DEFAULT 0;

-- Existing rows were fully processed under the current pipeline, so 'ready' is
-- the correct backfill (the DEFAULT covers them).
UPDATE public.brain_documents
   SET processed_at = COALESCE(processed_at, created_at)
 WHERE processing_status = 'ready'
   AND processed_at IS NULL;

-- Lookup path: "does this user already have these exact bytes, processed?"
CREATE INDEX IF NOT EXISTS idx_brain_documents_user_hash
  ON public.brain_documents (user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- Keep processing_status to the three states the route actually writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brain_documents_processing_status_check'
  ) THEN
    ALTER TABLE public.brain_documents
      ADD CONSTRAINT brain_documents_processing_status_check
      CHECK (processing_status IN ('processing', 'ready', 'failed'));
  END IF;
END $$;

-- Rollback: the added columns are nullable / defaulted and unused by any other
-- code path, so they can be left in place indefinitely at negligible cost.
-- Dropping them would orphan processed_at/chunk_count, which are worth keeping.

-- ============================================================================
-- 4. prune_notifications() — created, NOT scheduled
-- ============================================================================
-- The notifications table has no retention: every like, comment, connection and
-- announcement leaves a permanent row. This function is the retention primitive.
--
-- IT IS DELIBERATELY NOT SCHEDULED BY THIS MIGRATION. It DELETEs data, so it is
-- left for you to enable explicitly once you are happy with the window:
--
--   SELECT cron.schedule('ctc-prune-notifications', '23 3 * * *',
--                        'SELECT public.prune_notifications(180);');
--
-- and to turn it off again:
--
--   SELECT cron.unschedule('ctc-prune-notifications');
--
-- Safety properties: only is_read = true rows are touched, only beyond
-- p_keep_days, and the default window (180 days) is conservative. Unread
-- notifications are never removed.
CREATE OR REPLACE FUNCTION public.prune_notifications(p_keep_days INT DEFAULT 180)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted INT;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 30 THEN
    RAISE EXCEPTION 'prune_notifications: p_keep_days must be >= 30 (got %)', p_keep_days;
  END IF;

  DELETE FROM public.notifications
   WHERE is_read = true
     AND created_at < now() - make_interval(days => p_keep_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.prune_notifications(int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prune_notifications(int) TO service_role;

-- Rollback: the function creates no state. Deleting rows it removed is not
-- possible, which is exactly why it is opt-in and not scheduled here.

-- ============================================================================
-- 5. Schedule the cleanup functions that already exist
-- ============================================================================
-- cleanup_rate_limits() was written in 043_premium_users_system.sql and
-- cleanup_expired_rooms() in 045_game_rooms.sql. Neither is called by any code,
-- any trigger or any schedule — so rate_limits grows forever and stale
-- game_rooms are never marked expired.
--
-- run_infra_cleanup() is a thin, idempotent wrapper so a single job covers both
-- and so future cleanups have one place to live. It is defensive about each
-- function's existence, because cleanup_expired_rooms() was created without an
-- explicit schema qualifier and its location is worth confirming.
CREATE OR REPLACE FUNCTION public.run_infra_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regprocedure('public.cleanup_rate_limits()') IS NOT NULL THEN
    PERFORM public.cleanup_rate_limits();
  ELSE
    RAISE WARNING 'run_infra_cleanup: public.cleanup_rate_limits() not found — skipped';
  END IF;

  IF to_regprocedure('public.cleanup_expired_rooms()') IS NOT NULL THEN
    PERFORM public.cleanup_expired_rooms();
  ELSE
    RAISE WARNING 'run_infra_cleanup: cleanup_expired_rooms() not found in public — skipped';
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.run_infra_cleanup() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_infra_cleanup() TO service_role;

-- pg_cron ships with Supabase but has to be enabled once. Attempt it here so
-- this migration is self-contained; if it is not permitted, print instructions
-- instead of failing the whole migration.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not enable pg_cron automatically (%). Enable it in Dashboard -> Database -> Extensions, then re-run section 5.', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL
  THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ctc-infra-cleanup') THEN
      PERFORM cron.unschedule('ctc-infra-cleanup');
    END IF;

    -- Hourly at :17 (off the top of the hour, away from the analytics dashboard
    -- and the notification fanout bursts).
    PERFORM cron.schedule(
      'ctc-infra-cleanup',
      '17 * * * *',
      'SELECT public.run_infra_cleanup();'
    );

    RAISE NOTICE 'Scheduled ctc-infra-cleanup hourly at :17.';
  ELSE
    RAISE NOTICE 'pg_cron is not enabled — ctc-infra-cleanup was NOT scheduled. Enable pg_cron, then re-run this section.';
  END IF;
END $$;

-- Rollback: SELECT cron.unschedule('ctc-infra-cleanup');
--           (the wrapper function is harmless to leave in place)

-- ============================================================================
-- 6. Verification — run these after applying
-- ============================================================================
-- A. Is notifications actually unindexed, and did section 1 land?
--    SELECT indexname, indexdef FROM pg_indexes
--     WHERE schemaname = 'public' AND tablename = 'notifications';
--
-- B. Are the two cleanup functions where run_infra_cleanup() expects them?
--    SELECT p.proname, n.nspname
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE p.proname IN ('cleanup_rate_limits', 'cleanup_expired_rooms');
--
-- C. Did the schedule register, and is it succeeding?
--    SELECT jobid, jobname, schedule, command, active FROM cron.job;
--    SELECT jobid, status, return_message, start_time
--      FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--    SELECT public.run_infra_cleanup();   -- run it once by hand first
--
-- D. Row counts before/after the first run (rate_limits should shrink):
--    SELECT count(*) FROM public.rate_limits;
--
-- E. Confirm the new fanout is rows-identical: publish a test campus
--    announcement and compare
--      SELECT count(*) FROM public.notifications
--       WHERE ref_type = 'post' AND ref_id = '<the new post id>';
--    against the number of profiles in that campus (minus the author).
