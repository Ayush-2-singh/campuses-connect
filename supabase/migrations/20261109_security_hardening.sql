-- ═══════════════════════════════════════════════════════════════════════════
-- 20261109 — SECURITY HARDENING
--
-- Found by auditing the live project with the anon key (the key every visitor
-- holds). Two row-level policies were wider than the app needs, and a set of
-- privileged SECURITY DEFINER functions were still executable by `anon`.
--
-- Everything here is idempotent: it can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. live_voice_chat_members ─────────────────────────────────────────────
-- The old policy was `EXISTS (SELECT 1 FROM live_voice_chat_groups g WHERE
-- g.id = group_id)`. Because the subquery is itself filtered by the groups
-- policy, an anonymous visitor could still list every membership — user_id and
-- role — of every global room (29 rows on the live database). Room discovery
-- needs the COUNT, and every room page requires a session, so requiring a
-- session costs nothing and stops anonymous scraping of the roster.
DROP POLICY IF EXISTS "lvc_members_select" ON public.live_voice_chat_members;
CREATE POLICY "lvc_members_select" ON public.live_voice_chat_members
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.live_voice_chat_groups g
      WHERE g.id = live_voice_chat_members.group_id
    )
  );

-- ── 2. typing_progress ─────────────────────────────────────────────────────
-- Both policies were `USING (true)`, so anyone holding the anon key could read
-- every player's row AND overwrite it (the UPDATE policy had no check either).
-- The battle is played inside a signed-in room, so a session is the right
-- floor. Rows are keyed by a client-generated `player_id`, not a user id, so
-- per-row ownership cannot be enforced without a schema change; this closes the
-- anonymous hole and leaves the game working.
DROP POLICY IF EXISTS typing_progress_select ON public.typing_progress;
CREATE POLICY typing_progress_select ON public.typing_progress
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS typing_progress_update ON public.typing_progress;
CREATE POLICY typing_progress_update ON public.typing_progress
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── 2b. community_members ──────────────────────────────────────────────────
-- `cmembers_select` was `USING (true)`, so an anonymous visitor could page
-- through 48 rows of who belongs to which community. The communities plane is
-- retired (src/lib/featureGates.ts) and its only consumer is the archived
-- /chat page, so a session is enough to keep every live path working.
DROP POLICY IF EXISTS cmembers_select ON public.community_members;
CREATE POLICY cmembers_select ON public.community_members
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── 3. Privileged functions were executable by `anon` ──────────────────────
-- Postgres grants EXECUTE to PUBLIC by default, which includes anon. None of
-- these are called by a signed-out visitor: the admin, moderation, audit,
-- settlement and retired-messaging paths all run from a server route with the
-- service-role key, or from a signed-in client. `authenticated` keeps its
-- grant, so nothing the product does today loses access.
DO $$
DECLARE
  r record;
  privileged text[] := ARRAY[
    -- admin + audit + maintenance
    'log_admin_action', 'log_audit', 'prune_notifications', 'run_infra_cleanup',
    -- moderation
    'resolve_moderation_item', 'moderate_chat', 'moderate_confession',
    'report_chat_message', 'report_confession', 'pin_chat_message', 'resolve_chat_report',
    'review_member', 'review_eligibility', 'reject_campus_change', 'set_note_verified',
    'set_live_voice_chat_mute',
    -- competition + rewards written by server routes
    'settle_competitive_match', 'restore_dsa_submission_code', 'record_game_winner',
    'record_meaningful_action_for', 'reward_note_upload', 'reward_opportunity_post',
    'reward_event_host', 'notify_user', 'regenerate_group_invite',
    -- retired messaging plane (see src/lib/featureGates.ts)
    'start_or_get_conversation', 'mark_conversation_read', 'mark_chat_read'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (privileged)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- ── 4. Health check ────────────────────────────────────────────────────────
-- Fails loudly if a public table is ever created without RLS.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(tablename, ', ')
  INTO missing
  FROM pg_tables
  WHERE schemaname = 'public' AND NOT rowsecurity;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'public tables without RLS: %', missing;
  END IF;
END $$;
