-- ═══════════════════════════════════════════════════════════════════════════
-- 051_tournament_rosters.sql — Roster self-formation + Free Fire identity
-- ═══════════════════════════════════════════════════════════════════════════
-- REQUIRES: 050_tournaments.sql (base schema) AND 051_tournament_rbac.sql
-- (scoped organizer RBAC — tournament_allows / tournament_members).
--
-- Builds the CricHeroes-style loop on top of 050 WITHOUT touching its logic:
--
--   Organizer creates teams → assigns IGL (leader) → IGL shares invite code →
--   players join themselves (CTC login + FF IGN/UID) → roster fills →
--   organizer locks roster → matches are played → host records facts →
--   system scores → organizer verifies → standings update automatically.
--
-- SECURITY: every write goes through a SECURITY DEFINER RPC with explicit
-- server-side authorization. Join codes are validated ONLY server-side and
-- stored as plain text ONLY for organizer visibility (they are revocable,
-- 8-char, tournament-scoped — not a permanent password).
-- All statements are idempotent; safe to re-run.

-- ── 1. SCHEMA EXTENSIONS ─────────────────────────────────────────────────────

-- Roster lock + invite code on teams
ALTER TABLE public.tournament_teams
  ADD COLUMN IF NOT EXISTS roster_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS join_code TEXT,
  ADD COLUMN IF NOT EXISTS join_code_updated_at TIMESTAMPTZ;

-- Free Fire identity — tournament-scoped, separate from CTC profile
ALTER TABLE public.tournament_team_players
  ADD COLUMN IF NOT EXISTS ff_ign TEXT,
  ADD COLUMN IF NOT EXISTS ff_uid TEXT,
  ADD COLUMN IF NOT EXISTS joined_via TEXT NOT NULL DEFAULT 'organizer'
    CHECK (joined_via IN ('organizer', 'invite_code', 'invite_link')),
  ADD COLUMN IF NOT EXISTS user_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Tournament-level registration control + room credentials per match
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS registration_closed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS room_id TEXT,
  ADD COLUMN IF NOT EXISTS room_password TEXT,
  ADD COLUMN IF NOT EXISTS room_released_at TIMESTAMPTZ;

-- Uniqueness: one FF UID per tournament (identity theft guard).
-- Partial unique index: NULLs (organizer-seeded placeholders) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tplayer_ff_uid
  ON public.tournament_team_players (tournament_id, ff_uid)
  WHERE ff_uid IS NOT NULL AND btrim(ff_uid) <> '';

CREATE INDEX IF NOT EXISTS idx_tteams_code ON public.tournament_teams (join_code);

-- ── 2. HELPERS ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tournament_gen_code()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  -- Unambiguous alphabet: no 0/O/1/I/L.
  SELECT array_to_string(
    ARRAY(
      SELECT substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 31)::int + 1, 1)
      FROM generate_series(1, 6)
    ), ''
  );
$fn$;

CREATE OR REPLACE FUNCTION public.tournament_is_team_leader(p_team UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_teams t
    WHERE t.id = p_team AND t.leader_id = auth.uid()
  );
$fn$;

