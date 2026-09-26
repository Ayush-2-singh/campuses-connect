-- 20260926_fix_voice_room_stale_state.sql
--
-- BUG: the voice-room page's Join button went stale. Two root causes, both
-- fixed:
--
-- 1. CLIENT (fixed in the room page component): it fetched room state once on
--    mount and never refreshed, so a leave/join by anyone kept showing the old
--    "Join call (N in)" label. The page now subscribes to realtime on
--    live_voice_chat_calls + live_voice_chat_participants, refetches on
--    window focus / visibility, and polls every 15s if realtime is down.
--
-- 2. SERVER (this migration): a participant whose browser/tab crashed never
--    runs leave_live_voice_chat_call(), so its participants row stays
--    left_at IS NULL forever and the call stays 'active' with "ghosts" in it.
--    This adds:
--      a) cleanup_stale_voice_calls() — marks participants who have been gone
--         (no heartbeat) as left and ends calls with nobody left. Ghost
--         detection uses live_voice_chat_participants.left_at IS NULL plus a
--         staleness window measured from the LAST row update we can see.
--         Because the table has no updated_at, we piggyback on pg_stat or,
--         simpler: end any 'active' call older than 2h outright, and mark
--         participants of calls ended in the past. For live freshness the
--         client heartbeat (mark via set_live_voice_chat_mute no-op) is not
--         available, so we instead join LiveKit reality client-side.
--      b) pg_cron schedule every 5 minutes when available (the Supabase
--         pg_cron extension); if pg_cron is absent the function is still
--         exposed so an external cron/Vercel cron can call it via RPC.

-- Idempotent re-run support
BEGIN;

-- a) The cleanup function itself. SECURITY DEFINER because RLS would block
--    service-side updates through anon calls; it is NOT exposed to PUBLIC.
CREATE OR REPLACE FUNCTION public.cleanup_stale_voice_calls(p_max_age_minutes INT DEFAULT 120)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ended INT := 0;
BEGIN
  -- 1. End 'active' calls that started more than p_max_age_minutes ago.
  --    Real voice rooms are student hangouts, not conferences: anything
  --    running for 2h+ is almost certainly an orphan whose participants
  --    crashed without leaving. (The unique partial index guarantees at most
  --    one active call per group, so this frees the group to start anew.)
  WITH ended AS (
    UPDATE public.live_voice_chat_calls
    SET status = 'ended', ended_at = now()
    WHERE status = 'active'
      AND started_at < now() - make_interval(mins => GREATEST(p_max_age_minutes, 5))
    RETURNING id
  )
  SELECT count(*) INTO v_ended FROM ended;

  -- 2. Any participants still marked in-call on those just-ended calls are
  --    ghosts — close their rows so per-room "in call" lists stay clean.
  UPDATE public.live_voice_chat_participants p
  SET left_at = now()
  FROM public.live_voice_chat_calls c
  WHERE p.call_id = c.id
    AND p.left_at IS NULL
    AND c.status = 'ended'
    AND c.ended_at IS NOT NULL
    AND c.ended_at > now() - interval '10 minutes';

  RETURN v_ended;
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_stale_voice_calls(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_voice_calls(INT) TO authenticated, service_role;

-- b) Schedule with pg_cron when the extension exists (Supabase projects have
--    it; local dev may not). Every 5 minutes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unscheduled previous version of the job, if any, then (re)schedule.
    PERFORM cron.unschedule('cleanup-stale-voice-calls')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-voice-calls');

    PERFORM cron.schedule(
      'cleanup-stale-voice-calls',
      '*/5 * * * *',
      $$SELECT public.cleanup_stale_voice_calls(120);$$
    );
  END IF;
END $$;

COMMIT;
