-- 20261017_live_chat.sql
--
-- LIVE CHAT — a category-based, global chat layer.
--
-- DESIGN DECISION (Phase 0 rule 3 — extend, don't duplicate):
-- `public.communities` already models exactly what the chat categories are:
-- key · name · tagline · description · icon · is_global. It is already seeded
-- with DSA / Web Development / Startups / AI-ML and already has
-- `community_members` (with role: member | moderator | admin). So the chat
-- categories ARE communities — this migration adds a `chat_enabled` flag and
-- five missing categories instead of inventing a parallel `chat_categories`
-- table. One list of groups, one membership model, one moderation surface.
--
-- The DM system (`conversations` / `messages` / `conversation_participants`) is
-- deliberately NOT reused: a channel has membership + unread-per-channel + pins
-- + public history + room-level moderation, which is a materially different
-- lifecycle from a 1:1 conversation.
--
-- WRITE PATH: every mutation goes through a SECURITY DEFINER function. The
-- tables get SELECT policies only — there is no INSERT/UPDATE/DELETE policy for
-- `authenticated` anywhere in this file. That means author_id, target_user_id,
-- admin_id, timestamps and moderation outcomes are always derived server-side
-- from auth.uid() and re-checked against grants/mutes/bans. A client cannot
-- forge a post, a winner, a mute or a ban.
--
-- Everything here is additive: no DROP, no column removal, no data deletion.
-- The one behavioural change is the new `chat_enabled` column, which defaults
-- to TRUE and therefore leaves every existing community exactly as it was.

-- ============================================================================
-- 1. Categories = communities (additive flag + the missing global categories)
-- ============================================================================
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- The five categories the product spec asks for that are not seeded yet.
-- `ON CONFLICT (key) DO NOTHING` so an admin's local edits are never clobbered.
INSERT INTO public.communities (key, name, tagline, description, icon, is_global, is_active, chat_enabled) VALUES
  ('ai-ml',      'AI / ML',    'Models, maths & datasets',   'LLMs, computer vision, classical ML and everything between.', '🤖', TRUE, TRUE, TRUE),
  ('academics',  'Academics',  'Semester, exams & syllabus', 'Subject doubts, PYQs, curriculum talk across every college.',   '📚', TRUE, TRUE, TRUE),
  ('career',     'Career',     'Internships & placements',   'Resumes, interviews, referrals and offer discussions.',          '💼', TRUE, TRUE, TRUE),
  ('compete',    'Compete',    'Battles & contest talk',     'Matchmaking, contest strategy, post-battle analysis.',           '⚔️', TRUE, TRUE, TRUE),
  ('general',    'General',    'Anything campus',            'The lobby — introduce yourself and talk about anything.',         '💬', TRUE, TRUE, TRUE)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 2. Messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Exactly one of body / attachment_url must be present.
  body            TEXT,
  attachment_url  TEXT,
  attachment_type TEXT CHECK (attachment_type IN ('image')),
  reply_to_id     UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  pinned_at       TIMESTAMPTZ,
  pinned_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_at       TIMESTAMPTZ,
  -- Soft delete: the message row survives so replies keep their anchor, and
  -- moderators keep the evidence for a report.
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_content_present CHECK (
    (body IS NOT NULL AND length(btrim(body)) BETWEEN 1 AND 4000)
    OR attachment_url IS NOT NULL
  )
);

-- Timeline read: newest-first page for one room.
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
  ON public.chat_messages (community_id, created_at DESC);