-- The caller is EITHER a platform/organizer admin OR the team's IGL.
CREATE OR REPLACE FUNCTION public.tournament_can_manage_team(p_team UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.tournament_is_admin_caller()
      OR EXISTS (
        SELECT 1 FROM public.tournament_teams t
        WHERE t.id = p_team AND t.leader_id = auth.uid()
      );
$fn$;

-- ── 3. IGL SELF-SERVICE ──────────────────────────────────────────────────────

-- IGL (or organizer) regenerates the team join code. Old codes die instantly.
CREATE OR REPLACE FUNCTION public.regenerate_team_join_code(p_team UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_code TEXT;
  v_locked BOOLEAN;
BEGIN
  IF NOT public.tournament_can_manage_team(p_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT tournament_id, roster_locked INTO v_tournament, v_locked
    FROM public.tournament_teams WHERE id = p_team;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
  IF v_locked THEN RAISE EXCEPTION 'roster_locked'; END IF;

  LOOP
    v_code := public.tournament_gen_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tournament_teams WHERE join_code = v_code);
  END LOOP;

  UPDATE public.tournament_teams
     SET join_code = v_code, join_code_updated_at = now()
   WHERE id = p_team;

  PERFORM public.tournament_log(v_tournament, 'join_code_regenerated', 'team', p_team, NULL,
    jsonb_build_object('by', CASE WHEN public.tournament_is_admin_caller() THEN 'organizer' ELSE 'igl' END));
  RETURN v_code;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.regenerate_team_join_code(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerate_team_join_code(UUID) TO authenticated;

-- IGL sees their team(s) + roster + code in one call.
CREATE OR REPLACE FUNCTION public.get_my_tournament_team(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_team public.tournament_teams%ROWTYPE;
  v_size INT;
BEGIN
  SELECT t.* INTO v_team
    FROM public.tournament_teams t
   WHERE t.tournament_id = p_tournament AND t.leader_id = auth.uid()
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_leader'; END IF;

  SELECT team_size INTO v_size FROM public.tournaments WHERE id = p_tournament;

  RETURN jsonb_build_object(
    'team_id', v_team.id,
    'team_name', v_team.team_name,
    'team_tag', v_team.team_tag,
    'status', v_team.status,
    'roster_locked', v_team.roster_locked,
    'join_code', CASE WHEN v_team.roster_locked THEN NULL ELSE v_team.join_code END,
    'team_size', v_size,
    'players', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'name', p.display_name_snapshot,
        'role', p.role,
        'ff_ign', p.ff_ign,
        'ff_uid', p.ff_uid,
        'user_confirmed', p.user_confirmed
      ) ORDER BY p.created_at), '[]'::jsonb)
      FROM public.tournament_team_players p WHERE p.team_id = v_team.id
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_my_tournament_team(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_tournament_team(UUID) TO authenticated;

-- IGL removes a SELF-REGISTERED player before roster lock.
-- Organizer-seeded players (joined_via='organizer') stay organizer-managed.
CREATE OR REPLACE FUNCTION public.remove_team_player(p_team UUID, p_player UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_locked BOOLEAN;
  v_via TEXT;
BEGIN
  IF NOT public.tournament_can_manage_team(p_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT tournament_id, roster_locked INTO v_tournament, v_locked
    FROM public.tournament_teams WHERE id = p_team;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
  IF v_locked THEN RAISE EXCEPTION 'roster_locked'; END IF;

  SELECT joined_via INTO v_via FROM public.tournament_team_players WHERE id = p_player;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
  IF v_via = 'organizer' AND NOT public.tournament_is_admin_caller() THEN
    RAISE EXCEPTION 'forbidden';  -- IGL cannot drop organizer-seeded entries
  END IF;

  DELETE FROM public.tournament_team_players WHERE id = p_player;
  PERFORM public.tournament_log(v_tournament, 'player_removed', 'player', p_player, NULL,
    jsonb_build_object('team', p_team, 'by', CASE WHEN public.tournament_is_admin_caller() THEN 'organizer' ELSE 'igl' END));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.remove_team_player(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_team_player(UUID,UUID) TO authenticated;

-- ── 4. PLAYER SELF-JOIN (the core loop) ──────────────────────────────────────

-- Resolve a join code → what the player is joining (pre-join preview).
CREATE OR REPLACE FUNCTION public.resolve_team_invite(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_team public.tournament_teams%ROWTYPE;
  v_t public.tournaments%ROWTYPE;
  v_count INT;
BEGIN
  SELECT * INTO v_team FROM public.tournament_teams
   WHERE join_code = upper(btrim(p_code)) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;
  IF v_team.roster_locked THEN RETURN jsonb_build_object('ok', false, 'error', 'roster_locked'); END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = v_team.tournament_id;
  IF v_t.registration_closed THEN RETURN jsonb_build_object('ok', false, 'error', 'registration_closed'); END IF;
  IF v_t.status IN ('COMPLETED', 'CANCELLED') THEN RETURN jsonb_build_object('ok', false, 'error', 'registration_closed'); END IF;

  SELECT count(*) INTO v_count FROM public.tournament_team_players WHERE team_id = v_team.id;
  IF v_count >= v_t.team_size THEN RETURN jsonb_build_object('ok', false, 'error', 'team_full'); END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tournament_id', v_t.id,
    'tournament_name', v_t.name,
    'team_id', v_team.id,
    'team_name', v_team.team_name,
    'team_tag', v_team.team_tag,
    'roster', v_count,
    'team_size', v_t.team_size
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.resolve_team_invite(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_team_invite(TEXT) TO anon, authenticated;

-- Player joins with code + Free Fire identity. Server validates EVERYTHING:
-- auth, code, locks, capacity, duplicate team membership, duplicate FF UID.
CREATE OR REPLACE FUNCTION public.join_team_by_code(
  p_code TEXT, p_ign TEXT, p_ff_uid TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_team public.tournament_teams%ROWTYPE;
  v_t public.tournaments%ROWTYPE;
  v_count INT;
  v_player UUID;
  v_name TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT * INTO v_team FROM public.tournament_teams
   WHERE join_code = upper(btrim(p_code)) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF v_team.roster_locked THEN RAISE EXCEPTION 'roster_locked'; END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = v_team.tournament_id;
  IF v_t.registration_closed OR v_t.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'registration_closed';
  END IF;

  -- One team per player per tournament.
  IF EXISTS (
    SELECT 1 FROM public.tournament_team_players
     WHERE tournament_id = v_team.tournament_id AND user_id = v_user
  ) THEN RAISE EXCEPTION 'already_on_team'; END IF;

  SELECT count(*) INTO v_count FROM public.tournament_team_players WHERE team_id = v_team.id;
  IF v_count >= v_t.team_size THEN RAISE EXCEPTION 'team_full'; END IF;

  -- Duplicate FF UID per tournament (placeholder NULLs are exempt).
  IF EXISTS (
    SELECT 1 FROM public.tournament_team_players
     WHERE tournament_id = v_team.tournament_id
       AND ff_uid = upper(btrim(p_ff_uid))
  ) THEN RAISE EXCEPTION 'duplicate_uid'; END IF;

  SELECT COALESCE(NULLIF(btrim(p_ign), ''), full_name, 'Player')
    INTO v_name FROM public.profiles WHERE id = v_user;

  INSERT INTO public.tournament_team_players
    (tournament_id, team_id, user_id, display_name_snapshot, role,
     ff_ign, ff_uid, joined_via, user_confirmed)
  VALUES
    (v_team.tournament_id, v_team.id, v_user, v_name, 'player',
     NULLIF(btrim(p_ign), ''), upper(btrim(p_ff_uid)), 'invite_code', true)
  RETURNING id INTO v_player;

  PERFORM public.tournament_log(v_team.tournament_id, 'player_joined', 'player', v_player, NULL,
    jsonb_build_object('team', v_team.id, 'via', 'invite_code', 'uid_set', true));
  RETURN v_player;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.join_team_by_code(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_team_by_code(TEXT,TEXT,TEXT) TO authenticated;

-- ── 4b. ORGANIZER: IGL ASSIGNMENT ────────────────────────────────────────────

-- Assign/reassign the IGL. Seeds the leader as a roster row (role='leader')
-- when absent; an existing leader row is replaced cleanly. Fully audited.
CREATE OR REPLACE FUNCTION public.assign_team_igl(p_team UUID, p_username TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_locked BOOLEAN;
  v_user UUID;
  v_name TEXT;
  v_old UUID;
  v_old_player UUID;
  v_new_player UUID;
BEGIN
  SELECT t.tournament_id, t.roster_locked INTO v_tournament, v_locked
    FROM public.tournament_teams t WHERE t.id = p_team;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
  IF NOT public.tournament_allows(v_tournament, 'manage_teams') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_locked THEN RAISE EXCEPTION 'roster_locked'; END IF;
  IF p_team IS NULL OR btrim(p_username) = '' THEN RAISE EXCEPTION 'invalid'; END IF;

  SELECT p.id INTO v_user FROM public.profiles p
   WHERE lower(p.username) = lower(btrim(p_username)) LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'unknown_user'; END IF;

  -- One team per player per tournament: block if they play elsewhere here.
  IF EXISTS (
    SELECT 1 FROM public.tournament_team_players tp
     WHERE tp.tournament_id = v_tournament AND tp.user_id = v_user
       AND tp.team_id <> p_team
  ) THEN RAISE EXCEPTION 'already_on_team'; END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_user;
  SELECT leader_id INTO v_old FROM public.tournament_teams WHERE id = p_team;

  -- Demote/remove the old leader's seeded row (keep history via audit).
  IF v_old IS NOT NULL AND v_old <> v_user THEN
    SELECT tp.id INTO v_old_player FROM public.tournament_team_players tp
     WHERE tp.team_id = p_team AND tp.user_id = v_old AND tp.role = 'leader' LIMIT 1;
    IF v_old_player IS NOT NULL THEN
      DELETE FROM public.tournament_team_players WHERE id = v_old_player;
    END IF;
  END IF;

  -- Seed the new leader row if not already on THIS team's roster.
  SELECT tp.id INTO v_new_player FROM public.tournament_team_players tp
   WHERE tp.team_id = p_team AND tp.user_id = v_user LIMIT 1;
  IF v_new_player IS NOT NULL THEN
    UPDATE public.tournament_team_players SET role = 'leader' WHERE id = v_new_player;
  ELSE
    INSERT INTO public.tournament_team_players
      (tournament_id, team_id, user_id, display_name_snapshot, role, joined_via, user_confirmed)
    VALUES
      (v_tournament, p_team, v_user, COALESCE(v_name, btrim(p_username)), 'leader', 'organizer', true)
    RETURNING id INTO v_new_player;
  END IF;

  UPDATE public.tournament_teams SET leader_id = v_user WHERE id = p_team;

  PERFORM public.tournament_log(v_tournament, 'igl_assigned', 'team', p_team,
    jsonb_build_object('old_leader', v_old),
    jsonb_build_object('new_leader', v_user, 'username', btrim(p_username)));
  RETURN v_new_player;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.assign_team_igl(UUID,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.assign_team_igl(UUID,TEXT) TO authenticated;

-- ── 5. ROSTER LOCK (organizer) ───────────────────────────────────────────────
-- Uses tournament_allows() from 051_tournament_rbac.sql — platform admins pass
-- automatically; scoped OWNER/ADMIN also pass. No client-side checks.

CREATE OR REPLACE FUNCTION public.set_team_roster_lock(p_team UUID, p_locked BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
BEGIN
  IF NOT public.tournament_allows(
    (SELECT tournament_id FROM public.tournament_teams WHERE id = p_team),
    'manage_teams'
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT tournament_id INTO v_tournament FROM public.tournament_teams WHERE id = p_team;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;

  UPDATE public.tournament_teams SET roster_locked = p_locked WHERE id = p_team;
  PERFORM public.tournament_log(v_tournament,
    CASE WHEN p_locked THEN 'roster_locked' ELSE 'roster_unlocked' END,
    'team', p_team, NULL, jsonb_build_object('reason', p_reason));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_team_roster_lock(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_team_roster_lock(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_registration_closed(p_tournament UUID, p_closed BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'edit_info') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.tournaments SET registration_closed = p_closed WHERE id = p_tournament;
  PERFORM public.tournament_log(p_tournament,
    CASE WHEN p_closed THEN 'registration_closed' ELSE 'registration_reopened' END,
    'tournament', p_tournament, NULL, NULL);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_registration_closed(UUID,BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_registration_closed(UUID,BOOLEAN) TO authenticated;

-- Organizer updates a player's FF identity (override needs a reason; audited).
CREATE OR REPLACE FUNCTION public.set_player_ff_identity(
  p_player UUID, p_ign TEXT, p_ff_uid TEXT, p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_team UUID;
  v_old JSONB;
  v_locked BOOLEAN;
BEGIN
  SELECT tournament_id, team_id INTO v_tournament, v_team
    FROM public.tournament_team_players WHERE id = p_player;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;

  IF NOT public.tournament_allows(v_tournament, 'manage_players') THEN
    -- The player themself may set/fix identity UNTIL roster lock.
    SELECT roster_locked INTO v_locked FROM public.tournament_teams WHERE id = v_team;
    IF v_locked THEN RAISE EXCEPTION 'roster_locked'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_team_players
       WHERE id = p_player AND user_id = auth.uid()
    ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  SELECT jsonb_build_object('ign', ff_ign, 'uid', ff_uid) INTO v_old
    FROM public.tournament_team_players WHERE id = p_player;

  UPDATE public.tournament_team_players
     SET ff_ign = NULLIF(btrim(p_ign), ''), ff_uid = upper(btrim(p_ff_uid))
   WHERE id = p_player;

  PERFORM public.tournament_log(v_tournament, 'ff_identity_changed', 'player', p_player,
    v_old, jsonb_build_object('ign', p_ign, 'uid', upper(btrim(p_ff_uid))), p_reason);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_player_ff_identity(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_player_ff_identity(UUID,TEXT,TEXT,TEXT) TO authenticated;

-- ── 6. ROOM CREDENTIALS (host/organizer release flow) ────────────────────────

CREATE OR REPLACE FUNCTION public.set_room_credentials(
  p_match UUID, p_room_id TEXT, p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
BEGIN
  IF NOT public.tournament_allows(
    (SELECT s.tournament_id FROM public.tournament_matches m
       JOIN public.tournament_stages s ON s.id = m.stage_id WHERE m.id = p_match),
    'manage_matches'
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT s.tournament_id INTO v_tournament
    FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id
   WHERE m.id = p_match;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;

  UPDATE public.tournament_matches
     SET room_id = NULLIF(btrim(p_room_id), ''),
         room_password = NULLIF(btrim(p_password), ''),
         room_released_at = CASE WHEN NULLIF(btrim(p_room_id), '') IS NULL THEN NULL ELSE now() END
   WHERE id = p_match;

  PERFORM public.tournament_log(v_tournament, 'room_credentials_set', 'match', p_match, NULL,
    jsonb_build_object('released', NULLIF(btrim(p_room_id), '') IS NOT NULL));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_room_credentials(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_room_credentials(UUID,TEXT,TEXT) TO authenticated;

-- Player-safe read: credentials ONLY when released; never leak the password
-- to non-organizers before release. Public tournament readability is preserved.
CREATE OR REPLACE FUNCTION public.get_room_credentials(p_match UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v public.tournament_matches%ROWTYPE;
  v_admin BOOLEAN;
BEGIN
  SELECT * INTO v FROM public.tournament_matches WHERE id = p_match;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  v_admin := public.tournament_allows(
    (SELECT s.tournament_id FROM public.tournament_matches m
       JOIN public.tournament_stages s ON s.id = m.stage_id WHERE m.id = p_match),
    'manage_matches'
  );
  IF v.room_released_at IS NULL AND NOT v_admin THEN
    RETURN jsonb_build_object('ok', true, 'released', false);
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'released', true,
    'room_id', v.room_id,
    'room_password', v.room_password,
    'released_at', v.room_released_at
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_room_credentials(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_room_credentials(UUID) TO anon, authenticated;

-- ── 7. PLAYER TOURNAMENT HISTORY (for profile + "my tournament" view) ────────

CREATE OR REPLACE FUNCTION public.get_my_tournament_history()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x.created_at DESC)
    FROM (
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.status AS tournament_status,
        tm.team_name,
        tp.ff_ign,
        tp.role,
        -- Aggregate THIS player's recorded facts (kills are immutable facts).
        COALESCE((SELECT SUM(ps.kills) FROM public.match_player_stats ps
                   WHERE ps.player_id = tp.id), 0) AS total_kills,
        (SELECT COUNT(DISTINCT ps.match_id) FROM public.match_player_stats ps
           WHERE ps.player_id = tp.id) AS matches_played,
        -- Team placement in VERIFIED/LOCKED matches.
        (SELECT MIN(mtr.placement) FROM public.match_team_results mtr
           WHERE mtr.team_id = tm.id AND mtr.result_state IN ('VERIFIED','LOCKED')) AS best_placement,
        tm.created_at
      FROM public.tournament_team_players tp
      JOIN public.tournament_teams tm ON tm.id = tp.team_id
      JOIN public.tournaments t ON t.id = tp.tournament_id
      WHERE tp.user_id = v_user
    ) x
  ), '[]'::jsonb);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_my_tournament_history() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_tournament_history() TO authenticated;

-- ── 8. GRANTS ON NEW COLUMNS (parity with table grants) ─────────────────────
-- Tables already grant column-level SELECT to anon/authenticated via 050's
-- broad policies; new columns ride along automatically for SELECT.
-- Writes remain RPC-only (no direct UPDATE/INSERT grants were added in 050).
