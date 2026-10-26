-- 20261111_room_controls.sql — lock the room, size it, silence it at once
--
-- The ask, three controls for whoever runs a room:
--   a) ROOM LOCK — nobody new walks in until it is opened again. The lock is
--      read at TOKEN time (the token route refuses a locked room to anyone
--      who is not owner/admin/co-admin), so being locked out means never
--      reaching the LiveKit room at all, not just a greyed-out button.
--   b) ROOM SIZE — free4talk-style: the admin picks how big the room may be,
--      and it grows/shrinks for the next joiners. Enforced at the same gate:
--      a full room hands out no more tokens (moderators excepted).
--   c) MUTE ALL — one tap from the roster panel silences everybody except
--      the moderator who pressed it. Same role check as a single mute.
--
-- Applied AFTER 20261110_room_moderation.sql (which added host_muted and the
-- single-person mute RPC this one builds on).

-- ── a) the lock, on the call ───────────────────────────────────────────────

ALTER TABLE public.live_voice_chat_calls
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.set_live_voice_chat_call_lock(
  p_call_id UUID,
  p_locked  BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_group    UUID;
  v_is_owner BOOLEAN;
  v_my_role  TEXT;
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  SELECT group_id INTO v_group FROM public.live_voice_chat_calls WHERE id = p_call_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT (created_by = v_me) INTO v_is_owner
    FROM public.live_voice_chat_groups WHERE id = v_group;
  SELECT role INTO v_my_role
    FROM public.live_voice_chat_members WHERE group_id = v_group AND user_id = v_me;

  IF NOT COALESCE(v_is_owner, FALSE)
     AND v_my_role IS DISTINCT FROM 'admin'
     AND v_my_role IS DISTINCT FROM 'co-admin' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.live_voice_chat_calls SET locked = p_locked WHERE id = p_call_id;
  RETURN FOUND;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_live_voice_chat_call_lock(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_live_voice_chat_call_lock(UUID, BOOLEAN) TO authenticated;

-- ── b) how big the room may be, on the group ──────────────────────────────

ALTER TABLE public.live_voice_chat_groups
  ADD COLUMN IF NOT EXISTS max_participants INTEGER
  CONSTRAINT live_voice_chat_groups_max_participants_check
  CHECK (max_participants BETWEEN 2 AND 200);

-- Every room that exists before this migration keeps working: no cap until
-- somebody sets one (NULL = as many as the platform allows).
UPDATE public.live_voice_chat_groups
   SET max_participants = 50
 WHERE max_participants IS NULL;

CREATE OR REPLACE FUNCTION public.set_live_voice_chat_room_size(
  p_group_id UUID,
  p_max      INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_is_owner  BOOLEAN;
  v_my_role   TEXT;
BEGIN
  IF v_me IS NULL OR p_max IS NULL OR p_max < 2 OR p_max > 200 THEN
    RETURN FALSE;
  END IF;

  SELECT (created_by = v_me) INTO v_is_owner
    FROM public.live_voice_chat_groups WHERE id = p_group_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT role INTO v_my_role
    FROM public.live_voice_chat_members WHERE group_id = p_group_id AND user_id = v_me;

  -- Size is the OWNER's / ADMIN's dial, not a co-admin's.
  IF NOT COALESCE(v_is_owner, FALSE) AND v_my_role IS DISTINCT FROM 'admin' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.live_voice_chat_groups SET max_participants = p_max WHERE id = p_group_id;
  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_live_voice_chat_room_size(UUID, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_live_voice_chat_room_size(UUID, INTEGER) TO authenticated;

-- ── c) mute everyone but the moderator ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_live_voice_chat_host_mute_all(
  p_call_id UUID,
  p_muted   BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_group    UUID;
  v_is_owner BOOLEAN;
  v_my_role  TEXT;
  v_done     INTEGER;
BEGIN
  IF v_me IS NULL THEN RETURN 0; END IF;

  SELECT group_id INTO v_group FROM public.live_voice_chat_calls WHERE id = p_call_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT (created_by = v_me) INTO v_is_owner
    FROM public.live_voice_chat_groups WHERE id = v_group;
  SELECT role INTO v_my_role
    FROM public.live_voice_chat_members WHERE group_id = v_group AND user_id = v_me;

  IF NOT COALESCE(v_is_owner, FALSE)
     AND v_my_role IS DISTINCT FROM 'admin'
     AND v_my_role IS DISTINCT FROM 'co-admin' THEN
    RETURN 0;
  END IF;

  -- Whoever pressed it keeps their own microphone: mute ALL means the room,
  -- not the moderator.
  UPDATE public.live_voice_chat_participants
     SET host_muted = p_muted
   WHERE call_id = p_call_id
     AND left_at IS NULL
     AND user_id <> v_me;
  GET DIAGNOSTICS v_done = ROW_COUNT;
  RETURN v_done;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_live_voice_chat_host_mute_all(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_live_voice_chat_host_mute_all(UUID, BOOLEAN) TO authenticated;
