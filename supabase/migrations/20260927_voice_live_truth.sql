-- 20260927_voice_live_truth.sql
--
-- WHY: every voice surface (hub LIVE badge, room header, the floating voice
-- card, the chat page's flash card, the home quick-action count) derived
-- "live" from live_voice_chat_calls.status = 'active' alone. An 'active' row
-- does NOT mean anybody is inside:
--
--   * a student's tab crashes → leave_live_voice_chat_call() never runs →
--     their participants row stays left_at IS NULL forever (a ghost), and
--     cleanup_stale_voice_calls() only reaps after 2 HOURS;
--   * the hub list fetched once on mount kept its LIVE badge after the call
--     had already ended;
--   * the home card counted ALL rooms as "live now".
--
-- Result: "LIVE" rooms with nobody in them — exactly what the product must
-- never show.
--
-- THIS MIGRATION defines "live" once, honestly:
--
--   LIVE ⇔ the call is active AND at least one participant was seen (a
--          heartbeat) within the last 150 seconds.
--
--   a) participants.last_seen_at — refreshed by an explicit heartbeat from
--      the in-call page every 30s (touch_live_voice_chat_heartbeat) and
--      piggybacked on join/mute.
--   b) touch_live_voice_chat_heartbeat(p_call_id) — refresh MY row, sweep
--      participants silent for 5+ minutes to left_at, and end the call when
--      nobody is left (same rule as leave_live_voice_chat_call).
--   c) live_voice_chat_live_rooms() — the ONE read path every surface uses:
--      heals ghosts first, then returns only rooms with a fresh person
--      inside, scoped to the groups the caller may see (global, or own
--      campus — the same rule as the lvc_groups_select policy; anon sees
--      global rooms only). Granted to anon + authenticated so the home page
--      and the chat flash card stay honest for logged-out visitors too.
--
-- Idempotent. Safe to re-run.

-- ── a) HEARTBEAT COLUMN ─────────────────────────────────────────────────────

ALTER TABLE public.live_voice_chat_participants
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_lvc_participants_presence
  ON public.live_voice_chat_participants (last_seen_at)
  WHERE left_at IS NULL;

-- ── b) HEARTBEAT + SWEEP + END-EMPTY-CALL ───────────────────────────────────

