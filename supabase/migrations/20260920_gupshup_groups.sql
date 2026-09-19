-- ═══════════════════════════════════════════════════════════════════════════
-- 20260920_gupshup_groups.sql — GupShup: user-created student groups + calls
-- ═══════════════════════════════════════════════════════════════════════════
-- Unlike `communities` (admin-curated, topic-based: DSA, Web Dev, ...),
-- GupShup groups are created BY students, FOR students — like a WhatsApp
-- group. A group is scoped at creation time:
--   'campus' → only visible/joinable by students on the creator's own campus
--   'global' → visible/joinable by students on ANY campus
-- Each group can have one active GupShup Call at a time (see the call tables
-- + RPCs at the bottom, unchanged in spirit from the earlier draft — just
-- re-pointed at gupshup_groups instead of communities).
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── GROUPS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gupshup_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 60),
  description TEXT,
  icon        TEXT NOT NULL DEFAULT '🎙️',
  scope       TEXT NOT NULL CHECK (scope IN ('campus', 'global')),
  campus_id   UUID REFERENCES public.campuses(id) ON DELETE CASCADE, -- set when scope = 'campus'
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope = 'campus' AND campus_id IS NOT NULL) OR (scope = 'global' AND campus_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.gupshup_group_members (
  group_id  UUID NOT NULL REFERENCES public.gupshup_groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gupshup_groups_scope ON public.gupshup_groups(scope);
CREATE INDEX IF NOT EXISTS idx_gupshup_groups_campus ON public.gupshup_groups(campus_id);
CREATE INDEX IF NOT EXISTS idx_gupshup_group_members_user ON public.gupshup_group_members(user_id);

ALTER TABLE public.gupshup_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gupshup_group_members ENABLE ROW LEVEL SECURITY;

-- Discoverable: global groups to everyone; campus groups only to same-campus students.
DROP POLICY IF EXISTS "gupshup_groups_select" ON public.gupshup_groups;
CREATE POLICY "gupshup_groups_select" ON public.gupshup_groups
  FOR SELECT USING (
    scope = 'global'
    OR campus_id = (SELECT campus_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "gupshup_group_members_select" ON public.gupshup_group_members;
CREATE POLICY "gupshup_group_members_select" ON public.gupshup_group_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.gupshup_groups g WHERE g.id = gupshup_group_members.group_id)
  );

-- No direct INSERT/UPDATE/DELETE policies — everything below goes through
-- SECURITY DEFINER RPCs so scope/membership rules can't be bypassed by a
-- crafted client request.

-- ── GROUP RPCs ──────────────────────────────────────────────────────────────

-- Create a group. 'campus' scope auto-fills the creator's own campus_id —
-- a student can never create a campus group for someone else's campus.
CREATE OR REPLACE FUNCTION public.create_gupshup_group(p_name TEXT, p_description TEXT, p_icon TEXT, p_scope TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_campus UUID;
        v_group UUID;
BEGIN
  IF v_me IS NULL OR p_scope NOT IN ('campus', 'global') THEN RETURN NULL; END IF;
  IF char_length(trim(coalesce(p_name, ''))) < 3 THEN RETURN NULL; END IF;

  IF p_scope = 'campus' THEN
    SELECT campus_id INTO v_campus FROM public.profiles WHERE id = v_me;
    IF v_campus IS NULL THEN RETURN NULL; END IF; -- global-only students can't create campus groups
  END IF;

  INSERT INTO public.gupshup_groups (name, description, icon, scope, campus_id, created_by)
  VALUES (trim(p_name), p_description, coalesce(nullif(trim(p_icon), ''), '🎙️'), p_scope, v_campus, v_me)
  RETURNING id INTO v_group;

  INSERT INTO public.gupshup_group_members (group_id, user_id, role) VALUES (v_group, v_me, 'admin');

  RETURN v_group;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_gupshup_group(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_gupshup_group(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Join a discoverable group (global, or same-campus).
CREATE OR REPLACE FUNCTION public.join_gupshup_group(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gupshup_groups g
    WHERE g.id = p_group_id
      AND (g.scope = 'global' OR g.campus_id = (SELECT campus_id FROM public.profiles WHERE id = v_me))
  ) THEN RETURN FALSE; END IF;

  INSERT INTO public.gupshup_group_members (group_id, user_id)
  VALUES (p_group_id, v_me) ON CONFLICT DO NOTHING;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_gupshup_group(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_gupshup_group(UUID) TO authenticated;

-- Leave a group. If the leaving member was its last admin, promote the
-- longest-standing remaining member so the group is never admin-less.
CREATE OR REPLACE FUNCTION public.leave_gupshup_group(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_next UUID;
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  DELETE FROM public.gupshup_group_members WHERE group_id = p_group_id AND user_id = v_me;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gupshup_group_members WHERE group_id = p_group_id AND role = 'admin') THEN
    SELECT user_id INTO v_next FROM public.gupshup_group_members
    WHERE group_id = p_group_id ORDER BY joined_at ASC LIMIT 1;
    IF v_next IS NOT NULL THEN
      UPDATE public.gupshup_group_members SET role = 'admin' WHERE group_id = p_group_id AND user_id = v_next;
    END IF;
  END IF;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.leave_gupshup_group(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_gupshup_group(UUID) TO authenticated;

-- ── CALLS (same shape as before, now pointed at gupshup_groups) ─────────────

CREATE TABLE IF NOT EXISTS public.gupshup_calls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES public.gupshup_groups(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gupshup_calls_one_active_per_group
  ON public.gupshup_calls(group_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.gupshup_call_participants (
  call_id   UUID NOT NULL REFERENCES public.gupshup_calls(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at   TIMESTAMPTZ,
  is_muted  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gupshup_calls_group ON public.gupshup_calls(group_id);
CREATE INDEX IF NOT EXISTS idx_gupshup_calls_status ON public.gupshup_calls(status);
CREATE INDEX IF NOT EXISTS idx_gupshup_participants_call ON public.gupshup_call_participants(call_id);

ALTER TABLE public.gupshup_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gupshup_call_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gupshup_calls_select" ON public.gupshup_calls;
CREATE POLICY "gupshup_calls_select" ON public.gupshup_calls
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.gupshup_group_members gm
      WHERE gm.group_id = gupshup_calls.group_id AND gm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gupshup_participants_select" ON public.gupshup_call_participants;
CREATE POLICY "gupshup_participants_select" ON public.gupshup_call_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.gupshup_calls c
      JOIN public.gupshup_group_members gm ON gm.group_id = c.group_id AND gm.user_id = auth.uid()
      WHERE c.id = gupshup_call_participants.call_id
    )
  );

-- ── CALL RPCs ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_gupshup_call(p_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_call UUID;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gupshup_group_members WHERE group_id = p_group_id AND user_id = v_me) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_call FROM public.gupshup_calls WHERE group_id = p_group_id AND status = 'active';
  IF v_call IS NOT NULL THEN RETURN v_call; END IF;

  INSERT INTO public.gupshup_calls (group_id, started_by) VALUES (p_group_id, v_me) RETURNING id INTO v_call;
  INSERT INTO public.gupshup_call_participants (call_id, user_id) VALUES (v_call, v_me);

  RETURN v_call;
END $$;
REVOKE EXECUTE ON FUNCTION public.start_gupshup_call(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_gupshup_call(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_gupshup_call(p_call_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.gupshup_calls c
    JOIN public.gupshup_group_members gm ON gm.group_id = c.group_id AND gm.user_id = v_me
    WHERE c.id = p_call_id AND c.status = 'active'
  ) THEN RETURN FALSE; END IF;

  INSERT INTO public.gupshup_call_participants (call_id, user_id) VALUES (p_call_id, v_me)
  ON CONFLICT (call_id, user_id) DO UPDATE SET left_at = NULL, joined_at = now();

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_gupshup_call(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_gupshup_call(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_gupshup_call(p_call_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_remaining INT;
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.gupshup_call_participants SET left_at = now()
  WHERE call_id = p_call_id AND user_id = v_me AND left_at IS NULL;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT count(*) INTO v_remaining FROM public.gupshup_call_participants
  WHERE call_id = p_call_id AND left_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE public.gupshup_calls SET status = 'ended', ended_at = now() WHERE id = p_call_id AND status = 'active';
  END IF;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.leave_gupshup_call(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_gupshup_call(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_gupshup_call_mute(p_call_id UUID, p_muted BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN FALSE; END IF;
  UPDATE public.gupshup_call_participants SET is_muted = p_muted
  WHERE call_id = p_call_id AND user_id = v_me AND left_at IS NULL;
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_gupshup_call_mute(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_gupshup_call_mute(UUID, BOOLEAN) TO authenticated;

-- ── REALTIME ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gupshup_groups') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gupshup_groups;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gupshup_calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gupshup_calls;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gupshup_call_participants') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gupshup_call_participants;
  END IF;
END $$;
