-- ═══════════════════════════════════════════════════════════════════════════
-- 052_tournament_platform.sql — Complete the tournament platform
-- ═══════════════════════════════════════════════════════════════════════════
-- REQUIRES: 050_tournaments.sql, 051_tournament_rbac.sql, 051_tournament_rosters.sql
--
-- This migration turns the "organizer-seeded" tournament board into a
-- website-driven platform. It does NOT rebuild anything: every change is an
-- addition or a targeted fix on top of the existing RPC/SECURITY DEFINER
-- architecture.
--
--   FIXES
--     1. recalc_match_team()          — invalid SELECT INTO (two cols → 1 var)
--     2. get_my_tournament_history()  — filtered on a column that never existed
--
--   NEW CAPABILITIES
--     3. Self-service team registration (create_tournament_team)
--     4. Unique, server-generated team codes (never publicly readable)
--     5. Leave / transfer IGL / substitute management
--     6. registration_deadline + max_teams, enforced transactionally
--     7. Tournament-wide roster lock
--     8. Reachable match lifecycle (SCHEDULED → LIVE → COMPLETED / CANCELLED)
--     9. Draft results excluded from every public leaderboard
--
--   SECURITY
--    10. join_code + room credentials MOVED OUT of publicly-readable tables
--        into RLS-closed tables that only SECURITY DEFINER RPCs can touch.
--    11. Audit log no longer world-readable; draft tournaments' children hidden.
--    12. Rate limiting on code resolution + joining.
--
-- All statements are idempotent; safe to re-run.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. FIX — recalc_match_team(): two columns selected into one scalar variable
-- ══════════════════════════════════════════════════════════════════════════
-- Scoring stays exactly what 050 defined (player kills → team kills → kill
-- points + placement points); only the broken row fetch is corrected.

