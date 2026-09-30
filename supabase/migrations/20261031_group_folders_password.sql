-- 20261031_group_folders_password.sql
--
-- GROUPS v2 — the gaps the first cut shipped without:
--
--   1. PASSWORD-PROTECTED GROUPS. visibility='private' has existed since 017,
--      but join_group_by_code never asked for a password — a "private" group
--      was exactly as joinable as an open one. Now create_user_group and
--      update_user_group take a password (pgcrypto bf hash, min 4 chars) and
--      join_group_by_code(p_code, p_password) demands it.
--      The hash lives in a ZERO-POLICY table (group_passwords) so the public
--      communities read path (20261026 anon SELECT USING(true)) can never
--      leak it — same pattern as the private voice rooms.
--
--   2. FOLDERS — Telegram-style personal sections. A folder belongs to ONE
--      user (group_folders), groups are filed into it via
--      communities.folder_id, and the Groups page renders tabs. Folders are
--      a VIEW, not a permission: they only organise the My Groups list, so
--      any approved member can file any group they are in.
--
--   3. OWNER CONTROLS — rename/re-icon/re-visibility (update_user_group),
--      invite-code regeneration (regenerate_group_invite) and full delete
--      with cascade (delete_user_group). Until now a creator could never
--      rename or remove their own group.
--
-- Everything is ADDITIVE. Idempotent. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. Password store — RLS on, ZERO policies: invisible to every client role.
--    Only the SECURITY DEFINER RPCs below ever read or write it.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.group_passwords (
  community_id  UUID PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_passwords ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.group_passwords FROM anon, authenticated;

-- ============================================================================
-- 2. Folders — personal, per-user sections (Telegram folder analogy)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.group_folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 30),
  emoji      TEXT,
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One folder name per user (case-insensitive) — no duplicate tabs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_folders_user_name
  ON public.group_folders (user_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_group_folders_user_sort
  ON public.group_folders (user_id, sort_order);

ALTER TABLE public.group_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS folders_select_own ON public.group_folders;
CREATE POLICY folders_select_own ON public.group_folders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS folders_insert_own ON public.group_folders;
CREATE POLICY folders_insert_own ON public.group_folders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS folders_update_own ON public.group_folders;
CREATE POLICY folders_update_own ON public.group_folders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS folders_delete_own ON public.group_folders;
CREATE POLICY folders_delete_own ON public.group_folders
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- The filing column: which of MY folders a group sits in. NULL = unfilled.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.group_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_communities_folder
  ON public.communities (folder_id)
  WHERE folder_id IS NOT NULL;

-- ============================================================================
-- 3. CREATE — gains p_password + p_folder_id (replaces the 4-arg version)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_user_group(
  p_name        TEXT,
  p_description TEXT DEFAULT NULL,
  p_visibility  TEXT DEFAULT 'open',
  p_icon        TEXT DEFAULT NULL,
  p_password    TEXT DEFAULT NULL,
  p_folder_id   UUID DEFAULT NULL
)
RETURNS TEXT  -- the new community key (chat slug)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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

-- Retire the old signatures so no stale client can bypass the password.
DROP FUNCTION IF EXISTS public.create_user_group(TEXT, TEXT, TEXT, TEXT);

-- ============================================================================
-- 4. JOIN — gains p_password; private groups must present it (replaces 1-arg)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code TEXT, p_password TEXT DEFAULT NULL)
RETURNS TEXT  -- 'joined' | 'pending' | 'full' | 'not_found' | 'already' | 'wrong_password' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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

DROP FUNCTION IF EXISTS public.join_group_by_code(TEXT);

-- ============================================================================
-- 5. UPDATE — creator-only: rename, re-icon, describe, re-visibility, password
--    p_password semantics: NULL = keep, '' = remove, text = set/change.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_user_group(
  p_community_id UUID,
  p_name         TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT NULL,
  p_icon         TEXT DEFAULT NULL,
  p_visibility   TEXT DEFAULT NULL,
  p_password     TEXT DEFAULT NULL
)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'password_required' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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

-- ============================================================================
-- 6. FOLDER — any approved member files any group they are in (a view, not
--    permission); p_folder_id NULL = unfiling. The folder must be the
--    caller's own.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_group_folder(p_community_id UUID, p_folder_id UUID)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN 'error'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_members cm
     JOIN public.communities c ON c.id = cm.community_id
     WHERE cm.community_id = p_community_id
       AND cm.user_id = v_me
       AND cm.status = 'approved'
       AND c.is_global = FALSE
  ) THEN
    RETURN 'forbidden';
  END IF;

  IF p_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.group_folders WHERE id = p_folder_id AND user_id = v_me
  ) THEN
    RETURN 'invalid';
  END IF;

  UPDATE public.communities SET folder_id = p_folder_id WHERE id = p_community_id;
  RETURN 'ok';
END $fn$;
REVOKE EXECUTE ON FUNCTION public.set_group_folder(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_group_folder(UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. INVITE REGENERATION — creator only. The old code dies with the call.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.regenerate_group_invite(p_community_id UUID)
RETURNS TEXT  -- the new code, or NULL when not allowed
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me     UUID := auth.uid();
  v_ok     BOOLEAN;
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     TEXT;
  i        INT;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.communities
     WHERE id = p_community_id AND is_global = FALSE AND created_by = v_me
  ) INTO v_ok;
  IF NOT v_ok THEN RETURN NULL; END IF;

  LOOP
    code := 'CC-GRP-';
    FOR i IN 1..4 LOOP
      code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.communities WHERE invite_code = code);
  END LOOP;

  UPDATE public.communities SET invite_code = code WHERE id = p_community_id;
  RETURN code;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.regenerate_group_invite(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerate_group_invite(UUID) TO authenticated;

-- ============================================================================
-- 8. DELETE — creator only. Cascades members, messages, reactions, mutes,
--    read state (every chat table references communities ON DELETE CASCADE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_user_group(p_community_id UUID)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN 'error'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.communities WHERE id = p_community_id AND is_global = FALSE
  ) THEN
    RETURN 'invalid';
  END IF;

  DELETE FROM public.communities
   WHERE id = p_community_id AND is_global = FALSE AND created_by = v_me;

  IF NOT FOUND THEN RETURN 'forbidden'; END IF;
  RETURN 'ok';
END $fn$;
REVOKE EXECUTE ON FUNCTION public.delete_user_group(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_user_group(UUID) TO authenticated;
