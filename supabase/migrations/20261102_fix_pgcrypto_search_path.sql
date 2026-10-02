-- ============================================================
-- 20261102_fix_pgcrypto_search_path.sql
--
-- Fixes "function gen_salt(unknown, integer) does not exist" at runtime.
--
-- Root cause: pgcrypto is installed in the `extensions` schema on this
-- project, but the voice private-rooms (20260929) and group folders
-- (20261031) functions declare `SET search_path = public` and then call
-- crypt()/gen_salt() unqualified. Postgres cannot resolve those symbols at
-- plan time, so in production:
--   * create_live_voice_chat_group → always failed (even for public rooms)
--   * create_user_group / join_group_by_code / update_user_group
--     (password branches) → failed whenever a password was involved
--
-- Fix: recreate the affected functions VERBATIM from their defining
-- migrations (20260929_voice_private_rooms.sql, 20261031_group_folders_
-- password.sql) with only the pgcrypto calls schema-qualified. Schema
-- qualification is the robust pattern for SECURITY DEFINER functions
-- regardless of search_path.
-- ============================================================

-- ═════════════════════════════════════════════════════════════
-- Voice rooms (bodies from 20260929_voice_private_rooms.sql)
-- ═════════════════════════════════════════════════════════════

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

CREATE OR REPLACE FUNCTION public.join_live_voice_chat_group(
  p_group_id UUID,
  p_password TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
    RETURN TRUE;
  END IF;

  IF v_is_private THEN
    IF v_hash IS NULL OR p_password IS NULL OR crypt(p_password, v_hash) <> v_hash THEN
      RETURN FALSE;
    END IF;
  END IF;

  INSERT INTO public.live_voice_chat_members (group_id, user_id, role)
  VALUES (p_group_id, v_me, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_live_voice_chat_group(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_live_voice_chat_group(UUID, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════
-- User groups (bodies from 20261031_group_folders_password.sql)
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_user_group(
  p_name        TEXT,
  p_description TEXT DEFAULT NULL,
  p_visibility  TEXT DEFAULT 'open',
  p_icon        TEXT DEFAULT NULL,
  p_password    TEXT DEFAULT NULL,
  p_folder_id   UUID DEFAULT NULL
)
RETURNS TEXT  -- the new community key (chat slug)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fn$
DECLARE
  v_uid  UUID := auth.uid();
  v_campus UUID;
  v_key  TEXT;
  v_base TEXT;
  v_id   UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' OR length(btrim(p_name)) > 60 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF p_visibility NOT IN ('open', 'approval', 'private') THEN
    RAISE EXCEPTION 'invalid_visibility';
  END IF;
  -- A locked group without a usable password would be joinable by nobody.
  IF p_visibility = 'private' AND (p_password IS NULL OR char_length(btrim(p_password)) < 4) THEN
    RAISE EXCEPTION 'password_required';
  END IF;
  IF p_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.group_folders WHERE id = p_folder_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'invalid_folder';
  END IF;

  SELECT campus_id INTO v_campus FROM public.profiles WHERE id = v_uid;

  v_base := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := btrim(v_base, '-');
  IF v_base = '' OR v_base IS NULL THEN v_base := 'group'; END IF;
  v_key := v_base;
  WHILE EXISTS (SELECT 1 FROM public.communities WHERE key = v_key) LOOP
    v_key := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.communities (key, name, description, icon, is_global, is_active, visibility, created_by, campus_id, member_cap, folder_id)
  VALUES (v_key, btrim(p_name), p_description, p_icon, FALSE, TRUE, p_visibility, v_uid, v_campus, 200,
          CASE WHEN p_folder_id IS NOT NULL THEN p_folder_id END)
  RETURNING id INTO v_id;

  INSERT INTO public.community_members (community_id, user_id, role, status)
  VALUES (v_id, v_uid, 'admin', 'approved');

  IF p_visibility = 'private' THEN
    INSERT INTO public.group_passwords (community_id, password_hash)
    VALUES (v_id, crypt(btrim(p_password), gen_salt('bf', 10)));
  END IF;

  RETURN v_key;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.create_user_group(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_user_group(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code TEXT, p_password TEXT DEFAULT NULL)
RETURNS TEXT  -- 'joined' | 'pending' | 'full' | 'not_found' | 'already' | 'wrong_password' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fn$
DECLARE
  v_uid  UUID := auth.uid();
  v_id   UUID;
  v_vis  TEXT;
  v_cnt  INT;
  v_cap  INT;
  v_hash TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN 'error'; END IF;

  SELECT c.id, c.visibility, c.member_cap,
    (SELECT COUNT(*) FROM public.community_members m
      WHERE m.community_id = c.id AND m.status = 'approved')
    INTO v_id, v_vis, v_cap, v_cnt
  FROM public.communities c
  WHERE upper(btrim(p_code)) = c.invite_code AND c.is_active
  LIMIT 1;

  IF v_id IS NULL THEN RETURN 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.community_members WHERE community_id = v_id AND user_id = v_uid) THEN
    RETURN 'already';
  END IF;

  -- The password is checked BEFORE the cap so a stranger learns nothing
  -- about the room from a rejected attempt.
  IF v_vis = 'private' THEN
    SELECT password_hash INTO v_hash FROM public.group_passwords WHERE community_id = v_id;
    IF v_hash IS NULL OR p_password IS NULL OR crypt(btrim(p_password), v_hash) <> v_hash THEN
      RETURN 'wrong_password';
    END IF;
  END IF;

  IF v_cnt >= v_cap THEN RETURN 'full'; END IF;

  IF v_vis = 'approval' THEN
    INSERT INTO public.community_members (community_id, user_id, status) VALUES (v_id, v_uid, 'pending');
    RETURN 'pending';
  END IF;
  INSERT INTO public.community_members (community_id, user_id, status) VALUES (v_id, v_uid, 'approved');
  RETURN 'joined';
END $fn$;
REVOKE EXECUTE ON FUNCTION public.join_group_by_code(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_group_by_code(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_user_group(
  p_community_id UUID,
  p_name         TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT NULL,
  p_icon         TEXT DEFAULT NULL,
  p_visibility   TEXT DEFAULT NULL,
  p_password     TEXT DEFAULT NULL
)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'password_required' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fn$
DECLARE
  v_me      UUID := auth.uid();
  v_group   public.communities%ROWTYPE;
  v_new_vis TEXT;
  v_has_hash BOOLEAN;
BEGIN
  IF v_me IS NULL THEN RETURN 'error'; END IF;

  SELECT * INTO v_group FROM public.communities
   WHERE id = p_community_id AND is_global = FALSE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF v_group.created_by <> v_me THEN RETURN 'forbidden'; END IF;

  IF p_name IS NOT NULL AND (btrim(p_name) = '' OR length(btrim(p_name)) > 60) THEN
    RETURN 'invalid';
  END IF;
  IF p_visibility IS NOT NULL AND p_visibility NOT IN ('open', 'approval', 'private') THEN
    RETURN 'invalid';
  END IF;

  v_new_vis := COALESCE(p_visibility, v_group.visibility);
  SELECT EXISTS (SELECT 1 FROM public.group_passwords WHERE community_id = p_community_id)
    INTO v_has_hash;

  -- A private group must end up WITH a password: either it already has one,
  -- or this call sets one. Removing it while private is refused.
  IF v_new_vis = 'private' THEN
    IF p_password = '' THEN RETURN 'password_required'; END IF;
    IF (p_password IS NULL OR char_length(btrim(p_password)) < 4) AND NOT v_has_hash THEN
      RETURN 'password_required';
    END IF;
  END IF;

  UPDATE public.communities SET
    name        = COALESCE(NULLIF(btrim(p_name), ''), name),
    description = CASE WHEN p_description IS NULL THEN description
                       WHEN btrim(p_description) = '' THEN NULL
                       ELSE btrim(p_description) END,
    icon        = COALESCE(p_icon, icon),
    visibility  = v_new_vis
   WHERE id = p_community_id;

  IF p_password IS NOT NULL THEN
    IF btrim(p_password) = '' THEN
      DELETE FROM public.group_passwords WHERE community_id = p_community_id;
    ELSIF char_length(btrim(p_password)) >= 4 THEN
      INSERT INTO public.group_passwords (community_id, password_hash)
      VALUES (p_community_id, crypt(btrim(p_password), gen_salt('bf', 10)))
      ON CONFLICT (community_id) DO UPDATE
        SET password_hash = EXCLUDED.password_hash, updated_at = now();
    END IF;
  END IF;

  RETURN 'ok';
END $fn$;
REVOKE EXECUTE ON FUNCTION public.update_user_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_user_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- NOTE: no self-tracking INSERT here — the apply-* scripts record the
-- migration themselves (a file-level INSERT collides with the script's).