CREATE OR REPLACE FUNCTION public.recalc_match_team(p_match UUID, p_team UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour      UUID;
  v_kpv       INT;
  v_placement INT;
  v_ppts      INT;
  v_kills     INT;
BEGIN
  SELECT st.tournament_id INTO v_tour
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;

  SELECT kill_point_value INTO v_kpv FROM public.tournaments WHERE id = v_tour;

  SELECT SUM(s.kills) INTO v_kills
    FROM public.match_player_stats s
   WHERE s.match_id = p_match AND s.team_id = p_team;

  SELECT placement INTO v_placement FROM public.match_team_results
   WHERE match_id = p_match AND team_id = p_team;

  SELECT points INTO v_ppts
    FROM public.tournament_scoring_rules
   WHERE tournament_id = v_tour AND placement = v_placement;

  INSERT INTO public.match_team_results (match_id, team_id, placement, total_kills,
                                         kill_points, placement_points, total_points)
  VALUES (p_match, p_team, v_placement,
          COALESCE(v_kills, 0),
          COALESCE(v_kills, 0) * COALESCE(v_kpv, 0),
          COALESCE(v_ppts, 0),
          COALESCE(v_kills, 0) * COALESCE(v_kpv, 0) + COALESCE(v_ppts, 0))
  ON CONFLICT (match_id, team_id) DO UPDATE SET
    total_kills      = EXCLUDED.total_kills,
    kill_points      = EXCLUDED.kill_points,
    placement_points = EXCLUDED.placement_points,
    total_points     = EXCLUDED.total_points,
    updated_at       = now();

  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.recalc_match_team(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recalc_match_team(UUID,UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. FIX — get_my_tournament_history(): result_state lives on the MATCH
-- ══════════════════════════════════════════════════════════════════════════

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
        tm.id AS team_id,
        tm.team_name,
        tp.ff_ign,
        tp.role,
        tm.roster_locked,
        t.rosters_locked AS tournament_rosters_locked,
        -- Kills count only once the match result is verified or locked.
        COALESCE((
          SELECT SUM(ps.kills) FROM public.match_player_stats ps
            JOIN public.tournament_matches m ON m.id = ps.match_id
           WHERE ps.player_id = tp.id AND m.result_state IN ('VERIFIED','LOCKED')
        ), 0) AS total_kills,
        (
          SELECT COUNT(DISTINCT ps.match_id) FROM public.match_player_stats ps
            JOIN public.tournament_matches m ON m.id = ps.match_id
           WHERE ps.player_id = tp.id AND m.result_state IN ('VERIFIED','LOCKED')
        ) AS matches_played,
        -- Placement is only official once the MATCH result is verified/locked.
        (
          SELECT MIN(mtr.placement)
            FROM public.match_team_results mtr
            JOIN public.tournament_matches m ON m.id = mtr.match_id
           WHERE mtr.team_id = tm.id AND m.result_state IN ('VERIFIED','LOCKED')
        ) AS best_placement,
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

-- ══════════════════════════════════════════════════════════════════════════
-- 3. SECRETS OUT OF PUBLICLY-READABLE TABLES  (P0 security fix)
-- ══════════════════════════════════════════════════════════════════════════
-- 050 gave every child table `FOR SELECT USING (true)`. That made
-- tournament_teams.join_code and tournament_matches.room_password readable by
-- anonymous clients via a plain table SELECT, which defeated the RPC gates in
-- 051. RLS is row-level, so the fix is to move the secrets into tables with NO
-- read policy at all (SECURITY DEFINER RPCs still reach them).

CREATE TABLE IF NOT EXISTS public.tournament_team_secrets (
  team_id    UUID PRIMARY KEY REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  join_code  TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_secret_code
  ON public.tournament_team_secrets (join_code);

ALTER TABLE public.tournament_team_secrets ENABLE ROW LEVEL SECURITY;
-- No policies + no grants ⇒ unreachable from the client. RPC-only.
REVOKE ALL ON public.tournament_team_secrets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tournament_match_rooms (
  match_id      UUID PRIMARY KEY REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  room_id       TEXT,
  room_password TEXT,
  released_at   TIMESTAMPTZ,
  map           TEXT,
  match_group   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_match_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournament_match_rooms FROM anon, authenticated;

-- Carry existing data across before the exposed columns are dropped.
INSERT INTO public.tournament_team_secrets (team_id, join_code)
  SELECT id, upper(btrim(join_code)) FROM public.tournament_teams
   WHERE join_code IS NOT NULL AND btrim(join_code) <> ''
  ON CONFLICT (team_id) DO NOTHING;

INSERT INTO public.tournament_match_rooms (match_id, room_id, room_password, released_at)
  SELECT id, room_id, room_password, room_released_at FROM public.tournament_matches
   WHERE room_id IS NOT NULL OR room_password IS NOT NULL
  ON CONFLICT (match_id) DO NOTHING;

-- Remove the leaked columns from the world-readable tables.
DROP INDEX IF EXISTS public.idx_tteams_code;
ALTER TABLE public.tournament_teams  DROP COLUMN IF EXISTS join_code;
ALTER TABLE public.tournament_teams  DROP COLUMN IF EXISTS join_code_updated_at;
ALTER TABLE public.tournament_matches DROP COLUMN IF EXISTS room_id;
ALTER TABLE public.tournament_matches DROP COLUMN IF EXISTS room_password;
ALTER TABLE public.tournament_matches DROP COLUMN IF EXISTS room_released_at;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. SCHEMA EXTENSIONS — registration controls, lock, substitutes, match info
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_teams            INT,
  ADD COLUMN IF NOT EXISTS substitute_limit     INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rosters_locked       BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_max_teams_chk') THEN
    ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_max_teams_chk
      CHECK (max_teams IS NULL OR max_teams BETWEEN 2 AND 512);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_substitute_limit_chk') THEN
    ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_substitute_limit_chk
      CHECK (substitute_limit BETWEEN 0 AND 5);
  END IF;
END $$;

ALTER TABLE public.tournament_teams
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. INTEGRITY CONSTRAINTS
-- ══════════════════════════════════════════════════════════════════════════

-- 5a. Identity is a USER, not a display name. Two students can share a name —
--     the old UNIQUE(team_id, display_name_snapshot) wrongly rejected that.
DO $$ DECLARE c RECORD; BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.tournament_team_players'::regclass
       AND contype = 'u'
       AND conname LIKE '%display_name_snapshot%'
  LOOP
    EXECUTE format('ALTER TABLE public.tournament_team_players DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 5b. One player, one team, per tournament — enforced by the database, not
--     just by whichever RPC happens to remember to check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tplayer_tournament_user
  ON public.tournament_team_players (tournament_id, user_id)
  WHERE user_id IS NOT NULL;

-- 5c. joined_via gains 'created' (a player registering their OWN team).
DO $$ DECLARE c RECORD; BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.tournament_team_players'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%joined_via%'
  LOOP
    EXECUTE format('ALTER TABLE public.tournament_team_players DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tournament_team_players
  ADD CONSTRAINT tournament_team_players_joined_via_check
  CHECK (joined_via IN ('organizer', 'invite_code', 'invite_link', 'created'));

-- 5d. Team names are unique per tournament, case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tteam_name_ci
  ON public.tournament_teams (tournament_id, lower(btrim(team_name)));

-- ══════════════════════════════════════════════════════════════════════════
-- 6. HELPERS
-- ══════════════════════════════════════════════════════════════════════════

-- A team's roster is frozen when EITHER the team is locked OR the whole
-- tournament is locked. One definition, used by every roster RPC.
CREATE OR REPLACE FUNCTION public.tournament_team_locked(p_team UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT t.roster_locked OR tr.rosters_locked
       FROM public.tournament_teams t
       JOIN public.tournaments tr ON tr.id = t.tournament_id
      WHERE t.id = p_team),
    TRUE  -- unknown team ⇒ treat as locked (fail closed)
  );
$fn$;
-- Internal helper: called only from other SECURITY DEFINER RPCs.
REVOKE EXECUTE ON FUNCTION public.tournament_team_locked(UUID) FROM PUBLIC;

-- Fresh code with a collision retry loop. The UNIQUE index on
-- tournament_team_secrets is the last line of defence (race-proof).
CREATE OR REPLACE FUNCTION public.tournament_gen_unique_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_code TEXT;
  v_try  INT := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    v_code := public.tournament_gen_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tournament_team_secrets WHERE join_code = v_code);
    IF v_try >= 25 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
  END LOOP;
  RETURN v_code;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tournament_gen_unique_code() FROM PUBLIC;

-- One server-side answer to "can anyone still register?".
CREATE OR REPLACE FUNCTION public.tournament_registration_state(p_tournament UUID)
RETURNS TEXT  -- 'invalid' | 'closed' | 'not_accepting' | 'deadline_passed' | 'full' | 'open'
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v public.tournaments%ROWTYPE;
  v_teams INT;
BEGIN
  SELECT * INTO v FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF v.registration_closed THEN RETURN 'closed'; END IF;
  IF v.status NOT IN ('DRAFT', 'UPCOMING') THEN RETURN 'not_accepting'; END IF;
  IF v.registration_deadline IS NOT NULL AND now() > v.registration_deadline THEN
    RETURN 'deadline_passed';
  END IF;
  IF v.max_teams IS NOT NULL THEN
    SELECT COUNT(*) INTO v_teams FROM public.tournament_teams WHERE tournament_id = p_tournament;
    IF v_teams >= v.max_teams THEN RETURN 'full'; END IF;
  END IF;
  RETURN 'open';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tournament_registration_state(UUID) FROM PUBLIC;

-- The caller can manage a team if they are its IGL OR hold manage_teams on
-- its tournament. (051's version only knew platform admins + the IGL, so a
-- scoped OWNER/ADMIN could not run their own teams.)
CREATE OR REPLACE FUNCTION public.tournament_can_manage_team(p_team UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_teams t
     WHERE t.id = p_team
       AND (t.leader_id = auth.uid()
            OR public.tournament_allows(t.tournament_id, 'manage_teams'))
  );
$fn$;
REVOKE EXECUTE ON FUNCTION public.tournament_can_manage_team(UUID) FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. TEAM CODES — server-generated only, never in a public column
-- ══════════════════════════════════════════════════════════════════════════

-- IGL (or organizer) rotates a team's code. The old code dies immediately
-- because the secret row is upserted, not appended.
CREATE OR REPLACE FUNCTION public.regenerate_team_join_code(p_team UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_code TEXT;
BEGIN
  IF NOT public.tournament_can_manage_team(p_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT tournament_id INTO v_tournament FROM public.tournament_teams WHERE id = p_team;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
  IF public.tournament_team_locked(p_team) THEN RAISE EXCEPTION 'roster_locked'; END IF;

  v_code := public.tournament_gen_unique_code();

  INSERT INTO public.tournament_team_secrets (team_id, join_code)
  VALUES (p_team, v_code)
  ON CONFLICT (team_id) DO UPDATE SET join_code = EXCLUDED.join_code, updated_at = now();

  PERFORM public.tournament_log(v_tournament, 'join_code_regenerated', 'team', p_team, NULL,
    jsonb_build_object('by', CASE WHEN public.tournament_allows(v_tournament, 'manage_teams')
                                    AND NOT EXISTS (SELECT 1 FROM public.tournament_teams
                                                     WHERE id = p_team AND leader_id = auth.uid())
                                  THEN 'organizer' ELSE 'igl' END));
  RETURN v_code;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.regenerate_team_join_code(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerate_team_join_code(UUID) TO authenticated;

-- Organizer-only: every code in one tournament (the admin roster panel).
CREATE OR REPLACE FUNCTION public.get_tournament_team_codes(p_tournament UUID)
RETURNS TABLE (team_id UUID, team_name TEXT, join_code TEXT, roster_locked BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'manage_teams') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT t.id, t.team_name, s.join_code, t.roster_locked
      FROM public.tournament_teams t
      LEFT JOIN public.tournament_team_secrets s ON s.team_id = t.id
     WHERE t.tournament_id = p_tournament
     ORDER BY t.team_name;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_team_codes(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournament_team_codes(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. SELF-SERVICE TEAM REGISTRATION  (the core missing piece)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_tournament_team(
  p_tournament UUID, p_team_name TEXT, p_tag TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user  UUID := auth.uid();
  v_name  TEXT;
  v_state TEXT;
  v_team  UUID;
  v_code  TEXT;
  v_name_clean TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_name_clean := btrim(COALESCE(p_team_name, ''));
  IF length(v_name_clean) < 3 OR length(v_name_clean) > 40 THEN
    RAISE EXCEPTION 'invalid_team_name';
  END IF;
  IF p_tag IS NOT NULL AND length(btrim(p_tag)) > 6 THEN
    RAISE EXCEPTION 'invalid_tag';
  END IF;

  -- Serialize concurrent registrations for this tournament so the max_teams
  -- check cannot be raced past.
  PERFORM pg_advisory_xact_lock(hashtext(p_tournament::text));

  v_state := public.tournament_registration_state(p_tournament);
  IF v_state = 'invalid' THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF v_state <> 'open' THEN RAISE EXCEPTION '%', v_state; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_team_players
     WHERE tournament_id = p_tournament AND user_id = v_user
  ) THEN RAISE EXCEPTION 'already_registered'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_teams
     WHERE tournament_id = p_tournament AND lower(btrim(team_name)) = lower(v_name_clean)
  ) THEN RAISE EXCEPTION 'team_name_taken'; END IF;

  INSERT INTO public.tournament_teams (tournament_id, team_name, team_tag, leader_id)
  VALUES (p_tournament, v_name_clean, NULLIF(btrim(COALESCE(p_tag, '')), ''), v_user)
  RETURNING id INTO v_team;

  v_code := public.tournament_gen_unique_code();
  INSERT INTO public.tournament_team_secrets (team_id, join_code) VALUES (v_team, v_code);

  SELECT COALESCE(NULLIF(btrim(full_name), ''), username, 'IGL')
    INTO v_name FROM public.profiles WHERE id = v_user;

  -- The registrant is the IGL and the first roster member — atomically.
  INSERT INTO public.tournament_team_players
    (tournament_id, team_id, user_id, display_name_snapshot, role, joined_via, user_confirmed)
  VALUES (p_tournament, v_team, v_user, COALESCE(v_name, 'IGL'), 'leader', 'created', true);

  PERFORM public.tournament_log(p_tournament, 'team_registered', 'team', v_team, NULL,
    jsonb_build_object('name', v_name_clean, 'by', 'self'));

  RETURN jsonb_build_object(
    'team_id', v_team,
    'team_name', v_name_clean,
    'join_code', v_code,
    'role', 'IGL'
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_tournament_team(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_tournament_team(UUID,TEXT,TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. ROSTER — read, leave, transfer IGL, substitutes
-- ══════════════════════════════════════════════════════════════════════════

-- Shared payload builder so IGL and player views can never drift.
CREATE OR REPLACE FUNCTION public.tournament_team_payload(
  p_team UUID, p_include_code BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_team public.tournament_teams%ROWTYPE;
  v_t    public.tournaments%ROWTYPE;
  v_code TEXT;
  v_subs INT;
BEGIN
  SELECT * INTO v_team FROM public.tournament_teams WHERE id = p_team;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_team.tournament_id;

  IF p_include_code THEN
    SELECT join_code INTO v_code FROM public.tournament_team_secrets WHERE team_id = p_team;
  END IF;

  SELECT COUNT(*) INTO v_subs FROM public.tournament_team_players
   WHERE team_id = p_team AND role = 'substitute';

  RETURN jsonb_build_object(
    'team_id', v_team.id,
    'team_name', v_team.team_name,
    'team_tag', v_team.team_tag,
    'tournament_id', v_team.tournament_id,
    'tournament_name', v_t.name,
    'tournament_status', v_t.status,
    'status', v_team.status,
    'roster_locked', v_team.roster_locked OR v_t.rosters_locked,
    'locked_at', v_team.locked_at,
    'join_code', CASE
                   WHEN NOT p_include_code THEN NULL
                   WHEN v_team.roster_locked OR v_t.rosters_locked THEN NULL
                   ELSE v_code
                 END,
    'team_size', v_t.team_size,
    'substitute_limit', v_t.substitute_limit,
    'substitute_count', v_subs,
    'leader_id', v_team.leader_id,
    'is_leader', (v_team.leader_id = auth.uid()),
    'roster', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'name', p.display_name_snapshot,
        'role', p.role,
        'ff_ign', p.ff_ign,
        'ff_uid', CASE WHEN auth.uid() IS NULL THEN NULL ELSE p.ff_uid END,
        'joined_via', p.joined_via,
        'user_confirmed', p.user_confirmed,
        'joined_at', p.created_at
      ) ORDER BY CASE p.role WHEN 'leader' THEN 0 WHEN 'player' THEN 1 ELSE 2 END, p.created_at), '[]'::jsonb)
      FROM public.tournament_team_players p WHERE p.team_id = p_team
    )
  );
END;
$fn$;
-- SECURITY: this builder takes an `include_code` flag, so it must NEVER be
-- callable from the client — only from the authorized RPCs above.
REVOKE EXECUTE ON FUNCTION public.tournament_team_payload(UUID,BOOLEAN) FROM PUBLIC;

-- IGL view (kept for backwards compatibility with IglTeamPanel).
CREATE OR REPLACE FUNCTION public.get_my_tournament_team(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_team UUID;
BEGIN
  SELECT t.id INTO v_team FROM public.tournament_teams t
   WHERE t.tournament_id = p_tournament AND t.leader_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_leader'; END IF;
  RETURN public.tournament_team_payload(v_team, TRUE);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_my_tournament_team(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_tournament_team(UUID) TO authenticated;

-- ANY member's view — a regular player can see their team, teammates and
-- whether the roster is locked. The join code is only included for the IGL
-- (or a tournament organizer).
CREATE OR REPLACE FUNCTION public.get_my_team_in_tournament(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_team UUID;
  v_is_leader BOOLEAN;
BEGIN
  SELECT t.id, (t.leader_id = auth.uid())
    INTO v_team, v_is_leader
    FROM public.tournament_team_players p
    JOIN public.tournament_teams t ON t.id = p.team_id
   WHERE p.tournament_id = p_tournament AND p.user_id = auth.uid()
   LIMIT 1;
  IF v_team IS NULL THEN RETURN NULL; END IF;

  RETURN public.tournament_team_payload(
    v_team,
    v_is_leader OR public.tournament_allows(p_tournament, 'manage_teams')
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_my_team_in_tournament(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_team_in_tournament(UUID) TO authenticated;

-- A player leaves their own team (before lock; the IGL must hand over first).
CREATE OR REPLACE FUNCTION public.leave_tournament_team(p_team UUID)
RETURNS TEXT  -- 'ok' | 'unauthenticated' | 'invalid' | 'not_on_team' | 'roster_locked' | 'igl_cannot_leave'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user       UUID := auth.uid();
  v_tournament UUID;
  v_leader     UUID;
  v_player     UUID;
BEGIN
  IF v_user IS NULL THEN RETURN 'unauthenticated'; END IF;

  SELECT tournament_id, leader_id INTO v_tournament, v_leader
    FROM public.tournament_teams WHERE id = p_team;
  IF v_tournament IS NULL THEN RETURN 'invalid'; END IF;
  IF public.tournament_team_locked(p_team) THEN RETURN 'roster_locked'; END IF;

  SELECT id INTO v_player FROM public.tournament_team_players
   WHERE team_id = p_team AND user_id = v_user;
  IF v_player IS NULL THEN RETURN 'not_on_team'; END IF;
  IF v_leader = v_user THEN RETURN 'igl_cannot_leave'; END IF;

  DELETE FROM public.tournament_team_players WHERE id = v_player;

  PERFORM public.tournament_log(v_tournament, 'player_left', 'player', v_player, NULL,
    jsonb_build_object('team', p_team));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.leave_tournament_team(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_tournament_team(UUID) TO authenticated;

-- Hand the IGL role to an existing teammate (IGL self-service or organizer).
CREATE OR REPLACE FUNCTION public.transfer_team_igl(p_team UUID, p_player UUID)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'roster_locked' | 'self'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user       UUID := auth.uid();
  v_tournament UUID;
  v_leader     UUID;
  v_target     UUID;
BEGIN
  SELECT tournament_id, leader_id INTO v_tournament, v_leader
    FROM public.tournament_teams WHERE id = p_team;
  IF v_tournament IS NULL THEN RETURN 'invalid'; END IF;

  IF NOT (v_leader = v_user OR public.tournament_allows(v_tournament, 'manage_teams')) THEN
    RETURN 'forbidden';
  END IF;
  IF public.tournament_team_locked(p_team) THEN RETURN 'roster_locked'; END IF;

  SELECT user_id INTO v_target FROM public.tournament_team_players
   WHERE id = p_player AND team_id = p_team;
  IF v_target IS NULL THEN RETURN 'invalid'; END IF;
  IF v_target = v_leader THEN RETURN 'self'; END IF;

  -- Demote the current leader row, promote the target, repoint the team.
  UPDATE public.tournament_team_players SET role = 'player'
   WHERE team_id = p_team AND role = 'leader';
  UPDATE public.tournament_team_players SET role = 'leader' WHERE id = p_player;
  UPDATE public.tournament_teams SET leader_id = v_target WHERE id = p_team;

  PERFORM public.tournament_log(v_tournament, 'igl_transferred', 'team', p_team,
    jsonb_build_object('old_leader', v_leader),
    jsonb_build_object('new_leader', v_target));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.transfer_team_igl(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.transfer_team_igl(UUID,UUID) TO authenticated;

-- Designate a player as a substitute (bounded by tournament.substitute_limit).
CREATE OR REPLACE FUNCTION public.set_player_role(p_team UUID, p_player UUID, p_role TEXT)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'roster_locked' | 'substitute_limit_reached' | 'leader_role_fixed'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_limit      INT;
  v_subs       INT;
  v_role       TEXT;
BEGIN
  IF p_role NOT IN ('player', 'substitute') THEN RETURN 'invalid'; END IF;

  SELECT tournament_id INTO v_tournament FROM public.tournament_teams WHERE id = p_team;
  IF v_tournament IS NULL THEN RETURN 'invalid'; END IF;
  IF NOT public.tournament_can_manage_team(p_team) THEN RETURN 'forbidden'; END IF;
  IF public.tournament_team_locked(p_team) THEN RETURN 'roster_locked'; END IF;

  SELECT role INTO v_role FROM public.tournament_team_players
   WHERE id = p_player AND team_id = p_team;
  IF v_role IS NULL THEN RETURN 'invalid'; END IF;
  IF v_role = 'leader' THEN RETURN 'leader_role_fixed'; END IF;

  IF p_role = 'substitute' THEN
    SELECT substitute_limit INTO v_limit FROM public.tournaments WHERE id = v_tournament;
    SELECT COUNT(*) INTO v_subs FROM public.tournament_team_players
     WHERE team_id = p_team AND role = 'substitute';
    IF v_subs >= COALESCE(v_limit, 0) THEN RETURN 'substitute_limit_reached'; END IF;
  END IF;

  UPDATE public.tournament_team_players SET role = p_role WHERE id = p_player;

  PERFORM public.tournament_log(v_tournament, 'player_role_changed', 'player', p_player,
    jsonb_build_object('role', v_role), jsonb_build_object('role', p_role));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_player_role(UUID,UUID,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_player_role(UUID,UUID,TEXT) TO authenticated;

-- IGL removes a SELF-REGISTERED player before lock (organizer-seeded rows stay
-- organizer-managed). Also honours the tournament-wide lock now.
CREATE OR REPLACE FUNCTION public.remove_team_player(p_team UUID, p_player UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_via TEXT;
BEGIN
  IF NOT public.tournament_can_manage_team(p_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT tournament_id INTO v_tournament FROM public.tournament_teams WHERE id = p_team;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
  IF public.tournament_team_locked(p_team) THEN RAISE EXCEPTION 'roster_locked'; END IF;

  SELECT joined_via INTO v_via FROM public.tournament_team_players WHERE id = p_player;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
  IF v_via = 'organizer' AND NOT public.tournament_allows(v_tournament, 'manage_players') THEN
    RAISE EXCEPTION 'forbidden';  -- IGL cannot drop organizer-seeded entries
  END IF;

  DELETE FROM public.tournament_team_players WHERE id = p_player;
  PERFORM public.tournament_log(v_tournament, 'player_removed', 'player', p_player, NULL,
    jsonb_build_object('team', p_team,
      'by', CASE WHEN public.tournament_allows(v_tournament, 'manage_players')
                  THEN 'organizer' ELSE 'igl' END));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.remove_team_player(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_team_player(UUID,UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. REGISTRATION + ROSTER LOCK CONTROLS
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_tournament_registration(
  p_tournament UUID, p_closed BOOLEAN, p_deadline TIMESTAMPTZ DEFAULT NULL,
  p_max_teams INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'edit_info') THEN RETURN 'forbidden'; END IF;
  IF p_max_teams IS NOT NULL AND (p_max_teams < 2 OR p_max_teams > 512) THEN RETURN 'invalid'; END IF;
  IF p_max_teams IS NOT NULL
     AND p_max_teams < (SELECT COUNT(*) FROM public.tournament_teams WHERE tournament_id = p_tournament) THEN
    RETURN 'below_current_teams';
  END IF;

  UPDATE public.tournaments
     SET registration_closed = p_closed,
         registration_deadline = COALESCE(p_deadline, registration_deadline),
         max_teams = COALESCE(p_max_teams, max_teams)
   WHERE id = p_tournament;

  PERFORM public.tournament_log(p_tournament,
    CASE WHEN p_closed THEN 'registration_closed' ELSE 'registration_reopened' END,
    'tournament', p_tournament, NULL,
    jsonb_build_object('deadline', p_deadline, 'max_teams', p_max_teams));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_tournament_registration(UUID,BOOLEAN,TIMESTAMPTZ,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_tournament_registration(UUID,BOOLEAN,TIMESTAMPTZ,INT) TO authenticated;

-- Legacy two-arg wrapper kept so existing callers keep working.
CREATE OR REPLACE FUNCTION public.set_registration_closed(p_tournament UUID, p_closed BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.set_tournament_registration(p_tournament, p_closed, NULL, NULL) <> 'ok' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_registration_closed(UUID,BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_registration_closed(UUID,BOOLEAN) TO authenticated;

-- Tournament-wide roster lock — cascades to every team so the join/remove/
-- transfer/role RPCs (which all consult tournament_team_locked) are frozen.
CREATE OR REPLACE FUNCTION public.set_tournament_roster_lock(
  p_tournament UUID, p_locked BOOLEAN, p_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'manage_teams') THEN RETURN 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_tournament) THEN RETURN 'invalid'; END IF;

  UPDATE public.tournaments SET rosters_locked = p_locked WHERE id = p_tournament;
  UPDATE public.tournament_teams
     SET roster_locked = p_locked,
         locked_at = CASE WHEN p_locked THEN now() ELSE NULL END
   WHERE tournament_id = p_tournament;

  PERFORM public.tournament_log(p_tournament,
    CASE WHEN p_locked THEN 'rosters_locked' ELSE 'rosters_unlocked' END,
    'tournament', p_tournament, NULL, jsonb_build_object('reason', p_reason));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_tournament_roster_lock(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_tournament_roster_lock(UUID,BOOLEAN,TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. MATCH LIFECYCLE — SCHEDULED → LIVE → COMPLETED, plus CANCELLED
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_match_status(
  p_match UUID, p_status TEXT, p_reason TEXT DEFAULT NULL
)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'invalid_transition' | 'reason_required'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_status TEXT;
BEGIN
  SELECT s.tournament_id, m.status INTO v_tournament, v_status
    FROM public.tournament_matches m
    JOIN public.tournament_stages s ON s.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tournament IS NULL THEN RETURN 'invalid'; END IF;
  IF p_status NOT IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED') THEN RETURN 'invalid'; END IF;
  IF NOT public.tournament_allows(v_tournament, 'manage_matches') THEN RETURN 'forbidden'; END IF;

  IF p_status = v_status THEN RETURN 'ok'; END IF;

  -- Forward-only machine. CANCELLED is reachable while a match is running;
  -- cancelling an already-COMPLETED match needs the reopen flow first.
  IF NOT (
    (v_status = 'SCHEDULED' AND p_status IN ('LIVE', 'CANCELLED')) OR
    (v_status = 'LIVE'      AND p_status IN ('COMPLETED', 'CANCELLED'))
  ) THEN
    RETURN 'invalid_transition';
  END IF;

  IF p_status = 'CANCELLED' AND (p_reason IS NULL OR length(btrim(p_reason)) < 5) THEN
    RETURN 'reason_required';
  END IF;

  UPDATE public.tournament_matches SET status = p_status WHERE id = p_match;

  PERFORM public.tournament_log(v_tournament, 'match_' || lower(p_status), 'match', p_match,
    jsonb_build_object('status', v_status), jsonb_build_object('status', p_status), p_reason);
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_match_status(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_match_status(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_match(p_match UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.set_match_status(p_match, 'LIVE', NULL);
$fn$;
REVOKE EXECUTE ON FUNCTION public.start_match(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_match(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_match(p_match UUID, p_reason TEXT)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.set_match_status(p_match, 'CANCELLED', p_reason);
$fn$;
REVOKE EXECUTE ON FUNCTION public.cancel_match(UUID,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cancel_match(UUID,TEXT) TO authenticated;

-- Map / group metadata (non-secret; safe in the rooms table).
CREATE OR REPLACE FUNCTION public.set_match_info(
  p_match UUID, p_map TEXT DEFAULT NULL, p_match_group TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
BEGIN
  SELECT s.tournament_id INTO v_tournament
    FROM public.tournament_matches m
    JOIN public.tournament_stages s ON s.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tournament IS NULL THEN RETURN 'invalid'; END IF;
  IF NOT public.tournament_allows(v_tournament, 'manage_matches') THEN RETURN 'forbidden'; END IF;

  INSERT INTO public.tournament_match_rooms (match_id, map, match_group)
  VALUES (p_match, NULLIF(btrim(COALESCE(p_map, '')), ''), NULLIF(btrim(COALESCE(p_match_group, '')), ''))
  ON CONFLICT (match_id) DO UPDATE SET
    map = COALESCE(NULLIF(btrim(COALESCE(p_map, '')), ''), public.tournament_match_rooms.map),
    match_group = COALESCE(NULLIF(btrim(COALESCE(p_match_group, '')), ''), public.tournament_match_rooms.match_group),
    updated_at = now();

  PERFORM public.tournament_log(v_tournament, 'match_info_set', 'match', p_match, NULL,
    jsonb_build_object('map', p_map, 'group', p_match_group));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_match_info(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_match_info(UUID,TEXT,TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 12. ROOM CREDENTIALS — RPC-gated release, participants only after release
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_room_credentials(
  p_match UUID, p_room_id TEXT, p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
BEGIN
  SELECT s.tournament_id INTO v_tournament
    FROM public.tournament_matches m
    JOIN public.tournament_stages s ON s.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tournament IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
  IF NOT public.tournament_allows(v_tournament, 'manage_matches') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.tournament_match_rooms (match_id, room_id, room_password, released_at)
  VALUES (p_match,
          NULLIF(btrim(COALESCE(p_room_id, '')), ''),
          NULLIF(btrim(COALESCE(p_password, '')), ''),
          CASE WHEN NULLIF(btrim(COALESCE(p_room_id, '')), '') IS NULL THEN NULL ELSE now() END)
  ON CONFLICT (match_id) DO UPDATE SET
    room_id = EXCLUDED.room_id,
    room_password = EXCLUDED.room_password,
    released_at = EXCLUDED.released_at,
    updated_at = now();

  PERFORM public.tournament_log(v_tournament, 'room_credentials_set', 'match', p_match, NULL,
    jsonb_build_object('released', NULLIF(btrim(COALESCE(p_room_id, '')), '') IS NOT NULL));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_room_credentials(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_room_credentials(UUID,TEXT,TEXT) TO authenticated;

-- Reads the secrets table (not a public column). Before release only
-- organizers see values; after release, participating players see them too.
CREATE OR REPLACE FUNCTION public.get_room_credentials(p_match UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room public.tournament_match_rooms%ROWTYPE;
  v_tournament UUID;
  v_admin BOOLEAN;
  v_participant BOOLEAN;
BEGIN
  SELECT s.tournament_id INTO v_tournament
    FROM public.tournament_matches m
    JOIN public.tournament_stages s ON s.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tournament IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  SELECT * INTO v_room FROM public.tournament_match_rooms WHERE match_id = p_match;
  v_admin := public.tournament_allows(v_tournament, 'manage_matches');

  -- Is the caller on a team playing in THIS match?
  SELECT EXISTS (
    SELECT 1 FROM public.match_teams mt
      JOIN public.tournament_team_players tp ON tp.team_id = mt.team_id
     WHERE mt.match_id = p_match AND tp.user_id = auth.uid()
  ) INTO v_participant;

  IF v_room.match_id IS NULL OR v_room.released_at IS NULL THEN
    IF v_admin THEN
      RETURN jsonb_build_object('ok', true, 'released', false,
        'room_id', v_room.room_id, 'room_password', v_room.room_password,
        'map', v_room.map, 'match_group', v_room.match_group);
    END IF;
    RETURN jsonb_build_object('ok', true, 'released', false, 'map', v_room.map,
                              'match_group', v_room.match_group);
  END IF;

  IF NOT (v_admin OR v_participant) THEN
    RETURN jsonb_build_object('ok', true, 'released', true, 'restricted', true,
      'map', v_room.map, 'match_group', v_room.match_group);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'released', true,
    'room_id', v_room.room_id,
    'room_password', v_room.room_password,
    'released_at', v_room.released_at,
    'map', v_room.map,
    'match_group', v_room.match_group
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_room_credentials(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_room_credentials(UUID) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 13. JOIN BY CODE — hardened, code read from the secrets table
-- ══════════════════════════════════════════════════════════════════════════

-- Code → preview. Never a lookup oracle: one uniform 'invalid_code' answer.
CREATE OR REPLACE FUNCTION public.resolve_team_invite(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_team public.tournament_teams%ROWTYPE;
  v_t public.tournaments%ROWTYPE;
  v_count INT;
  v_state TEXT;
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
BEGIN
  IF length(v_code) <> 6 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;

  SELECT t.* INTO v_team
    FROM public.tournament_teams t
    JOIN public.tournament_team_secrets s ON s.team_id = t.id
   WHERE s.join_code = v_code
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;

  IF public.tournament_team_locked(v_team.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'roster_locked');
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = v_team.tournament_id;

  v_state := public.tournament_registration_state(v_t.id);
  IF v_state = 'closed' OR v_state = 'not_accepting' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;
  IF v_state = 'deadline_passed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_deadline_passed');
  END IF;

  SELECT count(*) INTO v_count FROM public.tournament_team_players WHERE team_id = v_team.id;
  IF v_count >= v_t.team_size THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_full');
  END IF;

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

-- The actual join. Server validates EVERYTHING; the client supplies facts only.
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
  v_ign TEXT := btrim(COALESCE(p_ign, ''));
  v_uid TEXT := upper(btrim(COALESCE(p_ff_uid, '')));
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
  v_state TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Brute-force guard: 30 attempts/hour/user across the join endpoint.
  IF NOT public.check_rate_limit(v_user, 'tournament_join', 30, 60) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  IF v_ign = '' OR length(v_ign) > 20 THEN RAISE EXCEPTION 'invalid_ign'; END IF;
  IF v_uid !~ '^[0-9]{6,12}$' THEN RAISE EXCEPTION 'invalid_uid'; END IF;

  SELECT t.* INTO v_team
    FROM public.tournament_teams t
    JOIN public.tournament_team_secrets s ON s.team_id = t.id
   WHERE s.join_code = v_code
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;

  IF public.tournament_team_locked(v_team.id) THEN RAISE EXCEPTION 'roster_locked'; END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = v_team.tournament_id;
  v_state := public.tournament_registration_state(v_t.id);
  IF v_state = 'deadline_passed' THEN RAISE EXCEPTION 'registration_deadline_passed'; END IF;
  IF v_state IN ('closed', 'not_accepting') THEN RAISE EXCEPTION 'registration_closed'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_team_players
     WHERE tournament_id = v_team.tournament_id AND user_id = v_user
  ) THEN RAISE EXCEPTION 'already_on_team'; END IF;

  SELECT count(*) INTO v_count FROM public.tournament_team_players WHERE team_id = v_team.id;
  IF v_count >= v_t.team_size THEN RAISE EXCEPTION 'team_full'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_team_players
     WHERE tournament_id = v_team.tournament_id AND ff_uid = v_uid
  ) THEN RAISE EXCEPTION 'duplicate_uid'; END IF;

  SELECT COALESCE(NULLIF(btrim(full_name), ''), username, 'Player')
    INTO v_name FROM public.profiles WHERE id = v_user;

  INSERT INTO public.tournament_team_players
    (tournament_id, team_id, user_id, display_name_snapshot, role,
     ff_ign, ff_uid, joined_via, user_confirmed)
  VALUES
    (v_team.tournament_id, v_team.id, v_user, COALESCE(v_name, 'Player'), 'player',
     v_ign, v_uid, 'invite_code', true)
  RETURNING id INTO v_player;

  PERFORM public.tournament_log(v_team.tournament_id, 'player_joined', 'player', v_player, NULL,
    jsonb_build_object('team', v_team.id, 'via', 'invite_code', 'uid_set', true));
  RETURN v_player;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.join_team_by_code(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_team_by_code(TEXT,TEXT,TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 14. SCORING / RESULT STATE — cancelled matches refuse results
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_match_result(
  p_match UUID,
  p_teams JSONB,
  p_expected_version INT DEFAULT NULL,
  p_as_draft BOOLEAN DEFAULT FALSE
)
RETURNS TEXT  -- 'ok' | 'draft' | 'forbidden' | 'invalid' | 'locked' | 'conflict' | 'cancelled'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_team JSONB;
  v_player JSONB;
  v_tid UUID;
  v_pid UUID;
  v_kills INT;
  v_placement INT;
  v_tour UUID;
  v_state TEXT;
  v_version INT;
  v_status TEXT;
BEGIN
  SELECT st.tournament_id, m.result_state, m.result_version, m.status
    INTO v_tour, v_state, v_version, v_status
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;
  IF NOT public.tournament_allows(v_tour, 'enter_kills') THEN RETURN 'forbidden'; END IF;
  IF v_status = 'CANCELLED' THEN RETURN 'cancelled'; END IF;
  IF v_state = 'LOCKED' THEN RETURN 'locked'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_version THEN
    RETURN 'conflict';
  END IF;

  -- Results are re-derived every time: wipe the raw rows, re-insert facts.
  DELETE FROM public.match_player_stats WHERE match_id = p_match;
  DELETE FROM public.match_team_results WHERE match_id = p_match;

  FOR v_team IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
    v_tid := NULLIF(v_team->>'team_id', '')::UUID;
    v_placement := NULLIF(v_team->>'placement', '')::INT;
    IF v_tid IS NULL THEN RETURN 'invalid'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.match_teams WHERE match_id = p_match AND team_id = v_tid) THEN
      RETURN 'invalid';
    END IF;
    IF v_placement IS NOT NULL AND (v_placement < 1 OR v_placement > 64) THEN RETURN 'invalid'; END IF;
    IF v_placement IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_teams) o
       WHERE o <> v_team AND NULLIF(o->>'placement','')::INT = v_placement
    ) THEN
      RETURN 'invalid';
    END IF;

    INSERT INTO public.match_team_results (match_id, team_id, placement)
    VALUES (p_match, v_tid, v_placement);

    FOR v_player IN SELECT * FROM jsonb_array_elements(COALESCE(v_team->'players','[]'::jsonb)) LOOP
      v_pid := NULLIF(v_player->>'player_id','')::UUID;
      v_kills := COALESCE(NULLIF(v_player->>'kills','')::INT, 0);
      IF v_pid IS NULL OR v_kills < 0 THEN RETURN 'invalid'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.tournament_team_players
         WHERE id = v_pid AND team_id = v_tid AND tournament_id = v_tour
      ) THEN
        RETURN 'invalid';
      END IF;
      INSERT INTO public.match_player_stats (match_id, team_id, player_id, kills)
      VALUES (p_match, v_tid, v_pid, v_kills);
    END LOOP;

    PERFORM public.recalc_match_team(p_match, v_tid);
  END LOOP;

  UPDATE public.tournament_matches SET
    result_state = CASE WHEN p_as_draft THEN 'DRAFT' ELSE 'SUBMITTED' END,
    status = 'COMPLETED',
    result_version = result_version + 1
  WHERE id = p_match;

  PERFORM public.tournament_log(v_tour,
    CASE WHEN p_as_draft THEN 'result_draft_saved' ELSE 'result_submitted' END,
    'match', p_match, NULL,
    jsonb_build_object('teams', jsonb_array_length(p_teams)));

  RETURN CASE WHEN p_as_draft THEN 'draft' ELSE 'ok' END;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.submit_match_result(UUID,JSONB,INT,BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_match_result(UUID,JSONB,INT,BOOLEAN) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 15. LEADERBOARDS — OFFICIAL results only (VERIFIED / LOCKED)
-- ══════════════════════════════════════════════════════════════════════════
-- Drafts must never masquerade as standings, and qualification already used
-- VERIFIED/LOCKED — the public boards now agree with it.

CREATE OR REPLACE FUNCTION public.get_tournament_team_leaderboard(
  p_tournament UUID, p_stage UUID DEFAULT NULL
)
RETURNS TABLE (
  rank BIGINT, team_id UUID, team_name TEXT, team_tag TEXT, status TEXT,
  matches_played BIGINT, total_kills BIGINT, kill_points BIGINT,
  placement_points BIGINT, total_points BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH agg AS (
    SELECT r.team_id,
           COUNT(*) AS matches_played,
           SUM(r.total_kills) AS total_kills,
           SUM(r.kill_points) AS kill_points,
           SUM(r.placement_points) AS placement_points,
           SUM(r.total_points) AS total_points,
           SUM(r.total_kills) AS kills_tiebreak,
           MIN(r.placement) AS best_placement
      FROM public.match_team_results r
      JOIN public.tournament_matches m ON m.id = r.match_id
      JOIN public.match_teams mt ON mt.match_id = m.id AND mt.team_id = r.team_id
       AND mt.participation_status = 'CONFIRMED'
      JOIN public.tournament_stages s ON s.id = m.stage_id
     WHERE s.tournament_id = p_tournament
       AND (p_stage IS NULL OR s.id = p_stage)
       AND m.result_state IN ('VERIFIED', 'LOCKED')
     GROUP BY r.team_id
  )
  SELECT ROW_NUMBER() OVER (
           ORDER BY a.total_points DESC, a.kills_tiebreak DESC,
                    a.best_placement ASC, t.team_name ASC
         )::BIGINT,
         t.id, t.team_name, t.team_tag, t.status,
         a.matches_played, a.total_kills, a.kill_points, a.placement_points, a.total_points
    FROM agg a
    JOIN public.tournament_teams t ON t.id = a.team_id
   WHERE t.status <> 'DISQUALIFIED'
   ORDER BY 1;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_team_leaderboard(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournament_team_leaderboard(UUID,UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tournament_player_leaderboard(
  p_tournament UUID, p_stage UUID DEFAULT NULL, p_limit INT DEFAULT 50
)
RETURNS TABLE (
  rank BIGINT, player_id UUID, display_name TEXT, team_name TEXT,
  total_kills BIGINT, matches_played BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT ROW_NUMBER() OVER (ORDER BY SUM(s.kills) DESC, p.display_name_snapshot ASC)::BIGINT,
         p.id, p.display_name_snapshot, t.team_name,
         SUM(s.kills), COUNT(DISTINCT s.match_id)
    FROM public.match_player_stats s
    JOIN public.tournament_matches m ON m.id = s.match_id
    JOIN public.tournament_stages st ON st.id = m.stage_id
    JOIN public.tournament_team_players p ON p.id = s.player_id
    JOIN public.tournament_teams t ON t.id = s.team_id
   WHERE st.tournament_id = p_tournament
     AND (p_stage IS NULL OR st.id = p_stage)
     AND m.result_state IN ('VERIFIED', 'LOCKED')
     AND t.status <> 'DISQUALIFIED'
   GROUP BY p.id, p.display_name_snapshot, t.team_name
   ORDER BY 1
   LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1);
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_player_leaderboard(UUID,UUID,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournament_player_leaderboard(UUID,UUID,INT) TO anon, authenticated;

-- Match result + map/group for the public match sheet.
CREATE OR REPLACE FUNCTION public.get_match_result(p_match UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour UUID;
BEGIN
  SELECT st.tournament_id INTO v_tour
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'room_released', EXISTS (
      SELECT 1 FROM public.tournament_match_rooms r
       WHERE r.match_id = p_match AND r.released_at IS NOT NULL
    ),
    'map', (SELECT r.map FROM public.tournament_match_rooms r WHERE r.match_id = p_match),
    'match_group', (SELECT r.match_group FROM public.tournament_match_rooms r WHERE r.match_id = p_match),
    'teams', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'team_id', t.id, 'team_name', t.team_name, 'team_tag', t.team_tag,
        'placement', r.placement, 'total_kills', r.total_kills,
        'kill_points', r.kill_points, 'placement_points', r.placement_points,
        'total_points', r.total_points,
        'players', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'display_name', p.display_name_snapshot, 'kills', s.kills)
            ORDER BY s.kills DESC), '[]'::jsonb)
          FROM public.match_player_stats s
          JOIN public.tournament_team_players p ON p.id = s.player_id
         WHERE s.match_id = p_match AND s.team_id = t.id
        )
      ) ORDER BY r.placement NULLS LAST, r.total_points DESC), '[]'::jsonb)
      FROM public.match_team_results r
      JOIN public.tournament_teams t ON t.id = r.team_id
     WHERE r.match_id = p_match
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_match_result(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_match_result(UUID) TO anon, authenticated;

-- Tournament payload: add registration controls + roster lock state, and a
-- per-match "room released" flag (never the credentials).
CREATE OR REPLACE FUNCTION public.get_tournament_overview(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'tournament', to_jsonb(v) - 'created_by',
    'champion', (
      SELECT jsonb_build_object('team_id', t.id, 'team_name', t.team_name, 'team_tag', t.team_tag)
        FROM public.tournament_teams t WHERE t.id = v.champion_team_id
    ),
    'stages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'stage_number', s.stage_number,
        'stage_type', s.stage_type, 'status', s.status,
        'qualification_limit', s.qualification_limit,
        'matches', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', m.id, 'match_number', m.match_number, 'status', m.status,
            'scheduled_at', m.scheduled_at, 'result_state', m.result_state,
            'team_count', (SELECT COUNT(*) FROM public.match_teams mt WHERE mt.match_id = m.id),
            'room_released', COALESCE((SELECT r.released_at IS NOT NULL
                                         FROM public.tournament_match_rooms r
                                        WHERE r.match_id = m.id), false),
            'map', (SELECT r.map FROM public.tournament_match_rooms r WHERE r.match_id = m.id),
            'match_group', (SELECT r.match_group FROM public.tournament_match_rooms r WHERE r.match_id = m.id)
          ) ORDER BY m.match_number), '[]'::jsonb)
          FROM public.tournament_matches m WHERE m.stage_id = s.id
        )
      ) ORDER BY s.stage_number), '[]'::jsonb)
      FROM public.tournament_stages s WHERE s.tournament_id = p_tournament
    ),
    'team_count', (SELECT COUNT(*) FROM public.tournament_teams WHERE tournament_id = p_tournament),
    'player_count', (SELECT COUNT(*) FROM public.tournament_team_players WHERE tournament_id = p_tournament),
    'match_count', (
      SELECT COUNT(*) FROM public.tournament_matches m
      JOIN public.tournament_stages s ON s.id = m.stage_id
      WHERE s.tournament_id = p_tournament
    ),
    'completed_matches', (
      SELECT COUNT(*) FROM public.tournament_matches m
      JOIN public.tournament_stages s ON s.id = m.stage_id
      WHERE s.tournament_id = p_tournament AND m.result_state IN ('VERIFIED','LOCKED')
    ),
    'registration_state', public.tournament_registration_state(p_tournament),
    'latest_announcement', (
      SELECT jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'created_at', a.created_at)
        FROM public.tournament_announcements a
       WHERE a.tournament_id = p_tournament
       ORDER BY a.pinned DESC, a.created_at DESC LIMIT 1
    ),
    'top_fraggers', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT * FROM public.get_tournament_player_leaderboard(p_tournament, NULL, 5)
      ) x
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_overview(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournament_overview(UUID) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 16. RLS HARDENING
-- ══════════════════════════════════════════════════════════════════════════

-- 16a. Organizer-seeded team creation must respect every registration rule.
CREATE OR REPLACE FUNCTION public.add_tournament_team(
  p_tournament UUID, p_team_name TEXT, p_team_tag TEXT DEFAULT NULL,
  p_leader_id UUID DEFAULT NULL, p_players JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id UUID;
  v_player JSONB;
  v_uid UUID;
  v_name TEXT;
  v_size INT;
  v_clean TEXT;
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'manage_teams') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.tournament_rosters_locked(p_tournament) THEN
    RAISE EXCEPTION 'roster_locked';
  END IF;

  SELECT team_size INTO v_size FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;

  v_clean := btrim(COALESCE(p_team_name, ''));
  IF length(v_clean) < 1 OR length(v_clean) > 40 THEN RAISE EXCEPTION 'invalid_team_name'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_teams
              WHERE tournament_id = p_tournament AND lower(btrim(team_name)) = lower(v_clean)) THEN
    RAISE EXCEPTION 'team_name_taken';
  END IF;

  INSERT INTO public.tournament_teams (tournament_id, team_name, team_tag, leader_id)
  VALUES (p_tournament, v_clean, NULLIF(btrim(COALESCE(p_team_tag,'')), ''), p_leader_id)
  RETURNING id INTO v_id;

  -- Every organizer-created team gets a live code immediately.
  INSERT INTO public.tournament_team_secrets (team_id, join_code)
  VALUES (v_id, public.tournament_gen_unique_code())
  ON CONFLICT (team_id) DO NOTHING;

  FOR v_player IN SELECT * FROM jsonb_array_elements(COALESCE(p_players, '[]'::JSONB)) LOOP
    v_uid := NULLIF(v_player->>'user_id', '');
    IF v_uid IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tournament_team_players
       WHERE tournament_id = p_tournament AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'already_on_team';
    END IF;
    IF (SELECT COUNT(*) FROM public.tournament_team_players WHERE team_id = v_id) >= v_size THEN
      RAISE EXCEPTION 'team_full';
    END IF;

    v_name := COALESCE(NULLIF(btrim(v_player->>'display_name'), ''),
                       (SELECT full_name FROM public.profiles WHERE id = v_uid),
                       'Player');
    INSERT INTO public.tournament_team_players (tournament_id, team_id, user_id, display_name_snapshot, role)
    VALUES (p_tournament, v_id, v_uid, v_name,
            COALESCE(v_player->>'role', CASE WHEN v_uid IS NOT NULL AND v_uid = p_leader_id THEN 'leader' ELSE 'player' END));
  END LOOP;

  PERFORM public.tournament_log(p_tournament, 'team_added', 'team', v_id, NULL,
    jsonb_build_object('name', v_clean, 'players', jsonb_array_length(COALESCE(p_players, '[]'::JSONB))));
  RETURN v_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.add_tournament_team(UUID,TEXT,TEXT,UUID,JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_tournament_team(UUID,TEXT,TEXT,UUID,JSONB) TO authenticated;

-- True when the whole tournament's rosters are frozen (organizer path).
CREATE OR REPLACE FUNCTION public.tournament_rosters_locked(p_tournament UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT rosters_locked FROM public.tournaments WHERE id = p_tournament), TRUE);
$fn$;
REVOKE EXECUTE ON FUNCTION public.tournament_rosters_locked(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tournament_rosters_locked(UUID) TO authenticated;

-- 16b. Roster/identity edits must honour the tournament-wide lock too.
CREATE OR REPLACE FUNCTION public.set_player_ff_identity(
  p_player UUID, p_ign TEXT, p_ff_uid TEXT, p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tournament UUID;
  v_team UUID;
  v_old JSONB;
BEGIN
  SELECT tournament_id, team_id INTO v_tournament, v_team
    FROM public.tournament_team_players WHERE id = p_player;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;

  IF NOT public.tournament_allows(v_tournament, 'manage_players') THEN
    -- The player themself may fix their identity UNTIL the roster freezes.
    IF public.tournament_team_locked(v_team) THEN RAISE EXCEPTION 'roster_locked'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_team_players
       WHERE id = p_player AND user_id = auth.uid()
    ) THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_ff_uid IS NOT NULL AND btrim(p_ff_uid) <> '' AND upper(btrim(p_ff_uid)) !~ '^[0-9]{6,12}$' THEN
      RAISE EXCEPTION 'invalid_uid';
    END IF;
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

-- 16c. Audit log is no longer world-readable (it holds actor names, reasons
--      and before/after payloads).
DROP POLICY IF EXISTS tournament_audit_log_read ON public.tournament_audit_log;
CREATE POLICY tournament_audit_log_read ON public.tournament_audit_log
  FOR SELECT USING (public.tournament_allows(tournament_id, 'view_audit'));

-- 16d. Draft/cancelled tournaments must not leak their children. Each child
--      read policy now walks up to the parent's status.
DO $$
DECLARE
  t TEXT;
  expr TEXT;
BEGIN
  FOR t, expr IN
    SELECT * FROM (VALUES
      ('tournament_stages',
       'EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows(tournament_id, ''view'')'),
      ('tournament_matches',
       'EXISTS (SELECT 1 FROM public.tournament_stages s JOIN public.tournaments t ON t.id = s.tournament_id WHERE s.id = stage_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows((SELECT s.tournament_id FROM public.tournament_stages s WHERE s.id = stage_id), ''view'')'),
      ('tournament_teams',
       'EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows(tournament_id, ''view'')'),
      ('tournament_team_players',
       'EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows(tournament_id, ''view'')'),
      ('match_teams',
       'EXISTS (SELECT 1 FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id JOIN public.tournaments t ON t.id = s.tournament_id WHERE m.id = match_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows((SELECT s.tournament_id FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id WHERE m.id = match_id), ''view'')'),
      ('match_player_stats',
       'EXISTS (SELECT 1 FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id JOIN public.tournaments t ON t.id = s.tournament_id WHERE m.id = match_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows((SELECT s.tournament_id FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id WHERE m.id = match_id), ''view'')'),
      ('match_team_results',
       'EXISTS (SELECT 1 FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id JOIN public.tournaments t ON t.id = s.tournament_id WHERE m.id = match_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows((SELECT s.tournament_id FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id WHERE m.id = match_id), ''view'')'),
      ('tournament_scoring_rules',
       'EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows(tournament_id, ''view'')'),
      ('stage_qualifications',
       'EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows(tournament_id, ''view'')'),
      ('tournament_announcements',
       'EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.status NOT IN (''DRAFT'',''CANCELLED'')) OR public.tournament_allows(tournament_id, ''view'')')
    ) AS v(t, expr)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (%s)', t || '_read', t, expr);
  END LOOP;
END $$;

-- 16e. FF UID / IGN are not anonymous-facing. Signed-in users keep direct
--      read (admin panels); anonymous visitors use the public RPCs instead.
DROP POLICY IF EXISTS tournament_team_players_read ON public.tournament_team_players;
CREATE POLICY tournament_team_players_read ON public.tournament_team_players
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tournaments t
             WHERE t.id = tournament_id AND t.status NOT IN ('DRAFT','CANCELLED'))
    OR public.tournament_allows(tournament_id, 'view')
  );