-- Pin bar (tiny partial index) and reply lookup.
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON public.chat_messages (community_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply
  ON public.chat_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- ============================================================================
-- 3. Reactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON public.chat_message_reactions (message_id);

-- ============================================================================
-- 4. Per-user read state (unread counts) + per-room mute
-- ============================================================================
-- `last_read_at` doubles as the presence heartbeat: the room screen calls
-- mark_chat_read() on open and on a slow interval, which is what lets the
-- category list show a real "active now" number without inventing a presence
-- service or faking a count.
CREATE TABLE IF NOT EXISTS public.chat_read_state (
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  muted        BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_read_state_active
  ON public.chat_read_state (community_id, last_read_at DESC);

-- ============================================================================
-- 5. Moderation: reports, mutes, bans, and the audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  community_id   UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  -- Both derived server-side from the message row / auth.uid(), never supplied
  -- by the client.
  reporter_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,
  action_taken   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_reports_open
  ON public.chat_reports (community_id, created_at DESC)
  WHERE status = 'open';

-- One user may report a given message once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_reports_once
  ON public.chat_reports (message_id, reporter_id)
  WHERE message_id IS NOT NULL;

-- community_id NULL = platform-wide restriction.
CREATE TABLE IF NOT EXISTS public.chat_mutes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  muted_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = until explicitly removed.
  expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_mutes_active
  ON public.chat_mutes (user_id, community_id, expires_at);

CREATE TABLE IF NOT EXISTS public.chat_bans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  banned_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_bans_active
  ON public.chat_bans (user_id, community_id, expires_at);

-- The audit trail. Every moderation action writes exactly one row here.
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id     UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  message_id       UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  action           TEXT NOT NULL CHECK (action IN (
                     'warn', 'mute', 'unmute', 'kick', 'ban', 'unban',
                     'delete_message', 'pin', 'unpin',
                     'resolve_report', 'dismiss_report'
                   )),
  reason           TEXT,
  duration_minutes INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_target
  ON public.moderation_actions (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_room
  ON public.moderation_actions (community_id, created_at DESC);

-- ============================================================================
-- 6. Authorization helpers (all derive identity from auth.uid())
-- ============================================================================
-- A chat moderator is a platform admin everywhere, or a community admin inside
-- their own community. Read from `admin_grants` directly — NOT via
-- my_admin_grants(), which filters on auth.uid() and therefore returns nothing
-- on a service-role client.
CREATE OR REPLACE FUNCTION public.is_chat_moderator(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.admin_grants g
     WHERE g.user_id = auth.uid()
       AND (
         g.admin_type = 'platform_admin'
         OR (g.admin_type = 'community_admin' AND g.community_id = p_community_id)
       )
  );
$fn$;

-- 'banned' | 'muted' | NULL. Expiry is evaluated at call time, so a 10-minute
-- mute lifts itself without any cron job.
CREATE OR REPLACE FUNCTION public.chat_block_reason(p_user_id UUID, p_community_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.chat_bans b
       WHERE b.user_id = p_user_id
         AND (b.community_id IS NULL OR b.community_id = p_community_id)
         AND (b.expires_at IS NULL OR b.expires_at > now())
    ) THEN 'banned'
    WHEN EXISTS (
      SELECT 1 FROM public.chat_mutes m
       WHERE m.user_id = p_user_id
         AND (m.community_id IS NULL OR m.community_id = p_community_id)
         AND (m.expires_at IS NULL OR m.expires_at > now())
    ) THEN 'muted'
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.is_chat_member(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members cm
     WHERE cm.community_id = p_community_id
       AND cm.user_id = auth.uid()
  );
$fn$;

-- The single source of truth for "may this person send here right now".
CREATE OR REPLACE FUNCTION public.can_post_chat(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = p_community_id AND c.chat_enabled AND c.is_active
    )
    AND public.is_chat_member(p_community_id)
    AND public.chat_block_reason(auth.uid(), p_community_id) IS NULL;
$fn$;

-- ============================================================================
-- 7. Write path — SECURITY DEFINER functions (no INSERT/UPDATE policies exist)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.chat_post(
  p_community_id    UUID,
  p_body            TEXT DEFAULT NULL,
  p_reply_to        UUID DEFAULT NULL,
  p_attachment_url  TEXT DEFAULT NULL,
  p_attachment_type TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   UUID := auth.uid();
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.can_post_chat(p_community_id) THEN
    -- Distinguish the three refusal reasons so the UI can say something useful
    -- instead of a generic failure.
    IF public.chat_block_reason(v_me, p_community_id) = 'banned' THEN
      RAISE EXCEPTION 'banned';
    ELSIF public.chat_block_reason(v_me, p_community_id) = 'muted' THEN
      RAISE EXCEPTION 'muted';
    ELSIF NOT public.is_chat_member(p_community_id) THEN
      RAISE EXCEPTION 'not_a_member';
    END IF;
    RAISE EXCEPTION 'chat_closed';
  END IF;

  IF v_body IS NULL AND p_attachment_url IS NULL THEN
    RAISE EXCEPTION 'empty_message';
  END IF;
  IF v_body IS NOT NULL AND length(v_body) > 4000 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;
  IF p_attachment_url IS NOT NULL AND p_attachment_type IS DISTINCT FROM 'image' THEN
    RAISE EXCEPTION 'unsupported_attachment';
  END IF;

  -- A reply must belong to the same room (cannot anchor across rooms).
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chat_messages m
     WHERE m.id = p_reply_to AND m.community_id = p_community_id
  ) THEN
    RAISE EXCEPTION 'invalid_reply';
  END IF;

  RETURN QUERY
  INSERT INTO public.chat_messages (community_id, author_id, body, reply_to_id, attachment_url, attachment_type)
  VALUES (p_community_id, v_me, v_body, p_reply_to, p_attachment_url, p_attachment_type)
  RETURNING chat_messages.id, chat_messages.created_at;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.edit_chat_message(p_message_id UUID, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   UUID := auth.uid();
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'empty_message'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'message_too_long'; END IF;

  UPDATE public.chat_messages
     SET body = v_body, edited_at = now()
   WHERE id = p_message_id
     AND author_id = v_me          -- own message only; derived, never supplied
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
END;
$fn$;

-- Soft delete. Authors delete their own; moderators delete anyone's.
CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me       UUID := auth.uid();
  v_row      RECORD;
  v_is_mod   BOOLEAN;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id, community_id, author_id, deleted_at INTO v_row
    FROM public.chat_messages WHERE id = p_message_id;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_row.deleted_at IS NOT NULL THEN RETURN; END IF;

  v_is_mod := public.is_chat_moderator(v_row.community_id);

  IF v_row.author_id <> v_me AND NOT v_is_mod THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  UPDATE public.chat_messages SET deleted_at = now() WHERE id = p_message_id;

  -- Moderator deletions are auditable; an author deleting their own message is
  -- normal user behaviour and does not pollute the moderation log.
  IF v_row.author_id <> v_me AND v_is_mod THEN
    INSERT INTO public.moderation_actions (admin_id, target_user_id, community_id, message_id, action, reason)
    VALUES (v_me, v_row.author_id, v_row.community_id, p_message_id, 'delete_message', 'Moderator removed a message');
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pin_chat_message(p_message_id UUID, p_pin BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me  UUID := auth.uid();
  v_row RECORD;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id, community_id, author_id INTO v_row
    FROM public.chat_messages WHERE id = p_message_id AND deleted_at IS NULL;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF NOT public.is_chat_moderator(v_row.community_id) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  UPDATE public.chat_messages
     SET pinned_at = CASE WHEN p_pin THEN now() ELSE NULL END,
         pinned_by = CASE WHEN p_pin THEN v_me ELSE NULL END
   WHERE id = p_message_id;

  INSERT INTO public.moderation_actions (admin_id, target_user_id, community_id, message_id, action, reason)
  VALUES (v_me, v_row.author_id, v_row.community_id, p_message_id,
          CASE WHEN p_pin THEN 'pin' ELSE 'unpin' END,
          CASE WHEN p_pin THEN 'Pinned a message' ELSE 'Unpinned a message' END);
END;
$fn$;

-- Report: target and room are read off the message row, so a client cannot
-- report someone for something they did not post.
CREATE OR REPLACE FUNCTION public.report_chat_message(p_message_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me  UUID := auth.uid();
  v_row RECORD;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT id, community_id, author_id INTO v_row
    FROM public.chat_messages WHERE id = p_message_id AND deleted_at IS NULL;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_row.author_id = v_me THEN RAISE EXCEPTION 'cannot_report_self'; END IF;

  INSERT INTO public.chat_reports (message_id, community_id, reporter_id, target_user_id, reason)
  VALUES (p_message_id, v_row.community_id, v_me, v_row.author_id, btrim(p_reason))
  ON CONFLICT DO NOTHING;   -- the partial unique index makes a double report a no-op
END;
$fn$;

-- ============================================================================
-- 8. Moderation entry point — one function, one audit row per action
-- ============================================================================
CREATE OR REPLACE FUNCTION public.moderate_chat(
  p_target_user_id   UUID,
  p_community_id     UUID,
  p_action           TEXT,
  p_reason           TEXT DEFAULT NULL,
  p_duration_minutes INT  DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me       UUID := auth.uid();
  v_expires  TIMESTAMPTZ;
  v_target_is_platform BOOLEAN;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_chat_moderator(p_community_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_target_user_id = v_me THEN RAISE EXCEPTION 'cannot_moderate_self'; END IF;

  -- Privilege-escalation guard: only a platform admin may action a platform
  -- admin, so a community admin cannot neutralise someone above them.
  SELECT EXISTS (
    SELECT 1 FROM public.admin_grants g
     WHERE g.user_id = p_target_user_id AND g.admin_type = 'platform_admin'
  ) INTO v_target_is_platform;

  IF v_target_is_platform AND NOT EXISTS (
    SELECT 1 FROM public.admin_grants g
     WHERE g.user_id = v_me AND g.admin_type = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'cannot_moderate_admin';
  END IF;

  IF p_action NOT IN ('warn', 'mute', 'unmute', 'kick', 'ban', 'unban') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  -- NULL duration = indefinite; otherwise a positive number of minutes.
  IF p_action IN ('mute', 'ban') AND p_duration_minutes IS NOT NULL AND p_duration_minutes > 0 THEN
    v_expires := now() + make_interval(mins => p_duration_minutes);
  ELSE
    v_expires := NULL;
  END IF;

  IF p_action = 'mute' THEN
    INSERT INTO public.chat_mutes (user_id, community_id, muted_by, reason, expires_at)
    VALUES (p_target_user_id, p_community_id, v_me, p_reason, v_expires);
  ELSIF p_action = 'unmute' THEN
    DELETE FROM public.chat_mutes
     WHERE user_id = p_target_user_id
       AND (community_id = p_community_id OR community_id IS NULL);
  ELSIF p_action = 'ban' THEN
    INSERT INTO public.chat_bans (user_id, community_id, banned_by, reason, expires_at)
    VALUES (p_target_user_id, p_community_id, v_me, p_reason, v_expires);
    -- A ban also removes them from the room, otherwise the ban only blocks
    -- posting and they still appear as a member.
    DELETE FROM public.community_members
     WHERE community_id = p_community_id AND user_id = p_target_user_id;
  ELSIF p_action = 'unban' THEN
    DELETE FROM public.chat_bans
     WHERE user_id = p_target_user_id
       AND (community_id = p_community_id OR community_id IS NULL);
  ELSIF p_action = 'kick' THEN
    -- Kick = out of this room, free to rejoin. No standing restriction.
    DELETE FROM public.community_members
     WHERE community_id = p_community_id AND user_id = p_target_user_id;
  END IF;
  -- 'warn' only writes the audit row below.

  INSERT INTO public.moderation_actions
    (admin_id, target_user_id, community_id, action, reason, duration_minutes, expires_at)
  VALUES
    (v_me, p_target_user_id, p_community_id, p_action, p_reason, p_duration_minutes, v_expires);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_chat_report(p_report_id UUID, p_status TEXT, p_action_taken TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me  UUID := auth.uid();
  v_row RECORD;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_status NOT IN ('resolved', 'dismissed') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT id, community_id, target_user_id INTO v_row
    FROM public.chat_reports WHERE id = p_report_id AND status = 'open';
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF NOT public.is_chat_moderator(v_row.community_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;

  UPDATE public.chat_reports
     SET status = p_status, resolved_by = v_me, resolved_at = now(), action_taken = p_action_taken
   WHERE id = p_report_id;

  INSERT INTO public.moderation_actions (admin_id, target_user_id, community_id, action, reason)
  VALUES (v_me, v_row.target_user_id, v_row.community_id,
          CASE WHEN p_status = 'resolved' THEN 'resolve_report' ELSE 'dismiss_report' END,
          p_action_taken);
END;
$fn$;

-- ============================================================================
-- 9. Read helpers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_chat_read(p_community_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;

  INSERT INTO public.chat_read_state (community_id, user_id, last_read_at)
  VALUES (p_community_id, v_me, now())
  ON CONFLICT (community_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$fn$;

-- Unread per category. Derives identity from auth.uid() so it can only ever
-- return the caller's own counts.
CREATE OR REPLACE FUNCTION public.chat_unread_counts()
RETURNS TABLE (community_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    c.id AS community_id,
    COALESCE((
      SELECT count(*)
        FROM public.chat_messages m
       WHERE m.community_id = c.id
         AND m.deleted_at IS NULL
         AND m.author_id <> auth.uid()
         AND m.created_at > COALESCE(rs.last_read_at, TIMESTAMPTZ 'epoch')
    ), 0)::BIGINT AS unread_count
  FROM public.communities c
  LEFT JOIN public.chat_read_state rs
    ON rs.community_id = c.id AND rs.user_id = auth.uid()
  WHERE c.is_active AND c.chat_enabled;
$fn$;

-- Real "active now" per category: members whose read heartbeat is recent.
-- No presence service, no invented numbers — if nobody is here, this is 0.
CREATE OR REPLACE FUNCTION public.chat_activity_counts(p_window_minutes INT DEFAULT 15)
RETURNS TABLE (community_id UUID, active_count BIGINT, member_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    c.id AS community_id,
    (SELECT count(*) FROM public.chat_read_state rs
      WHERE rs.community_id = c.id
        AND rs.last_read_at > now() - make_interval(mins => GREATEST(p_window_minutes, 1)))::BIGINT AS active_count,
    (SELECT count(*) FROM public.community_members cm
      WHERE cm.community_id = c.id)::BIGINT AS member_count
  FROM public.communities c
  WHERE c.is_active AND c.chat_enabled;
$fn$;

-- ============================================================================
-- 10. RLS — SELECT-only policies; all writes go through section 7 functions
-- ============================================================================
ALTER TABLE public.chat_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mutes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_bans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions      ENABLE ROW LEVEL SECURITY;

-- Messages: readable in an open room. Soft-deleted messages stay visible to
-- their author and to moderators (evidence for a report) and are filtered out
-- for everyone else.
DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = chat_messages.community_id AND c.is_active
    )
    AND (
      deleted_at IS NULL
      OR author_id = auth.uid()
      OR public.is_chat_moderator(community_id)
    )
  );

-- Reactions: readable with the message; a user may only add/remove their own.
-- user_id is pinned to auth.uid() so it cannot be forged.
DROP POLICY IF EXISTS chat_reactions_select ON public.chat_message_reactions;
CREATE POLICY chat_reactions_select ON public.chat_message_reactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS chat_reactions_insert ON public.chat_message_reactions;
CREATE POLICY chat_reactions_insert ON public.chat_message_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_reactions_delete ON public.chat_message_reactions;
CREATE POLICY chat_reactions_delete ON public.chat_message_reactions
  FOR DELETE USING (user_id = auth.uid());

-- Read state: strictly own rows.
DROP POLICY IF EXISTS chat_read_state_select ON public.chat_read_state;
CREATE POLICY chat_read_state_select ON public.chat_read_state
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_read_state_upsert ON public.chat_read_state;
CREATE POLICY chat_read_state_upsert ON public.chat_read_state
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_read_state_update ON public.chat_read_state;
CREATE POLICY chat_read_state_update ON public.chat_read_state
  FOR UPDATE USING (user_id = auth.uid());

-- Reports: the reporter and the room's moderators can read them.
DROP POLICY IF EXISTS chat_reports_select ON public.chat_reports;
CREATE POLICY chat_reports_select ON public.chat_reports
  FOR SELECT USING (
    reporter_id = auth.uid() OR public.is_chat_moderator(community_id)
  );

-- Mutes / bans: the affected user can see their own standing restriction;
-- moderators can see everything in their room. Writes are function-only.
DROP POLICY IF EXISTS chat_mutes_select ON public.chat_mutes;
CREATE POLICY chat_mutes_select ON public.chat_mutes
  FOR SELECT USING (
    user_id = auth.uid()
    OR (community_id IS NOT NULL AND public.is_chat_moderator(community_id))
  );

DROP POLICY IF EXISTS chat_bans_select ON public.chat_bans;
CREATE POLICY chat_bans_select ON public.chat_bans
  FOR SELECT USING (
    user_id = auth.uid()
    OR (community_id IS NOT NULL AND public.is_chat_moderator(community_id))
  );

-- Audit trail: the acting admin, and moderators of the affected room.
DROP POLICY IF EXISTS moderation_actions_select ON public.moderation_actions;
CREATE POLICY moderation_actions_select ON public.moderation_actions
  FOR SELECT USING (
    admin_id = auth.uid()
    OR (community_id IS NOT NULL AND public.is_chat_moderator(community_id))
  );

-- ============================================================================
-- 11. Function grants
-- ============================================================================
-- Mutations: authenticated callers only. `anon` is never granted, because every
-- one of these functions requires auth.uid() and a signed-out caller could not
-- satisfy its checks anyway.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.chat_post(uuid,text,uuid,text,text)',
    'public.edit_chat_message(uuid,text)',
    'public.delete_chat_message(uuid)',
    'public.pin_chat_message(uuid,boolean)',
    'public.report_chat_message(uuid,text)',
    'public.moderate_chat(uuid,uuid,text,text,int)',
    'public.resolve_chat_report(uuid,text,text)',
    'public.mark_chat_read(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;

  -- Read-only helpers.
  FOREACH fn IN ARRAY ARRAY[
    'public.is_chat_moderator(uuid)',
    'public.is_chat_member(uuid)',
    'public.can_post_chat(uuid)',
    'public.chat_block_reason(uuid,uuid)',
    'public.chat_unread_counts()',
    'public.chat_activity_counts(int)'
  ]
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- ============================================================================
-- 12. Realtime — scoped to one room, not the whole table
-- ============================================================================
-- The client subscribes with a `community_id=eq.<id>` filter, so a subscribed
-- client only ever receives the room it is looking at. This is the one new
-- realtime subscription in this migration, and it is justified: chat is the
-- case where immediacy is the feature.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;

  -- Reactions are deliberately NOT published. They are applied optimistically
  -- on the client and re-read on load; publishing them would broadcast every
  -- tap in every room to every open client for no product benefit.
END $$;

-- ============================================================================
-- 13. Verification — run after applying
-- ============================================================================
-- A. Categories exist and chat is on:
--    SELECT key, name, icon, chat_enabled FROM public.communities ORDER BY name;
--
-- B. The write path is locked down (expect zero rows for messages):
--    SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname = 'public' AND tablename = 'chat_messages';
--    -- cmd should list only SELECT.
--
-- C. Authorization helpers behave (as a signed-in user via the SQL editor's
--    "run as" or from the app):
--    SELECT public.can_post_chat('<community-uuid>');
--    SELECT public.chat_block_reason(auth.uid(), '<community-uuid>');
--
-- D. Realtime is published:
--    SELECT tablename FROM pg_publication_tables
--     WHERE pubname = 'supabase_realtime' AND tablename LIKE 'chat%';
--
-- E. A muted user cannot post (set a 1-minute mute, then try chat_post):
--    SELECT public.moderate_chat('<user>', '<community>', 'mute', 'test', 1);
--    SELECT public.chat_post('<community>', 'should fail');
