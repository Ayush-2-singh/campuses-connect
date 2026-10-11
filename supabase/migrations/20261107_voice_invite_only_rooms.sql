-- 20261107_voice_invite_only_rooms.sql
--
-- INVITE-ONLY LOCKED ROOMS — a password-locked voice room becomes invite-only:
-- it is not listed ANYWHERE for a student who was not invited.
--
-- Before this, a locked room stayed SELECT-visible to every student in scope,
-- so the hub listed it with a lock badge and a password prompt. The password
-- guarded ENTRY, but the room's existence (and its LIVE status) leaked to
-- strangers. Now:
--
--   a) is_lvc_member(group_id) — a SECURITY DEFINER helper so the groups
--      policy can ask "is the caller a member?" WITHOUT recursing through the
--      members table's own groups-referencing policy.
--   b) lvc_groups_select — a private room is visible ONLY to its members.
--      Public rooms behave exactly as before.
--   c) get_live_voice_chat_group(group_id) — the INVITE read. A SECURITY
--      DEFINER fetch that returns the room to anyone holding the id, so a
--      student who was handed the invite link still lands on the room and gets
--      the password prompt. Knowing the id IS the invite; the password is the
--      second lock. password_hash is never returned.
--
-- Idempotent. Safe to re-run.

-- ── a) membership helper (breaks the RLS recursion) ─────────────────────────

CREATE OR REPLACE FUNCTION public.is_lvc_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_voice_chat_members m
    WHERE m.group_id = p_group_id AND m.user_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_lvc_member(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_lvc_member(UUID) TO anon, authenticated;

-- ── b) locked rooms disappear from every listing ────────────────────────────

DROP POLICY IF EXISTS "lvc_groups_select" ON public.live_voice_chat_groups;
CREATE POLICY "lvc_groups_select" ON public.live_voice_chat_groups
  FOR SELECT USING (
    (scope = 'global' OR campus_id = (SELECT campus_id FROM public.profiles WHERE id = auth.uid()))
    AND (NOT is_private OR public.is_lvc_member(id))
  );

-- ── c) the invite read — the id in hand is the invitation ───────────────────

DROP FUNCTION IF EXISTS public.get_live_voice_chat_group(UUID);
CREATE OR REPLACE FUNCTION public.get_live_voice_chat_group(p_group_id UUID)
RETURNS TABLE (
  id          UUID,
  name        TEXT,
  description TEXT,
  icon        TEXT,
  section     TEXT,
  scope       TEXT,
  campus_id   UUID,
  created_by  UUID,
  is_private  BOOLEAN,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, g.description, g.icon, g.section, g.scope,
         g.campus_id, g.created_by, g.is_private, g.created_at
  FROM public.live_voice_chat_groups g
  WHERE g.id = p_group_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_live_voice_chat_group(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_live_voice_chat_group(UUID) TO anon, authenticated;
