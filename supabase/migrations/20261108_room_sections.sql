-- 20261108_room_sections.sql
--
-- ROOM SECTIONS — real topics at creation time.
--
-- Room creation used to offer five sections (dsa / discussion / web-dev /
-- english / random), so a student opening a Java, Python, SQL or AI/ML room
-- had nothing honest to file it under. This widens the accepted `section`
-- values to the topic taxonomy the create form now presents (Games / Learn /
-- Language / Discuss / Build → DSA, Web Dev, Java, Python, …).
--
--   a) the CHECK constraint on live_voice_chat_groups.section is replaced;
--   b) create_live_voice_chat_group() accepts the same list, recreated from
--      the 20261102 body (pgcrypto schema-qualified, search_path intact) so
--      that fix is not regressed.
--
-- Must match ROOM_SECTIONS in src/lib/rooms.ts — the RPC rewrites anything
-- else to 'random', so a value missing here silently loses its topic.
--
-- Idempotent. Safe to re-run.

-- ── a) widen the CHECK ──────────────────────────────────────────────────────

ALTER TABLE public.live_voice_chat_groups
  DROP CONSTRAINT IF EXISTS live_voice_chat_groups_section_check;

ALTER TABLE public.live_voice_chat_groups
  DROP CONSTRAINT IF EXISTS live_voice_chat_groups_section_chk;

ALTER TABLE public.live_voice_chat_groups
  ADD CONSTRAINT live_voice_chat_groups_section_chk CHECK (section IN (
    -- Games
    'random', 'quiz', 'truth-dare', 'social',
    -- Learn
    'dsa', 'web-dev', 'java', 'python', 'cpp', 'sql', 'ai-ml', 'mobile', 'interview',
    -- Language
    'english', 'hindi', 'spanish',
    -- Discuss
    'discussion', 'startup',
    -- Build
    'project', 'hackathon'
  ));

-- ── b) create RPC — same body as 20261102, wider accepted list ──────────────

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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_me UUID := auth.uid();
        v_campus UUID;
        v_group UUID;
        v_section TEXT := coalesce(nullif(trim(p_section), ''), 'random');
BEGIN
  IF v_me IS NULL OR p_scope NOT IN ('campus', 'global') THEN RETURN NULL; END IF;
  IF char_length(trim(coalesce(p_name, ''))) < 3 THEN RETURN NULL; END IF;
  IF v_section NOT IN (
    'random', 'quiz', 'truth-dare', 'social',
    'dsa', 'web-dev', 'java', 'python', 'cpp', 'sql', 'ai-ml', 'mobile', 'interview',
    'english', 'hindi', 'spanish',
    'discussion', 'startup',
    'project', 'hackathon'
  ) THEN
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
