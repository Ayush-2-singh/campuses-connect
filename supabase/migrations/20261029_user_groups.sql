-- 20261029_user_groups.sql
--
-- TELEGRAM-STYLE USER GROUPS — students create their own bounded groups
-- (class batch, project team, hostel wing) inside the verified-campus app.
--
-- WHY THIS DESIGN (research-backed, see the conversation):
--   * Groups are CAMPUS-BOUND and capped (member_cap, default 200): 53% of
--     users say digital communities should be ≤200 people (Verge/Vox), and
--     Dunbar's ~150 stable-relationship limit says small is a feature.
--   * Noise control is the retention lever — WhatsApp/Telegram student
--     groups die of irrelevance and notification fatigue. So v1 ships the
--     moderation primitives first: approve/reject joins, remove, promote,
--     and mute that reuses chat_mutes (self-expiring, no cron).
--   * Two join models, creator's choice — both ALREADY EXIST as
--     communities.visibility ('open' | 'approval' | 'private'+password).
--     We add the missing third leg: shareable CC-GRP-XXXX invite codes.
--
-- REUSE, NOT REBUILD: a group IS a communities row (is_global = false) —
--   the whole chat engine (realtime, pins, replies, soft delete) works on
--   it unchanged via /chat/[key]. The chat room's existing is_chat_moderator
--   (admin_grants) keeps governing global rooms; groups use member roles.
--
-- Everything is ADDITIVE: new nullable columns, one partial unique index,
-- permissive (OR) RLS policies, and SECURITY DEFINER RPCs that check the
-- caller's group role. No existing row or policy is touched.

-- ============================================================================
-- 1. Columns
-- ============================================================================
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS member_cap  INT NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

COMMENT ON COLUMN public.communities.member_cap IS
  'Hard member ceiling for user-created groups (research: ≤200). Global rooms may raise it.';
COMMENT ON COLUMN public.communities.invite_code IS
  'Public shareable code (CC-GRP-XXXX) — join_group_by_code() resolves it. NULL for global rooms.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_communities_invite_code
  ON public.communities (invite_code)
  WHERE invite_code IS NOT NULL;

-- Campus binding for discoverability ("groups at my campus"). NULL = global reach.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. Invite code assignment (same confusion-free alphabet as note UIDs)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.groups_assign_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     TEXT;
  i        INT;
BEGIN
  IF NEW.is_global THEN
    NEW.invite_code := NULL; -- global rooms are discovered, not invited
    RETURN NEW;
  END IF;
  IF NEW.invite_code IS NOT NULL THEN
    NEW.invite_code := upper(btrim(NEW.invite_code));
    RETURN NEW;
  END IF;
  LOOP
    code := 'CC-GRP-';
    FOR i IN 1..4 LOOP
      code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.communities WHERE invite_code = code);
  END LOOP;
  NEW.invite_code := code;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_groups_invite_code ON public.communities;
CREATE TRIGGER trg_groups_invite_code
  BEFORE INSERT OR UPDATE OF is_global, invite_code ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.groups_assign_invite_code();

-- ============================================================================
-- 3. RLS — permissive additions only (they OR with existing policies)
-- ============================================================================
-- Any student may CREATE a user group (never a global room).
DROP POLICY IF EXISTS communities_insert_user_group ON public.communities;
CREATE POLICY communities_insert_user_group ON public.communities
  FOR INSERT TO authenticated
  WITH CHECK (is_global = FALSE AND created_by = auth.uid());

-- Group members see their co-members (own-row policy stays for everything else).
DROP POLICY IF EXISTS members_select_costream ON public.community_members;
CREATE POLICY members_select_costream ON public.community_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members me
       WHERE me.community_id = community_members.community_id
         AND me.user_id = auth.uid()
    )
  );

-- Group admins/mods manage membership rows of their group (roles, removal,
-- approval). The creator (communities.created_by) is the ultimate authority;
-- mods may approve/reject but not touch admins.
DROP POLICY IF EXISTS members_manage_by_group_mod ON public.community_members;
CREATE POLICY members_manage_by_group_mod ON public.community_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members me
       JOIN public.communities c ON c.id = me.community_id
       WHERE me.community_id = community_members.community_id
         AND me.user_id = auth.uid()
         AND me.status = 'approved'
         AND c.is_global = FALSE
         AND (
           c.created_by = auth.uid()
           OR (me.role IN ('admin', 'moderator') AND community_members.role <> 'admin')
         )
    )
  );

