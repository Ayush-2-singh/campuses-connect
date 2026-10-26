-- 20261112_voice_kick_and_action_log.sql — remove somebody, and keep a record
--
-- The ask: an owner/admin (and, like mute, a co-admin) can REMOVE a person from
-- the live call, not just silence them — and the room's moderation should leave
-- a trail an admin can read afterwards ("kisne kab kis ko nikala").
--
-- Two pieces:
--   a) KICK — `live_voice_chat_kicks` remembers who was removed from THIS call.
--      The token route reads it before minting a LiveKit token, so a kicked
--      person can not simply rejoin: the door is shut for the life of the call,
--      the same way the lock and the room size are enforced — at the gate, not
--      in a greyed-out button.
--   b) ACTION LOG — lock / unlock / size / mute / unmute / mute-all and kick are
--      written into the existing public.audit_log, so /admin's Audit Log shows
--      them without a second table or a second screen.
--
-- Ranked on purpose: a co-admin may remove an ordinary member, an admin may
-- remove a co-admin, and the owner may remove anyone. Nobody removes the owner,
-- and nobody removes their own rank or above.

-- ── who was removed from a call ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_voice_chat_kicks (
  call_id    UUID NOT NULL REFERENCES public.live_voice_chat_calls(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lvc_kicks_user ON public.live_voice_chat_kicks (user_id, created_at DESC);

ALTER TABLE public.live_voice_chat_kicks ENABLE ROW LEVEL SECURITY;

-- Reads: the people who run the room, and each person's OWN row. The token
-- route runs as the caller's JWT, so a removed person must be able to see that
-- they were removed — otherwise RLS would hide the row and the door would let
-- them straight back in. Writers: only the SECURITY DEFINER function below, so
-- no client can add itself to the list.
DROP POLICY IF EXISTS live_voice_chat_kicks_select ON public.live_voice_chat_kicks;
CREATE POLICY live_voice_chat_kicks_select ON public.live_voice_chat_kicks
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.live_voice_chat_calls c
        JOIN public.live_voice_chat_groups g ON g.id = c.group_id
       WHERE c.id = live_voice_chat_kicks.call_id
         AND (
           g.created_by = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.live_voice_chat_members m
              WHERE m.group_id = c.group_id
                AND m.user_id = auth.uid()
                AND m.role IN ('admin', 'co-admin')
           )
         )
    )
  );

-- ── how much power somebody has in a room ─────────────────────────────────
-- 3 owner · 2 admin · 1 co-admin · 0 member. One place, used by both functions
-- below, so kick and the action log can never disagree about who runs a room.

CREATE OR REPLACE FUNCTION public.live_voice_chat_role_rank(p_group_id UUID, p_user UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_user IS NULL THEN 0
    WHEN EXISTS (
      SELECT 1 FROM public.live_voice_chat_groups g
       WHERE g.id = p_group_id AND g.created_by = p_user
    ) THEN 3
    ELSE COALESCE((
      SELECT CASE role
               WHEN 'admin' THEN 2
               WHEN 'co-admin' THEN 1
               ELSE 0
             END
        FROM public.live_voice_chat_members
       WHERE group_id = p_group_id AND user_id = p_user
    ), 0)
  END;
$$;

-- Internal only: the two functions below are SECURITY DEFINER and call it as
-- their owner, so no client needs to ask "what rank is that person?" itself.
REVOKE EXECUTE ON FUNCTION public.live_voice_chat_role_rank(UUID, UUID) FROM PUBLIC;

-- ── a) kick ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kick_live_voice_chat_participant(
  p_call_id UUID,
  p_target  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me          UUID := auth.uid();
  v_group       UUID;
  v_me_rank     INTEGER;
  v_target_rank INTEGER;
  v_target_name TEXT;
BEGIN
  IF v_me IS NULL OR p_target IS NULL OR p_target = v_me THEN
    RETURN FALSE;
  END IF;

  SELECT group_id INTO v_group FROM public.live_voice_chat_calls WHERE id = p_call_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_me_rank := public.live_voice_chat_role_rank(v_group, v_me);
  -- Only somebody who runs the room may remove anybody at all.
  IF v_me_rank < 1 THEN RETURN FALSE; END IF;

  -- …and only somebody BELOW them: a co-admin can not remove an admin, an admin
  -- can not remove the owner, and nobody removes themselves.
  v_target_rank := public.live_voice_chat_role_rank(v_group, p_target);
  IF v_target_rank >= v_me_rank THEN RETURN FALSE; END IF;

  SELECT COALESCE(full_name, username, 'Student')
    INTO v_target_name
    FROM public.profiles
   WHERE id = p_target;

  -- Out of the call right now. The client's LiveKit connection is dropped by
  -- the API route that calls this (LiveKit keeps its own roster); this row is
  -- what keeps them out even if that call is missed.
  UPDATE public.live_voice_chat_participants
     SET left_at = now()
   WHERE call_id = p_call_id
     AND user_id = p_target
     AND left_at IS NULL;

  -- …and out of the door until this call ends (see the token route).
  INSERT INTO public.live_voice_chat_kicks (call_id, user_id, by_user_id)
  VALUES (p_call_id, p_target, v_me)
  ON CONFLICT (call_id, user_id)
  DO UPDATE SET by_user_id = EXCLUDED.by_user_id, created_at = now();

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_me,
    'voice.kick',
    'live_voice_chat_call',
    p_call_id,
    jsonb_build_object('group_id', v_group, 'target_id', p_target, 'target_name', v_target_name)
  );

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.kick_live_voice_chat_participant(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.kick_live_voice_chat_participant(UUID, UUID) TO authenticated;

-- ── b) the room's moderation trail ────────────────────────────────────────
-- Called AFTER a moderation action succeeds: by the client for lock / size,
-- and by the mute route for mute / mute-all. Kick writes its own row (above),
-- and this function refuses that action so nothing can be logged twice.

CREATE OR REPLACE FUNCTION public.record_live_voice_chat_action(
  p_call_id UUID,
  p_action  TEXT,
  p_target  UUID DEFAULT NULL,
  p_detail  JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_group UUID;
  v_name  TEXT;
BEGIN
  IF v_me IS NULL OR p_call_id IS NULL THEN RETURN FALSE; END IF;
  IF p_action IS NULL OR p_action NOT IN ('lock', 'unlock', 'size', 'mute', 'unmute', 'mute_all', 'unmute_all') THEN
    RETURN FALSE;
  END IF;

  SELECT group_id INTO v_group FROM public.live_voice_chat_calls WHERE id = p_call_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF public.live_voice_chat_role_rank(v_group, v_me) < 1 THEN RETURN FALSE; END IF;

  IF p_target IS NOT NULL THEN
    SELECT COALESCE(full_name, username, 'Student')
      INTO v_name
      FROM public.profiles
     WHERE id = p_target;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_me,
    'voice.' || p_action,
    'live_voice_chat_call',
    p_call_id,
    jsonb_build_object('group_id', v_group, 'target_id', p_target, 'target_name', v_name)
      || COALESCE(p_detail, '{}'::jsonb)
  );

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_live_voice_chat_action(UUID, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_live_voice_chat_action(UUID, TEXT, UUID, JSONB) TO authenticated;
