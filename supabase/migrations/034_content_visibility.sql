-- 034: content visibility — Global vs Campus
--
-- Goals:
--  1. Global users (no campus) must NOT see campus/college content — only
--     global content — in opportunities, notes and everywhere else.
--  2. Admins get a switch (app_settings.campus_content_to_global) to open
--     campus content to everyone if they ever want to.
--  3. Profiles get an interaction_scope ('global' | 'campus'): a campus-only
--     profile cannot be connected to / messaged by users outside its campus.
--  4. Campus sections stay branch-restricted (Noida / Lucknow / Pune / ...)
--     — this is inherent: each campus is its own row and every future campus
--     automatically gets the same restriction.

-- ── app_settings (admin-controlled switches) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES ('campus_content_to_global', 'false')
ON CONFLICT (key) DO NOTHING;

-- ── profiles: interaction scope ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interaction_scope text NOT NULL DEFAULT 'global'
  CHECK (interaction_scope IN ('global', 'campus'));

-- True if auth.uid() may request connection / start a chat with p_target_id.
-- A 'campus'-scoped profile is only reachable by someone in the same campus.
CREATE OR REPLACE FUNCTION public.can_interact_with_profile(p_target_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
        v_target RECORD;
        v_me     RECORD;
BEGIN
  IF v_uid IS NULL OR p_target_id IS NULL OR p_target_id = v_uid THEN RETURN FALSE; END IF;

  SELECT interaction_scope, campus_id INTO v_target FROM public.profiles WHERE id = p_target_id;
  IF v_target IS NULL THEN RETURN FALSE; END IF;
  SELECT interaction_scope, campus_id INTO v_me FROM public.profiles WHERE id = v_uid;
  IF v_me IS NULL THEN RETURN FALSE; END IF;

  -- Open profiles are reachable by anyone; campus-only profiles only by the
  -- same campus. Enforce in BOTH directions (my scope vs their campus and
  -- their scope vs my campus).
  IF v_me.interaction_scope = 'campus' THEN
    IF v_me.campus_id IS NULL OR v_me.campus_id IS DISTINCT FROM v_target.campus_id THEN RETURN FALSE; END IF;
  END IF;
  IF v_target.interaction_scope = 'campus' THEN
    IF v_target.campus_id IS NULL OR v_target.campus_id IS DISTINCT FROM v_me.campus_id THEN RETURN FALSE; END IF;
  END IF;

  RETURN TRUE;
END;
$function$;

-- Connections: a campus-only receiver can't receive requests from outside.
DROP POLICY IF EXISTS connections_insert ON public.connections;
CREATE POLICY connections_insert ON public.connections
  FOR INSERT
  WITH CHECK (requester_id = auth.uid() AND public.can_interact_with_profile(receiver_id));

-- DMs: re-check interaction scope at chat time too.
CREATE OR REPLACE FUNCTION public.start_or_get_conversation(p_peer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_me UUID := auth.uid();
        v_conv UUID;
BEGIN
  IF v_me IS NULL OR p_peer_id IS NULL OR p_peer_id = v_me THEN RETURN NULL; END IF;

  -- Interaction scope gate (campus-only profiles).
  IF NOT public.can_interact_with_profile(p_peer_id) THEN RETURN NULL; END IF;

  -- Hard gate: only accepted connections may chat
  IF NOT EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.status = 'accepted'
      AND ((c.requester_id = v_me AND c.receiver_id = p_peer_id)
        OR (c.requester_id = p_peer_id AND c.receiver_id = v_me))
  ) THEN RETURN NULL; END IF;

  -- Existing conversation between exactly these two?
  SELECT c.id INTO v_conv
  FROM public.conversations c
  JOIN public.conversation_participants a ON a.conversation_id = c.id AND a.profile_id = v_me
  JOIN public.conversation_participants b ON b.conversation_id = c.id AND b.profile_id = p_peer_id
  LIMIT 1;
  IF v_conv IS NOT NULL THEN RETURN v_conv; END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv;
  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv, v_me), (v_conv, p_peer_id);

  RETURN v_conv;
END;
$function$;

-- ── opportunities: global vs campus visibility ──────────────────────────────
-- The legacy check only allowed 'campus' | 'college' | 'platform' — drop it
-- BEFORE migrating values, then re-add the new global/campus rule.
ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_visibility_check;
UPDATE public.opportunities SET visibility = 'global' WHERE visibility IN ('platform', 'college');
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_visibility_check CHECK (visibility IN ('global', 'campus'));

CREATE OR REPLACE FUNCTION public.can_view_opportunity(p_opp public.opportunities)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
        v_prof RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  IF p_opp.visibility = 'global' THEN RETURN TRUE; END IF;

  -- Admin switch: open campus content to everyone.
  IF (SELECT value FROM public.app_settings WHERE key = 'campus_content_to_global') = 'true' THEN
    RETURN TRUE;
  END IF;

  SELECT campus_id, college_id INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF v_prof IS NULL THEN RETURN FALSE; END IF;
  IF v_prof.campus_id IS NULL AND v_prof.college_id IS NULL THEN RETURN FALSE; END IF;

  -- Campus-scoped: same campus, or same college when no campus is tied, or
  -- legacy rows with no campus/college (campus users only).
  RETURN (p_opp.campus_id IS NOT NULL AND v_prof.campus_id = p_opp.campus_id)
      OR (p_opp.campus_id IS NULL AND p_opp.college_id IS NOT NULL AND v_prof.college_id = p_opp.college_id)
      OR (p_opp.campus_id IS NULL AND p_opp.college_id IS NULL);
END;
$function$;

DROP POLICY IF EXISTS opportunities_select ON public.opportunities;
CREATE POLICY opportunities_select ON public.opportunities
  FOR SELECT
  USING (public.can_view_opportunity(opportunities));

-- ── notes: global vs campus visibility ──────────────────────────────────────
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'campus'
  CHECK (visibility IN ('global', 'campus'));

CREATE OR REPLACE FUNCTION public.can_view_note(p_note public.notes)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
        v_prof RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  IF p_note.visibility = 'global' THEN RETURN TRUE; END IF;

  IF (SELECT value FROM public.app_settings WHERE key = 'campus_content_to_global') = 'true' THEN
    RETURN TRUE;
  END IF;

  SELECT campus_id, college_id INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF v_prof IS NULL THEN RETURN FALSE; END IF;
  IF v_prof.campus_id IS NULL AND v_prof.college_id IS NULL THEN RETURN FALSE; END IF;

  RETURN (p_note.campus_id IS NOT NULL AND v_prof.campus_id = p_note.campus_id)
      OR (p_note.campus_id IS NULL AND p_note.college_id IS NOT NULL AND v_prof.college_id = p_note.college_id)
      OR (p_note.campus_id IS NULL AND p_note.college_id IS NULL);
END;
$function$;

DROP POLICY IF EXISTS notes_select ON public.notes;
CREATE POLICY notes_select ON public.notes
  FOR SELECT
  USING (public.can_view_note(notes));