-- Called every 30s by each client that is actually inside a call. Because it
-- only runs from a mounted, connected call page, re-asserting presence here
-- is safe: a deliberate leave unmounts the page (and its timer) first.
CREATE OR REPLACE FUNCTION public.touch_live_voice_chat_heartbeat(p_call_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_ok BOOLEAN := FALSE;
BEGIN
  IF v_me IS NULL OR p_call_id IS NULL THEN RETURN FALSE; END IF;

  -- Only a member of the call's group may beat, and only while it is active.
  SELECT TRUE INTO v_ok
  FROM public.live_voice_chat_calls c
  JOIN public.live_voice_chat_members gm ON gm.group_id = c.group_id AND gm.user_id = v_me
  WHERE c.id = p_call_id AND c.status = 'active';
  IF NOT coalesce(v_ok, FALSE) THEN RETURN FALSE; END IF;

  -- Refresh (or restore) my presence row. Restoring matters: after a long
  -- laptop sleep a still-connected client may have been swept, and it must
  -- be able to prove it is back without a full rejoin dance.
  INSERT INTO public.live_voice_chat_participants (call_id, user_id, last_seen_at)
  VALUES (p_call_id, v_me, now())
  ON CONFLICT (call_id, user_id)
  DO UPDATE SET left_at = NULL, last_seen_at = now();

  -- Sweep ghosts: no heartbeat for 5 minutes ⇒ that tab is gone.
  UPDATE public.live_voice_chat_participants
  SET left_at = now()
  WHERE call_id = p_call_id
    AND left_at IS NULL
    AND user_id <> v_me
    AND last_seen_at < now() - interval '5 minutes';

  -- Nobody present ⇒ the call is over — same rule as
  -- leave_live_voice_chat_call: an empty room is never "live".
  IF NOT EXISTS (
    SELECT 1 FROM public.live_voice_chat_participants
    WHERE call_id = p_call_id AND left_at IS NULL
  ) THEN
    UPDATE public.live_voice_chat_calls
    SET status = 'ended', ended_at = now()
    WHERE id = p_call_id AND status = 'active';
  END IF;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.touch_live_voice_chat_heartbeat(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.touch_live_voice_chat_heartbeat(UUID) TO authenticated;

-- ── c) THE ONE HONEST READ PATH ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.live_voice_chat_live_rooms()
RETURNS TABLE (
  group_id          UUID,
  call_id           UUID,
  group_name        TEXT,
  group_icon        TEXT,
  participant_count INT,
  started_at        TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Heal FIRST so direct table readers (room page, member cards) converge on
  -- the same truth this function reports: sweep heartbeat-dead participants,
  -- then end calls nobody is in anymore. Every read of this function tidies
  -- up after crashed tabs, so no pg_cron dependency for correctness.
  UPDATE public.live_voice_chat_participants p
  SET left_at = now()
  WHERE p.left_at IS NULL
    AND p.last_seen_at < now() - interval '5 minutes'
    AND EXISTS (
      SELECT 1 FROM public.live_voice_chat_calls c
      WHERE c.id = p.call_id AND c.status = 'active'
    );

  UPDATE public.live_voice_chat_calls c
  SET status = 'ended', ended_at = now()
  WHERE c.status = 'active'
    AND c.started_at < now() - interval '1 minute'  -- grace: start+participant land in one tx, but be defensive
    AND NOT EXISTS (
      SELECT 1 FROM public.live_voice_chat_participants p
      WHERE p.call_id = c.id AND p.left_at IS NULL
    );

  -- Truthful live list: active call + at least one FRESH participant,
  -- scoped to the groups this caller is allowed to see.
  RETURN QUERY
  SELECT
    g.id,
    c.id,
    g.name,
    g.icon,
    count(*)::int,
    c.started_at
  FROM public.live_voice_chat_calls c
  JOIN public.live_voice_chat_groups g ON g.id = c.group_id
  JOIN public.live_voice_chat_participants p
    ON p.call_id = c.id
   AND p.left_at IS NULL
   AND p.last_seen_at > now() - interval '150 seconds'
  WHERE c.status = 'active'
    AND (
      g.scope = 'global'
      OR g.campus_id = (SELECT campus_id FROM public.profiles WHERE id = auth.uid())
    )
  GROUP BY g.id, c.id, g.name, g.icon, c.started_at
  ORDER BY c.started_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.live_voice_chat_live_rooms() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.live_voice_chat_live_rooms() TO anon, authenticated;

-- ── d) JOIN / MUTE REFRESH THE HEARTBEAT TOO ────────────────────────────────

-- Rejoining after a sweep (or after being away) must refresh last_seen_at,
-- otherwise a brand-new join would look 5-minutes-stale and be swept again on
-- the very next read. Same signature as 20260920 — this replaces it in place.
CREATE OR REPLACE FUNCTION public.join_live_voice_chat_call(p_call_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.live_voice_chat_calls c
    JOIN public.live_voice_chat_members gm ON gm.group_id = c.group_id AND gm.user_id = v_me
    WHERE c.id = p_call_id AND c.status = 'active'
  ) THEN RETURN FALSE; END IF;

  INSERT INTO public.live_voice_chat_participants (call_id, user_id) VALUES (p_call_id, v_me)
  ON CONFLICT (call_id, user_id)
  DO UPDATE SET left_at = NULL, joined_at = now(), last_seen_at = now();

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_live_voice_chat_call(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_live_voice_chat_call(UUID) TO authenticated;

-- The mute toggle already fires from the call page — it doubles as a beat.
CREATE OR REPLACE FUNCTION public.set_live_voice_chat_mute(p_call_id UUID, p_muted BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;
  UPDATE public.live_voice_chat_participants
  SET is_muted = p_muted, last_seen_at = now()
  WHERE call_id = p_call_id AND user_id = v_me AND left_at IS NULL;
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_live_voice_chat_mute(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_live_voice_chat_mute(UUID, BOOLEAN) TO authenticated;
