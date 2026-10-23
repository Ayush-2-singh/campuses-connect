-- ═══════════════════════════════════════════════════════════════════════════
-- 063 — ROOM QUALITY: persistent chat + reports
--
-- The in-call chat used to live only on the LiveKit data channel, so a late
-- joiner saw an empty thread and every link shared before they arrived was
-- lost. This table keeps the last lines of a session so the panel can load
-- history when it opens. It is scoped to the room (and its call), never to the
-- whole platform.
--
-- Reports give a member a way to flag a room (or a person in it) without
-- needing the room's admin to be online.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.live_voice_chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID NOT NULL REFERENCES public.live_voice_chat_calls(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES public.live_voice_chat_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lvc_messages_call ON public.live_voice_chat_messages(call_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lvc_messages_group ON public.live_voice_chat_messages(group_id, created_at);

ALTER TABLE public.live_voice_chat_messages ENABLE ROW LEVEL SECURITY;

-- Read: only people who belong to the room.
DROP POLICY IF EXISTS "lvc_messages_select" ON public.live_voice_chat_messages;
CREATE POLICY "lvc_messages_select" ON public.live_voice_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.live_voice_chat_members m
      WHERE m.group_id = live_voice_chat_messages.group_id
        AND m.user_id = auth.uid()
    )
  );

-- Write: your own line, in a room you are a member of.
DROP POLICY IF EXISTS "lvc_messages_insert" ON public.live_voice_chat_messages;
CREATE POLICY "lvc_messages_insert" ON public.live_voice_chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.live_voice_chat_members m
      WHERE m.group_id = live_voice_chat_messages.group_id
        AND m.user_id = auth.uid()
    )
  );

-- ── Reports ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_voice_chat_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.live_voice_chat_groups(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- null = the room itself
  reason       TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lvc_reports_group ON public.live_voice_chat_reports(group_id, created_at);

ALTER TABLE public.live_voice_chat_reports ENABLE ROW LEVEL SECURITY;

-- A member files a report; only the reporter can read it back. Admins read
-- every report through the service-role client (the admin console).
DROP POLICY IF EXISTS "lvc_reports_insert" ON public.live_voice_chat_reports;
CREATE POLICY "lvc_reports_insert" ON public.live_voice_chat_reports
  FOR INSERT WITH CHECK (
    reporter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.live_voice_chat_members m
      WHERE m.group_id = live_voice_chat_reports.group_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lvc_reports_select_own" ON public.live_voice_chat_reports;
CREATE POLICY "lvc_reports_select_own" ON public.live_voice_chat_reports
  FOR SELECT USING (reporter_id = auth.uid());
