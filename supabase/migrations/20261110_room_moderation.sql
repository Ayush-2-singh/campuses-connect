-- 20261110_room_moderation.sql — who runs a room: co-admins and host mute
--
-- The ask: the room's owner/admin can hand a member co-admin power, and BOTH
-- of them can mute other people in the call.
--
--   a) live_voice_chat_members.role grows 'co-admin' (the CHECK constraint
--      only ever knew 'member' and 'admin').
--   b) set_live_voice_chat_role() — owner or admin promotes/demotes a member.
--      The role itself is still checked in SQL: a client can not grant itself
--      power by editing a row.
--   c) live_voice_chat_participants.host_muted — the moderator's mute, kept
--      separate from is_muted (which is the person's OWN mic toggle). The
--      muted client reads it, keeps its microphone off, and can not unmute.
--   d) set_live_voice_chat_host_mute() — the only writer, and it is the thing
--      that decides whether the caller is allowed to mute anybody.

-- ── a) the role vocabulary ─────────────────────────────────────────────────

ALTER TABLE public.live_voice_chat_members
  DROP CONSTRAINT IF EXISTS live_voice_chat_members_role_check;

ALTER TABLE public.live_voice_chat_members
  ADD CONSTRAINT live_voice_chat_members_role_check
  CHECK (role IN ('member', 'co-admin', 'admin'));

-- ── b) appoint / remove a co-admin ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_live_voice_chat_role(
  p_group_id UUID,
  p_user_id  UUID,
  p_role     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_is_owner  BOOLEAN;
  v_my_role   TEXT;
  v_owner     UUID;
BEGIN
  -- Only two outcomes are on offer: full member, or co-admin.
  IF v_me IS NULL OR p_role NOT IN ('member', 'co-admin') THEN
    RETURN FALSE;
  END IF;

  SELECT (created_by = v_me), created_by
    INTO v_is_owner, v_owner
    FROM public.live_voice_chat_groups
   WHERE id = p_group_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT role INTO v_my_role
    FROM public.live_voice_chat_members
   WHERE group_id = p_group_id AND user_id = v_me;

  -- Owner or admin hands out the power — a co-admin can not make more of
  -- themselves, and a plain member can not promote anybody.
  IF NOT COALESCE(v_is_owner, FALSE) AND v_my_role IS DISTINCT FROM 'admin' THEN
    RETURN FALSE;
  END IF;

  -- The owner's own role is not on the table, and the target must be in.
  IF p_user_id = v_owner THEN RETURN FALSE; END IF;

  UPDATE public.live_voice_chat_members
     SET role = p_role
   WHERE group_id = p_group_id AND user_id = p_user_id;
  RETURN FOUND;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_live_voice_chat_role(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_live_voice_chat_role(UUID, UUID, TEXT) TO authenticated;

-- ── c) the moderator's mute, on the row ────────────────────────────────────

ALTER TABLE public.live_voice_chat_participants
  ADD COLUMN IF NOT EXISTS host_muted BOOLEAN NOT NULL DEFAULT FALSE;

-- ── d) mute / unmute somebody else ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_live_voice_chat_host_mute(
  p_call_id UUID,
  p_target  UUID,
  p_muted   BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_group    UUID;
  v_is_owner BOOLEAN;
  v_my_role  TEXT;
  v_target   UUID;
BEGIN
  IF v_me IS NULL OR p_target = v_me THEN RETURN FALSE; END IF;

  SELECT group_id INTO v_group
    FROM public.live_voice_chat_calls
   WHERE id = p_call_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT (created_by = v_me) INTO v_is_owner
    FROM public.live_voice_chat_groups WHERE id = v_group;

  SELECT role INTO v_my_role
    FROM public.live_voice_chat_members
   WHERE group_id = v_group AND user_id = v_me;

  -- Owner, admin or co-admin: the three people who run the room.
  IF NOT COALESCE(v_is_owner, FALSE)
     AND v_my_role IS DISTINCT FROM 'admin'
     AND v_my_role IS DISTINCT FROM 'co-admin' THEN
    RETURN FALSE;
  END IF;

  -- Only somebody who is actually in this call, and still in it.
  UPDATE public.live_voice_chat_participants
     SET host_muted = p_muted
   WHERE call_id = p_call_id
     AND user_id = p_target
     AND left_at IS NULL;
  RETURN FOUND;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_live_voice_chat_host_mute(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_live_voice_chat_host_mute(UUID, UUID, BOOLEAN) TO authenticated;
