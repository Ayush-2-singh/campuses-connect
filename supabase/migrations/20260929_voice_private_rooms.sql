-- 20260929_voice_private_rooms.sql
--
-- PRIVATE VOICE ROOMS — a room admin (the creator) can lock their room with a
-- password so only the people they shared it with can join.
--
--   a) live_voice_chat_groups.is_private + password_hash (pgcrypto bf crypt,
--      never plaintext).
--   b) create_live_voice_chat_group(..., p_is_private, p_password) — hashed
--      at creation; a private room requires a password ≥ 4 chars.
--   c) join_live_voice_chat_group(p_group_id, p_password) — non-members must
--      present the right password for a private room; members (and public
--      rooms) join as before. The 1-arg/5-arg signatures are replaced.
--   d) live_voice_chat_live_rooms() — private rooms are only advertised as
--      LIVE to their own members (and hidden from anon entirely), so a locked
--      room's existence/activity never leaks to strangers.
--
-- RLS note: groups stay SELECT-visible under the existing discoverability
-- policy on purpose — the hub shows the room with a lock badge and a password
-- prompt instead of pretending it does not exist. Everything sensitive
-- (calls, participants, token issuance) is already member-gated by RLS and
-- the token RPC, so a password only guards ENTRY, not existence.
--
-- Idempotent. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── a) COLUMNS ──────────────────────────────────────────────────────────────

ALTER TABLE public.live_voice_chat_groups
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.live_voice_chat_groups
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_lvc_groups_private
  ON public.live_voice_chat_groups(is_private)
  WHERE is_private;

-- ── b) CREATE — replaces the 5-arg version in place ─────────────────────────

DROP FUNCTION IF EXISTS public.create_live_voice_chat_group(TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_live_voice_chat_group(
  p_name TEXT,
  p_description TEXT,
  p_icon TEXT,
  p_scope TEXT,
  p_section TEXT DEFAULT 'random',
  p_is_private BOOLEAN DEFAULT FALSE,
  p_password TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_campus UUID;
        v_group UUID;
        v_section TEXT := coalesce(nullif(trim(p_section), ''), 'random');
BEGIN
  IF v_me IS NULL OR p_scope NOT IN ('campus', 'global') THEN RETURN NULL; END IF;
  IF char_length(trim(coalesce(p_name, ''))) < 3 THEN RETURN NULL; END IF;
  IF v_section NOT IN ('dsa', 'discussion', 'web-dev', 'english', 'random') THEN
    v_section := 'random';
  END IF;

  -- A locked room without a usable password would be joinable by nobody.
  IF p_is_private AND (p_password IS NULL OR char_length(p_password) < 4) THEN
    RETURN NULL;
  END IF;

  IF p_scope = 'campus' THEN
    SELECT campus_id INTO v_campus FROM public.profiles WHERE id = v_me;
    IF v_campus IS NULL THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.live_voice_chat_groups
    (name, description, icon, section, scope, campus_id, created_by, is_private, password_hash)
  VALUES
    (trim(p_name), p_description, coalesce(nullif(trim(p_icon), ''), '🎙️'), v_section, p_scope, v_campus, v_me,
     coalesce(p_is_private, FALSE),
     CASE WHEN coalesce(p_is_private, FALSE) THEN crypt(p_password, gen_salt('bf', 10)) END)
  RETURNING id INTO v_group;

  INSERT INTO public.live_voice_chat_members (group_id, user_id, role) VALUES (v_group, v_me, 'admin');

  RETURN v_group;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_live_voice_chat_group(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_live_voice_chat_group(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- ── c) JOIN — replaces the 1-arg version; password-gates private rooms ──────

DROP FUNCTION IF EXISTS public.join_live_voice_chat_group(UUID);
CREATE OR REPLACE FUNCTION public.join_live_voice_chat_group(
  p_group_id UUID,
  p_password TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_is_private BOOLEAN := FALSE;
        v_hash TEXT;
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  SELECT g.is_private, g.password_hash INTO v_is_private, v_hash
  FROM public.live_voice_chat_groups g
  WHERE g.id = p_group_id
    AND (g.scope = 'global' OR g.campus_id = (SELECT campus_id FROM public.profiles WHERE id = v_me));
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Already a member (creator/admin included): rejoining never needs a password.
  IF EXISTS (SELECT 1 FROM public.live_voice_chat_members WHERE group_id = p_group_id AND user_id = v_me) THEN
    INSERT INTO public.live_voice_chat_members (group_id, user_id) VALUES (p_group_id, v_me)
    ON CONFLICT DO NOTHING;
    RETURN TRUE;
  END IF;

  IF v_is_private THEN
    IF p_password IS NULL OR v_hash IS NULL OR crypt(p_password, v_hash) <> v_hash THEN
      RETURN FALSE;
    END IF;
  END IF;

  INSERT INTO public.live_voice_chat_members (group_id, user_id)
  VALUES (p_group_id, v_me) ON CONFLICT DO NOTHING;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_live_voice_chat_group(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_live_voice_chat_group(UUID, TEXT) TO authenticated;

-- ── d) LIVE LIST — never advertise a locked room to strangers ───────────────

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
  -- Heal FIRST (same as 20260927): sweep heartbeat-dead participants, then
  -- end calls nobody is in anymore.
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
    AND c.started_at < now() - interval '1 minute'
    AND NOT EXISTS (
      SELECT 1 FROM public.live_voice_chat_participants p
      WHERE p.call_id = c.id AND p.left_at IS NULL
    );

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
    -- Private rooms: members only. Anon (auth.uid() IS NULL) never sees them.
    AND (
      NOT g.is_private
      OR EXISTS (
        SELECT 1 FROM public.live_voice_chat_members m
        WHERE m.group_id = g.id AND m.user_id = auth.uid()
      )
    )
  GROUP BY g.id, c.id, g.name, g.icon, c.started_at
  ORDER BY c.started_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.live_voice_chat_live_rooms() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.live_voice_chat_live_rooms() TO anon, authenticated;