DROP POLICY IF EXISTS members_remove_by_group_mod ON public.community_members;
CREATE POLICY members_remove_by_group_mod ON public.community_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members me
       JOIN public.communities c ON c.id = me.community_id
       WHERE me.community_id = community_members.community_id
         AND me.user_id = auth.uid()
         AND me.status = 'approved'
         AND c.is_global = FALSE
         AND (
           c.created_by = auth.uid()
           OR (me.role IN ('admin', 'moderator') AND community_members.role <> 'admin')
         )
    )
  );

-- Approved members may add people directly to OPEN groups (approval/private
-- groups go through join_group_by_code / the approval queue).
DROP POLICY IF EXISTS members_add_by_member ON public.community_members;
CREATE POLICY members_add_by_member ON public.community_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR (
      user_id <> auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.community_members me
         JOIN public.communities c ON c.id = me.community_id
         WHERE me.community_id = community_members.community_id
           AND me.user_id = auth.uid()
           AND me.status = 'approved'
           AND c.is_global = FALSE
           AND c.visibility = 'open'
      )
    )
  );

-- ============================================================================
-- 4. RPCs — the whole admin surface, one callable per verb
-- ============================================================================

-- Create a group: community row + invite code + creator as admin member.
-- The key (chat slug) is derived from the name and uniquified.
CREATE OR REPLACE FUNCTION public.create_user_group(p_name TEXT, p_description TEXT DEFAULT NULL, p_visibility TEXT DEFAULT 'open', p_icon TEXT DEFAULT NULL)
RETURNS TEXT  -- the new community key (chat slug)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid     UUID := auth.uid();
  v_campus  UUID;
  v_college UUID;
  v_key     TEXT;
  v_base    TEXT;
  v_id      UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' OR length(btrim(p_name)) > 60 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF p_visibility NOT IN ('open', 'approval', 'private') THEN
    RAISE EXCEPTION 'invalid_visibility';
  END IF;

  SELECT campus_id, college_id INTO v_campus, v_college FROM public.profiles WHERE id = v_uid;

  v_base := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := btrim(v_base, '-');
  IF v_base = '' OR v_base IS NULL THEN v_base := 'group'; END IF;
  v_key := v_base;
  WHILE EXISTS (SELECT 1 FROM public.communities WHERE key = v_key) LOOP
    v_key := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.communities (key, name, description, icon, is_global, is_active, visibility, created_by, campus_id, member_cap)
  VALUES (v_key, btrim(p_name), p_description, p_icon, FALSE, TRUE, p_visibility, v_uid, v_campus, 200)
  RETURNING id INTO v_id;

  INSERT INTO public.community_members (community_id, user_id, role, status)
  VALUES (v_id, v_uid, 'admin', 'approved');

  RETURN v_key;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.create_user_group(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_user_group(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Join by invite code (or by community id for open campus discovery).
-- Enforces the member cap — the ONE hard rule of the feature.
CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code TEXT)
RETURNS TEXT  -- 'joined' | 'pending' | 'full' | 'not_found' | 'already' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
  v_vis TEXT;
  v_cnt INT;
  v_cap INT;
BEGIN
  IF v_uid IS NULL THEN RETURN 'error'; END IF;

  SELECT id, visibility, member_cap,
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
  IF v_cnt >= v_cap THEN RETURN 'full'; END IF;

  IF v_vis = 'approval' THEN
    INSERT INTO public.community_members (community_id, user_id, status) VALUES (v_id, v_uid, 'pending');
    RETURN 'pending';
  END IF;
  INSERT INTO public.community_members (community_id, user_id, status) VALUES (v_id, v_uid, 'approved');
  RETURN 'joined';
END $fn$;
REVOKE EXECUTE ON FUNCTION public.join_group_by_code(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_group_by_code(TEXT) TO authenticated;

-- One RPC for every member action. p_action:
--   'approve' | 'reject' | 'remove' | 'promote' | 'demote' | 'mute' | 'unmute'
-- Authority model: the creator can do everything; admins/mods can approve,
-- reject, remove and mute non-admins. Nobody can touch the creator.
CREATE OR REPLACE FUNCTION public.group_member_action(p_community_id UUID, p_user_id UUID, p_action TEXT, p_hours INT DEFAULT NULL)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me       UUID := auth.uid();
  v_group    public.communities%ROWTYPE;
  v_my_role  TEXT;
  v_target   public.community_members%ROWTYPE;
  v_cnt      INT;
  v_cap      INT;
BEGIN
  IF v_me IS NULL THEN RETURN 'error'; END IF;

  SELECT * INTO v_group FROM public.communities WHERE id = p_community_id AND is_global = FALSE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;

  SELECT role INTO v_my_role FROM public.community_members
   WHERE community_id = p_community_id AND user_id = v_me AND status = 'approved';
  IF v_group.created_by <> v_me AND v_my_role NOT IN ('admin', 'moderator') THEN
    RETURN 'forbidden';
  END IF;

  SELECT * INTO v_target FROM public.community_members
   WHERE community_id = p_community_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF p_user_id = v_group.created_by AND v_me <> v_group.created_by THEN
    RETURN 'forbidden'; -- nobody moderates the creator
  END IF;
  IF p_user_id = v_group.created_by AND p_action IN ('remove', 'demote', 'mute') THEN
    RETURN 'invalid'; -- the creator cannot moderate themselves out
  END IF;
  -- Mods stop at admins; admins stop at admins too (only creator crosses).
  IF v_group.created_by <> v_me AND v_target.role = 'admin' THEN
    RETURN 'forbidden';
  END IF;

  CASE p_action
    WHEN 'approve' THEN
      UPDATE public.community_members SET status = 'approved'
       WHERE community_id = p_community_id AND user_id = p_user_id;
    WHEN 'reject' THEN
      DELETE FROM public.community_members
       WHERE community_id = p_community_id AND user_id = p_user_id AND status = 'pending';
    WHEN 'remove' THEN
      DELETE FROM public.community_members
       WHERE community_id = p_community_id AND user_id = p_user_id;
    WHEN 'promote' THEN
      IF v_group.created_by <> v_me THEN RETURN 'forbidden'; END IF;
      UPDATE public.community_members SET role = 'moderator'
       WHERE community_id = p_community_id AND user_id = p_user_id AND role = 'member';
    WHEN 'demote' THEN
      IF v_group.created_by <> v_me THEN RETURN 'forbidden'; END IF;
      UPDATE public.community_members SET role = 'member'
       WHERE community_id = p_community_id AND user_id = p_user_id AND role = 'moderator';
    WHEN 'mute' THEN
      -- Reuses the chat mute infra: chat_block_reason() reads chat_mutes, so
      -- the muted member cannot post in the group's chat room either.
      INSERT INTO public.chat_mutes (user_id, community_id, muted_by, reason, expires_at)
      VALUES (p_user_id, p_community_id, v_me, 'group moderation',
              CASE WHEN p_hours IS NULL THEN NULL ELSE now() + make_interval(hours => p_hours) END);
    WHEN 'unmute' THEN
      DELETE FROM public.chat_mutes
       WHERE user_id = p_user_id AND community_id = p_community_id;
    ELSE
      RETURN 'invalid';
  END CASE;
  RETURN 'ok';
END $fn$;
REVOKE EXECUTE ON FUNCTION public.group_member_action(UUID, UUID, TEXT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.group_member_action(UUID, UUID, TEXT, INT) TO authenticated;

-- Leave a group (self-service; the creator must transfer or delete first —
-- a group without its creator becomes orphaned, so v1 blocks leaving as
-- creator unless another admin exists... simplest honest rule: cannot leave
-- as creator, the UI says so).
CREATE OR REPLACE FUNCTION public.leave_group(p_community_id UUID)
RETURNS TEXT  -- 'ok' | 'creator' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid    UUID := auth.uid();
  v_creator UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN 'error'; END IF;
  SELECT created_by INTO v_creator FROM public.communities WHERE id = p_community_id;
  IF v_creator = v_uid THEN RETURN 'creator'; END IF;
  DELETE FROM public.community_members WHERE community_id = p_community_id AND user_id = v_uid;
  RETURN 'ok';
END $fn$;
REVOKE EXECUTE ON FUNCTION public.leave_group(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;
