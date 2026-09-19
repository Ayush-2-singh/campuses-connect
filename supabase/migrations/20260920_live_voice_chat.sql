-- ═══════════════════════════════════════════════════════════════════════════
-- 20260920_live_voice_chat.sql — Live Voice Chat: student groups + calls
-- ═══════════════════════════════════════════════════════════════════════════
-- Unlike `communities` (admin-curated sections), Live Voice Chat groups are
-- created BY students, FOR students — like a WhatsApp group with a voice room.
--
-- A group is scoped at creation time:
--   'campus' → only visible/joinable by students on the creator's own campus
--   'global' → visible/joinable by students on ANY campus
--
-- ...and filed under one SECTION, which is what the listing page groups by:
--   dsa · discussion · web-dev · english · random
--
-- Each group can have one active call at a time (unique partial index below).
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── SECTIONS ────────────────────────────────────────────────────────────────
-- Kept as a CHECK constraint rather than an enum: adding a section later is a
-- one-line migration, and there is no type to cast on every read.

-- ── GROUPS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_voice_chat_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 60),
  description TEXT,
  icon        TEXT NOT NULL DEFAULT '🎙️',
  section     TEXT NOT NULL DEFAULT 'random'
              CHECK (section IN ('dsa', 'discussion', 'web-dev', 'english', 'random')),
  scope       TEXT NOT NULL CHECK (scope IN ('campus', 'global')),
  campus_id   UUID REFERENCES public.campuses(id) ON DELETE CASCADE, -- set when scope = 'campus'
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope = 'campus' AND campus_id IS NOT NULL) OR (scope = 'global' AND campus_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.live_voice_chat_members (
  group_id  UUID NOT NULL REFERENCES public.live_voice_chat_groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lvc_groups_section ON public.live_voice_chat_groups(section);
CREATE INDEX IF NOT EXISTS idx_lvc_groups_scope ON public.live_voice_chat_groups(scope);
CREATE INDEX IF NOT EXISTS idx_lvc_groups_campus ON public.live_voice_chat_groups(campus_id);
CREATE INDEX IF NOT EXISTS idx_lvc_members_user ON public.live_voice_chat_members(user_id);

ALTER TABLE public.live_voice_chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_voice_chat_members ENABLE ROW LEVEL SECURITY;

-- Discoverable: global groups to everyone; campus groups only to same-campus students.
DROP POLICY IF EXISTS "lvc_groups_select" ON public.live_voice_chat_groups;
CREATE POLICY "lvc_groups_select" ON public.live_voice_chat_groups
  FOR SELECT USING (
    scope = 'global'
    OR campus_id = (SELECT campus_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "lvc_members_select" ON public.live_voice_chat_members;
CREATE POLICY "lvc_members_select" ON public.live_voice_chat_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.live_voice_chat_groups g WHERE g.id = live_voice_chat_members.group_id)
  );

-- No direct INSERT/UPDATE/DELETE policies — everything below goes through
-- SECURITY DEFINER RPCs so scope/membership rules can't be bypassed by a
-- crafted client request.

-- ── GROUP RPCs ──────────────────────────────────────────────────────────────

-- Create a group. 'campus' scope auto-fills the creator's own campus_id —
-- a student can never create a campus group for someone else's campus.
CREATE OR REPLACE FUNCTION public.create_live_voice_chat_group(
  p_name TEXT,
  p_description TEXT,
  p_icon TEXT,
  p_scope TEXT,
  p_section TEXT DEFAULT 'random'
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

  IF p_scope = 'campus' THEN
    SELECT campus_id INTO v_campus FROM public.profiles WHERE id = v_me;
    IF v_campus IS NULL THEN RETURN NULL; END IF; -- global-only students can't create campus groups
  END IF;

  INSERT INTO public.live_voice_chat_groups (name, description, icon, section, scope, campus_id, created_by)
  VALUES (trim(p_name), p_description, coalesce(nullif(trim(p_icon), ''), '🎙️'), v_section, p_scope, v_campus, v_me)
  RETURNING id INTO v_group;

  INSERT INTO public.live_voice_chat_members (group_id, user_id, role) VALUES (v_group, v_me, 'admin');

  RETURN v_group;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_live_voice_chat_group(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_live_voice_chat_group(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Join a discoverable group (global, or same-campus).
CREATE OR REPLACE FUNCTION public.join_live_voice_chat_group(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_voice_chat_groups g
    WHERE g.id = p_group_id
      AND (g.scope = 'global' OR g.campus_id = (SELECT campus_id FROM public.profiles WHERE id = v_me))
  ) THEN RETURN FALSE; END IF;

  INSERT INTO public.live_voice_chat_members (group_id, user_id)
  VALUES (p_group_id, v_me) ON CONFLICT DO NOTHING;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_live_voice_chat_group(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_live_voice_chat_group(UUID) TO authenticated;

-- Leave a group. If the leaving member was its last admin, promote the
-- longest-standing remaining member so the group is never admin-less.
CREATE OR REPLACE FUNCTION public.leave_live_voice_chat_group(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_next UUID;
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  DELETE FROM public.live_voice_chat_members WHERE group_id = p_group_id AND user_id = v_me;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.live_voice_chat_members WHERE group_id = p_group_id AND role = 'admin') THEN
    SELECT user_id INTO v_next FROM public.live_voice_chat_members
    WHERE group_id = p_group_id ORDER BY joined_at ASC LIMIT 1;
    IF v_next IS NOT NULL THEN
      UPDATE public.live_voice_chat_members SET role = 'admin' WHERE group_id = p_group_id AND user_id = v_next;
    END IF;
  END IF;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.leave_live_voice_chat_group(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_live_voice_chat_group(UUID) TO authenticated;

-- ── CALLS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_voice_chat_calls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES public.live_voice_chat_groups(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lvc_calls_one_active_per_group
  ON public.live_voice_chat_calls(group_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.live_voice_chat_participants (
  call_id   UUID NOT NULL REFERENCES public.live_voice_chat_calls(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at   TIMESTAMPTZ,
  is_muted  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lvc_calls_group ON public.live_voice_chat_calls(group_id);
CREATE INDEX IF NOT EXISTS idx_lvc_calls_status ON public.live_voice_chat_calls(status);
CREATE INDEX IF NOT EXISTS idx_lvc_participants_call ON public.live_voice_chat_participants(call_id);

ALTER TABLE public.live_voice_chat_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_voice_chat_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lvc_calls_select" ON public.live_voice_chat_calls;
CREATE POLICY "lvc_calls_select" ON public.live_voice_chat_calls
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.live_voice_chat_members gm
      WHERE gm.group_id = live_voice_chat_calls.group_id AND gm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lvc_participants_select" ON public.live_voice_chat_participants;
CREATE POLICY "lvc_participants_select" ON public.live_voice_chat_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.live_voice_chat_calls c
      JOIN public.live_voice_chat_members gm ON gm.group_id = c.group_id AND gm.user_id = auth.uid()
      WHERE c.id = live_voice_chat_participants.call_id
    )
  );

-- ── CALL RPCs ────────────────────────────────────────────────────────────────

-- Idempotent: returns the already-active call instead of starting a second one,
-- which is what the unique partial index above enforces anyway.
CREATE OR REPLACE FUNCTION public.start_live_voice_chat_call(p_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_call UUID;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_voice_chat_members WHERE group_id = p_group_id AND user_id = v_me) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_call FROM public.live_voice_chat_calls WHERE group_id = p_group_id AND status = 'active';
  IF v_call IS NOT NULL THEN RETURN v_call; END IF;

  INSERT INTO public.live_voice_chat_calls (group_id, started_by) VALUES (p_group_id, v_me) RETURNING id INTO v_call;
  INSERT INTO public.live_voice_chat_participants (call_id, user_id) VALUES (v_call, v_me);

  RETURN v_call;
END $$;
REVOKE EXECUTE ON FUNCTION public.start_live_voice_chat_call(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_live_voice_chat_call(UUID) TO authenticated;

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
  ON CONFLICT (call_id, user_id) DO UPDATE SET left_at = NULL, joined_at = now();

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_live_voice_chat_call(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_live_voice_chat_call(UUID) TO authenticated;

-- Leaving ends the call for everyone once the last participant is gone, so a
-- group never shows a permanently "live" room with nobody in it.
CREATE OR REPLACE FUNCTION public.leave_live_voice_chat_call(p_call_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_remaining INT;
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.live_voice_chat_participants SET left_at = now()
  WHERE call_id = p_call_id AND user_id = v_me AND left_at IS NULL;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT count(*) INTO v_remaining FROM public.live_voice_chat_participants
  WHERE call_id = p_call_id AND left_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE public.live_voice_chat_calls SET status = 'ended', ended_at = now()
    WHERE id = p_call_id AND status = 'active';
  END IF;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.leave_live_voice_chat_call(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_live_voice_chat_call(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_live_voice_chat_mute(p_call_id UUID, p_muted BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;
  UPDATE public.live_voice_chat_participants SET is_muted = p_muted
  WHERE call_id = p_call_id AND user_id = v_me AND left_at IS NULL;
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_live_voice_chat_mute(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_live_voice_chat_mute(UUID, BOOLEAN) TO authenticated;

-- ── REALTIME ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'live_voice_chat_groups') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_voice_chat_groups;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'live_voice_chat_calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_voice_chat_calls;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'live_voice_chat_participants') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_voice_chat_participants;
  END IF;
END $$;
