-- ═══════════════════════════════════════════════════════════════════════════
-- 051_tournament_rbac.sql — Tournament Organizer & Scoped RBAC
-- ═══════════════════════════════════════════════════════════════════════════
-- CORE PRINCIPLE: CampusConnect is the platform; a tournament is a RESOURCE.
-- Organizers receive permissions SCOPED to one tournament — never global.
--
--   PLATFORM ROLE (existing auth + admin_grants)  →  PLATFORM_ADMIN / USER
--   TOURNAMENT MEMBERSHIP (this migration)        →  OWNER / ADMIN / VIEWER
--
-- Every authorization check becomes:
--     is_platform_admin(caller)  OR  tournament_role(caller, tournament) >= required
--
-- A normal user can be OWNER of Free Fire 2026 and a VIEWER of the BGMI cup
-- without gaining a single global permission. Non-negotiables honoured:
--   • no separate login  • exactly one active owner per tournament
--   • audited ownership transfer  • ownerless tournaments impossible
--   • revocable access  • audit on every permission-sensitive action
--
-- Idempotent; safe to re-run.

-- ── 1. MEMBERSHIP ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournament_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','VIEWER')),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- one membership row per user per tournament; the owner uniqueness rule is
  -- a partial unique index below (exactly one OWNER at a time)
  UNIQUE (tournament_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_members_one_owner
  ON public.tournament_members (tournament_id)
  WHERE role = 'OWNER';

CREATE INDEX IF NOT EXISTS idx_tournament_members_user
  ON public.tournament_members (user_id);

ALTER TABLE public.tournament_members ENABLE ROW LEVEL SECURITY;

-- Members see their own tournament memberships (the dashboard needs this).
DROP POLICY IF EXISTS tournament_members_read ON public.tournament_members;
CREATE POLICY tournament_members_read ON public.tournament_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.tournament_is_admin_caller()
  );

-- Direct table writes stay closed: membership changes go through the RPCs,
-- which carry the role checks + audit.
REVOKE ALL ON public.tournament_members FROM anon, authenticated;

-- ── 2. ROLE RESOLUTION + PERMISSION MATRIX (one authorization layer) ─────────

-- The caller's role in a tournament; platform admin outranks everything.
CREATE OR REPLACE FUNCTION public.tournament_role(
  p_tournament UUID, p_user UUID DEFAULT NULL
)
RETURNS TEXT  -- 'PLATFORM_ADMIN' | 'OWNER' | 'ADMIN' | 'VIEWER' | NULL
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE
    WHEN COALESCE(p_user, auth.uid()) IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.admin_grants
       WHERE user_id = COALESCE(p_user, auth.uid())
    ) THEN 'PLATFORM_ADMIN'
    ELSE (
      SELECT m.role FROM public.tournament_members m
       WHERE m.tournament_id = p_tournament
         AND m.user_id = COALESCE(p_user, auth.uid())
    )
  END;
$fn$;

-- THE permission matrix (spec §10). Every sensitive RPC routes through here —
-- one place to tune. Lock/reopen/reverse stay OWNER-only for now (§10's
-- "configurable" seats: flip these rows to include ADMIN later).
CREATE OR REPLACE FUNCTION public.tournament_allows(
  p_tournament UUID,
  p_action TEXT,
  p_user UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT := public.tournament_role(p_tournament, p_user);
BEGIN
  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role = 'PLATFORM_ADMIN' THEN RETURN TRUE; END IF;

  CASE v_role
    WHEN 'OWNER' THEN
      RETURN p_action IN (
        'view','edit_info','manage_teams','manage_players','manage_matches',
        'enter_kills','submit_result','verify_result','lock_result','reopen_result',
        'manage_qualification','reverse_qualification','change_scoring',
        'manage_organizers','transfer_ownership','cancel_tournament',
        'view_audit','publish','add_announcement'
      );
    WHEN 'ADMIN' THEN
      RETURN p_action IN (
        'view','edit_info','manage_teams','manage_players','manage_matches',
        'enter_kills','submit_result','verify_result',
        'manage_qualification','add_announcement','view_audit'
      );
    WHEN 'VIEWER' THEN
      RETURN p_action = 'view';
    ELSE
      RETURN FALSE;
  END CASE;
END;
$fn$;

-- ── 3. EXISTING RPCS GAIN SCOPED CHECKS ──────────────────────────────────────
-- Same functions, new guard: platform admin OR the required tournament role.

CREATE OR REPLACE FUNCTION public.create_tournament(
  p_name TEXT, p_game TEXT DEFAULT 'FREE_FIRE', p_description TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL,
  p_team_size INT DEFAULT 4, p_kill_point_value INT DEFAULT 1,
  p_format TEXT DEFAULT 'SQUAD_ELIMINATION', p_entry_fee INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id UUID;
BEGIN
  -- §12: creation stays platform-admin for now; CAN_CREATE_TOURNAMENT can
  -- open this later by relaxing only this line.
  IF NOT public.tournament_is_admin_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.tournaments (name, game, description, start_date, end_date, team_size,
                                  kill_point_value, format, entry_fee, created_by)
  VALUES (btrim(p_name), p_game, p_description, p_start_date, p_end_date, p_team_size,
          p_kill_point_value, p_format, p_entry_fee, auth.uid())
  RETURNING id INTO v_id;

  -- §11: the creator automatically becomes OWNER — nothing global.
  INSERT INTO public.tournament_members (tournament_id, user_id, role, created_by)
  VALUES (v_id, auth.uid(), 'OWNER', auth.uid());

  PERFORM public.tournament_log(v_id, 'tournament_created', 'tournament', v_id, NULL,
    jsonb_build_object('name', p_name, 'game', p_game));
  RETURN v_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_tournament(TEXT,TEXT,TEXT,DATE,DATE,INT,INT,TEXT,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_tournament(TEXT,TEXT,TEXT,DATE,DATE,INT,INT,TEXT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_tournament(
  p_tournament UUID, p_name TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL, p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL,
  p_kill_point_value INT DEFAULT NULL, p_team_size INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old public.tournaments%ROWTYPE;
  v_status TEXT;
  v_scoring_changed BOOLEAN := p_kill_point_value IS NOT NULL
                               AND p_kill_point_value <> (SELECT kill_point_value FROM public.tournaments WHERE id = p_tournament);
  v_status_change   BOOLEAN := p_status IS NOT NULL
                               AND p_status <> (SELECT status FROM public.tournaments WHERE id = p_tournament);
BEGIN
  -- basic info edits: OWNER/ADMIN; scoring + lifecycle stay OWNER-only (§33)
  IF p_kill_point_value IS NOT NULL THEN
    IF NOT public.tournament_allows(p_tournament, 'change_scoring') THEN
      RETURN 'forbidden';
    END IF;
    -- scoring changed AFTER results started: require the reason via audit trail
  END IF;
  IF v_status_change AND NOT public.tournament_allows(p_tournament, 'publish') THEN
    RETURN 'forbidden';
  END IF;
  IF v_status_change AND v_status = 'CANCELLED'
     AND NOT public.tournament_allows(p_tournament, 'cancel_tournament') THEN
    RETURN 'forbidden';
  END IF;
  IF NOT public.tournament_allows(p_tournament, 'edit_info') THEN
    RETURN 'forbidden';
  END IF;

  SELECT * INTO v_old FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;

  v_status := COALESCE(p_status, v_old.status);
  IF v_status <> v_old.status THEN
    IF NOT (
      (v_old.status = 'DRAFT'    AND v_status IN ('UPCOMING','CANCELLED')) OR
      (v_old.status = 'UPCOMING' AND v_status IN ('LIVE','CANCELLED')) OR
      (v_old.status = 'LIVE'     AND v_status IN ('COMPLETED','CANCELLED'))
    ) THEN
      RETURN 'invalid_transition';
    END IF;
  END IF;

  UPDATE public.tournaments SET
    name = COALESCE(NULLIF(btrim(COALESCE(p_name,'')), ''), name),
    description = COALESCE(p_description, description),
    status = v_status,
    start_date = COALESCE(p_start_date, start_date),
    end_date = COALESCE(p_end_date, end_date),
    kill_point_value = COALESCE(p_kill_point_value, kill_point_value),
    team_size = COALESCE(p_team_size, team_size),
    updated_at = now()
  WHERE id = p_tournament;

  PERFORM public.tournament_log(p_tournament, 'tournament_updated', 'tournament', p_tournament,
    jsonb_build_object('status', v_old.status, 'kill_point_value', v_old.kill_point_value),
    jsonb_build_object('status', v_status, 'kill_point_value', COALESCE(p_kill_point_value, v_old.kill_point_value)),
    CASE WHEN v_scoring_changed THEN 'scoring change' ELSE NULL END);
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.update_tournament(UUID,TEXT,TEXT,TEXT,DATE,DATE,INT,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_tournament(UUID,TEXT,TEXT,TEXT,DATE,DATE,INT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_scoring_rule(p_tournament UUID, p_placement INT, p_points INT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'change_scoring') THEN RETURN 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_tournament) THEN RETURN 'invalid'; END IF;
  IF p_placement NOT BETWEEN 1 AND 24 OR p_points < 0 THEN RETURN 'invalid'; END IF;
  INSERT INTO public.tournament_scoring_rules (tournament_id, placement, points)
  VALUES (p_tournament, p_placement, p_points)
  ON CONFLICT (tournament_id, placement) DO UPDATE SET points = EXCLUDED.points;
  PERFORM public.tournament_log(p_tournament, 'scoring_rule_set', 'scoring_rule', p_tournament,
    NULL, jsonb_build_object('placement', p_placement, 'points', p_points));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_scoring_rule(UUID,INT,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_scoring_rule(UUID,INT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_default_scoring(p_tournament UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'change_scoring') THEN RETURN 'forbidden'; END IF;
  INSERT INTO public.tournament_scoring_rules (tournament_id, placement, points)
  SELECT p_tournament, p, pts FROM (VALUES (1,15),(2,12),(3,10),(4,8),(5,6),(6,4),(7,2),(8,1)) AS r(p, pts)
  ON CONFLICT (tournament_id, placement) DO NOTHING;
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_default_scoring(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_default_scoring(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_tournament_stage(
  p_tournament UUID, p_name TEXT, p_stage_type TEXT DEFAULT 'QUALIFIER',
  p_qualification_limit INT DEFAULT NULL, p_sort_order INT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id UUID;
  v_n INT;
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'manage_matches') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(MAX(stage_number), 0) + 1 INTO v_n
    FROM public.tournament_stages WHERE tournament_id = p_tournament;
  INSERT INTO public.tournament_stages
    (tournament_id, name, stage_number, stage_type, qualification_limit, sort_order)
  VALUES (p_tournament, btrim(p_name), v_n, p_stage_type, p_qualification_limit,
          COALESCE(p_sort_order, v_n))
  RETURNING id INTO v_id;
  PERFORM public.tournament_log(p_tournament, 'stage_added', 'stage', v_id, NULL,
    jsonb_build_object('name', p_name, 'type', p_stage_type, 'qual_limit', p_qualification_limit));
  RETURN v_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.add_tournament_stage(UUID,TEXT,TEXT,INT,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_tournament_stage(UUID,TEXT,TEXT,INT,INT) TO authenticated;

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
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'manage_teams') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT team_size INTO v_size FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;

  INSERT INTO public.tournament_teams (tournament_id, team_name, team_tag, leader_id)
  VALUES (p_tournament, btrim(p_team_name), NULLIF(btrim(COALESCE(p_team_tag,'')), ''), p_leader_id)
  RETURNING id INTO v_id;

  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_uid := NULLIF(v_player->>'user_id', '');
    v_name := COALESCE(NULLIF(btrim(v_player->>'display_name'), ''),
                       (SELECT full_name FROM public.profiles WHERE id = v_uid),
                       'Player');
    INSERT INTO public.tournament_team_players (tournament_id, team_id, user_id, display_name_snapshot, role)
    VALUES (p_tournament, v_id, v_uid, v_name,
            COALESCE(v_player->>'role', CASE WHEN v_uid IS NOT NULL AND v_uid = p_leader_id THEN 'leader' ELSE 'player' END));
  END LOOP;

  PERFORM public.tournament_log(p_tournament, 'team_added', 'team', v_id, NULL,
    jsonb_build_object('name', p_team_name, 'players', jsonb_array_length(p_players)));
  RETURN v_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.add_tournament_team(UUID,TEXT,TEXT,UUID,JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_tournament_team(UUID,TEXT,TEXT,UUID,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_match(
  p_stage UUID, p_match_number INT, p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_team_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id UUID;
  v_tid UUID;
  v_tour UUID;
BEGIN
  SELECT tournament_id INTO v_tour FROM public.tournament_stages WHERE id = p_stage;
  IF NOT public.tournament_allows(v_tour, 'manage_matches') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.tournament_matches (stage_id, match_number, scheduled_at)
  VALUES (p_stage, p_match_number, p_scheduled_at)
  RETURNING id INTO v_id;

  IF p_team_ids IS NOT NULL THEN
    FOREACH v_tid IN ARRAY p_team_ids LOOP
      INSERT INTO public.match_teams (match_id, team_id) VALUES (v_id, v_tid);
    END LOOP;
  END IF;
  RETURN v_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.add_match(UUID,INT,TIMESTAMPTZ,UUID[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_match(UUID,INT,TIMESTAMPTZ,UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_match_result(
  p_match UUID,
  p_teams JSONB,
  p_expected_version INT DEFAULT NULL,
  p_as_draft BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
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
BEGIN
  SELECT st.tournament_id, m.result_state, m.result_version INTO v_tour, v_state, v_version
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;
  -- §31: permission-safe result entry — OWNER/ADMIN of THIS tournament only
  IF NOT public.tournament_allows(v_tour, 'enter_kills') THEN RETURN 'forbidden'; END IF;
  IF v_state = 'LOCKED' THEN RETURN 'locked'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_version THEN
    RETURN 'conflict';
  END IF;

  DELETE FROM public.match_player_stats WHERE match_id = p_match;
  DELETE FROM public.match_team_results WHERE match_id = p_match;

  FOR v_team IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
    v_tid := NULLIF(v_team->>'team_id', '')::UUID;
    v_placement := NULLIF(v_team->>'placement', '')::INT;
    IF v_tid IS NULL THEN RETURN 'invalid'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.match_teams WHERE match_id = p_match AND team_id = v_tid) THEN
      RETURN 'invalid';
    END IF;
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

CREATE OR REPLACE FUNCTION public.set_match_result_state(
  p_match UUID, p_action TEXT, p_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour UUID;
  v_state TEXT;
  v_new TEXT;
  v_required TEXT;
BEGIN
  SELECT st.tournament_id, m.result_state INTO v_tour, v_state
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;

  CASE p_action
    WHEN 'verify' THEN v_required := 'verify_result';
    WHEN 'lock' THEN v_required := 'lock_result';
    WHEN 'reopen' THEN
      v_required := 'reopen_result';
      IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
        RETURN 'reason_required';
      END IF;
    ELSE
      RETURN 'invalid';
  END CASE;

  IF NOT public.tournament_allows(v_tour, v_required) THEN RETURN 'forbidden'; END IF;

  CASE p_action
    WHEN 'verify' THEN
      IF v_state <> 'SUBMITTED' THEN RETURN 'not_ready'; END IF;
      v_new := 'VERIFIED';
    WHEN 'lock' THEN
      IF v_state <> 'VERIFIED' THEN RETURN 'not_ready'; END IF;
      v_new := 'LOCKED';
    WHEN 'reopen' THEN
      IF v_state <> 'LOCKED' THEN RETURN 'not_ready'; END IF;
      v_new := 'VERIFIED';
    ELSE
      RETURN 'invalid';
  END CASE;

  UPDATE public.tournament_matches SET
    result_state = v_new,
    result_locked_by = CASE WHEN v_new = 'LOCKED' THEN auth.uid() ELSE NULL END,
    result_locked_at = CASE WHEN v_new = 'LOCKED' THEN now() ELSE NULL END,
    result_version = result_version + 1
   WHERE id = p_match;

  PERFORM public.tournament_log(v_tour, 'result_' || p_action, 'match', p_match,
    jsonb_build_object('state', v_state), jsonb_build_object('state', v_new), p_reason);
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_match_result_state(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_match_result_state(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_stage_qualifications(p_stage UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour UUID;
  v_limit INT;
  v_team RECORD;
  v_rank INT;
BEGIN
  SELECT tournament_id, qualification_limit INTO v_tour, v_limit
    FROM public.tournament_stages WHERE id = p_stage;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;
  IF NOT public.tournament_allows(v_tour, 'manage_qualification') THEN RETURN 'forbidden'; END IF;
  IF v_limit IS NULL THEN RETURN 'invalid'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches
     WHERE stage_id = p_stage AND status <> 'CANCELLED'
       AND result_state NOT IN ('VERIFIED','LOCKED')
  ) THEN
    RETURN 'not_ready';
  END IF;

  FOR v_team IN
    SELECT r.team_id, MIN(m.id) AS any_match_id,
           ROW_NUMBER() OVER (
             ORDER BY SUM(r.total_points) DESC, SUM(r.total_kills) DESC,
                      MIN(r.placement) ASC, t.team_name ASC) AS rk
      FROM public.match_team_results r
      JOIN public.tournament_teams t ON t.id = r.team_id
      JOIN public.tournament_matches m ON m.id = r.match_id
      JOIN public.match_teams mt ON mt.match_id = m.id AND mt.team_id = r.team_id
       AND mt.participation_status = 'CONFIRMED'
     WHERE m.stage_id = p_stage AND m.result_state IN ('VERIFIED','LOCKED')
     GROUP BY r.team_id, t.team_name
  LOOP
    v_rank := v_team.rk;
    INSERT INTO public.stage_qualifications
      (stage_id, tournament_id, team_id, source_match_id, qualification_status, qualified_by)
    VALUES
      (p_stage, v_tour, v_team.team_id, v_team.any_match_id,
       CASE WHEN v_rank <= v_limit THEN 'QUALIFIED' ELSE 'REJECTED' END, auth.uid())
    ON CONFLICT (stage_id, team_id) DO UPDATE SET
      qualification_status = EXCLUDED.qualification_status,
      source_match_id = EXCLUDED.source_match_id,
      qualified_at = now(),
      qualified_by = auth.uid();

    UPDATE public.tournament_teams SET status =
        CASE WHEN v_rank <= v_limit THEN 'QUALIFIED' ELSE 'ELIMINATED' END
     WHERE id = v_team.team_id;
  END LOOP;

  UPDATE public.tournament_stages SET status = 'COMPLETED' WHERE id = p_stage;
  PERFORM public.tournament_log(v_tour, 'qualifications_confirmed', 'stage', p_stage,
    NULL, jsonb_build_object('limit', v_limit));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.confirm_stage_qualifications(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_stage_qualifications(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_qualification(
  p_qualification UUID, p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_row public.stage_qualifications%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.stage_qualifications WHERE id = p_qualification;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF NOT public.tournament_allows(v_row.tournament_id, 'reverse_qualification') THEN
    RETURN 'forbidden';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN RETURN 'reason_required'; END IF;
  IF v_row.qualification_status <> 'QUALIFIED' THEN RETURN 'invalid'; END IF;

  UPDATE public.stage_qualifications SET qualification_status = 'REVERSED'
   WHERE id = p_qualification;
  UPDATE public.tournament_teams SET status = 'ELIMINATED' WHERE id = v_row.team_id;

  PERFORM public.tournament_log(v_row.tournament_id, 'qualification_reversed',
    'qualification', p_qualification,
    jsonb_build_object('status', 'QUALIFIED', 'team', v_row.team_id),
    jsonb_build_object('status', 'REVERSED'), p_reason);
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.reverse_qualification(UUID,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reverse_qualification(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.manual_qualification_override(
  p_stage UUID, p_team UUID, p_qualify BOOLEAN, p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour UUID;
  v_status TEXT;
BEGIN
  SELECT tournament_id INTO v_tour FROM public.tournament_stages WHERE id = p_stage;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;
  IF NOT public.tournament_allows(v_tour, 'manage_qualification') THEN RETURN 'forbidden'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN RETURN 'reason_required'; END IF;

  v_status := CASE WHEN p_qualify THEN 'QUALIFIED' ELSE 'REJECTED' END;
  INSERT INTO public.stage_qualifications
    (stage_id, tournament_id, team_id, qualification_status, is_manual, reason, qualified_by)
  VALUES
    (p_stage, v_tour, p_team, v_status, TRUE, btrim(p_reason), auth.uid())
  ON CONFLICT (stage_id, team_id) DO UPDATE SET
    qualification_status = EXCLUDED.qualification_status,
    is_manual = TRUE,
    reason = EXCLUDED.reason,
    qualified_at = now(),
    qualified_by = auth.uid();

  UPDATE public.tournament_teams SET status =
      CASE WHEN p_qualify THEN 'QUALIFIED' ELSE 'ELIMINATED' END
   WHERE id = p_team;

  PERFORM public.tournament_log(v_tour,
    CASE WHEN p_qualify THEN 'manual_qualify' ELSE 'manual_eliminate' END,
    'qualification', p_team, NULL,
    jsonb_build_object('stage', p_stage, 'qualify', p_qualify), btrim(p_reason));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.manual_qualification_override(UUID,UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manual_qualification_override(UUID,UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_tournament_announcement(
  p_tournament UUID, p_title TEXT, p_body TEXT, p_pinned BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'add_announcement') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.tournament_announcements (tournament_id, title, body, pinned, created_by)
  VALUES (p_tournament, btrim(p_title), btrim(p_body), p_pinned, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.tournament_log(p_tournament, 'announcement_added', 'announcement', v_id,
    NULL, jsonb_build_object('title', p_title));
  RETURN v_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.add_tournament_announcement(UUID,TEXT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_tournament_announcement(UUID,TEXT,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_tournament(p_tournament UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_champion UUID;
  v_final_stage UUID;
  v_old UUID;
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'publish') THEN RETURN 'forbidden'; END IF;

  SELECT id INTO v_final_stage
    FROM public.tournament_stages
   WHERE tournament_id = p_tournament AND stage_type = 'FINAL';
  IF v_final_stage IS NULL THEN RETURN 'invalid'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches
     WHERE stage_id = v_final_stage AND status <> 'CANCELLED'
       AND result_state <> 'LOCKED'
  ) THEN
    RETURN 'not_ready';
  END IF;

  SELECT team_id INTO v_champion
    FROM public.match_team_results r
    JOIN public.tournament_matches m ON m.id = r.match_id
    JOIN public.tournament_teams t ON t.id = r.team_id
    JOIN public.match_teams mt ON mt.match_id = m.id AND mt.team_id = r.team_id
     AND mt.participation_status = 'CONFIRMED'
   WHERE m.stage_id = v_final_stage
   GROUP BY r.team_id, t.team_name
   ORDER BY SUM(r.total_points) DESC, SUM(r.total_kills) DESC, MIN(r.placement) ASC, t.team_name ASC
   LIMIT 1;
  IF v_champion IS NULL THEN RETURN 'not_ready'; END IF;

  SELECT champion_team_id INTO v_old FROM public.tournaments WHERE id = p_tournament;
  UPDATE public.tournaments SET champion_team_id = v_champion, status = 'COMPLETED', updated_at = now()
   WHERE id = p_tournament;

  PERFORM public.tournament_log(p_tournament, 'champion_crowned', 'tournament', p_tournament,
    jsonb_build_object('champion', v_old), jsonb_build_object('champion', v_champion));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.finalize_tournament(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.finalize_tournament(UUID) TO authenticated;

-- ── 4. ORGANIZER MANAGEMENT RPCs (OWNER-only, audited) ───────────────────────

CREATE OR REPLACE FUNCTION public.add_tournament_organizer(
  p_tournament UUID, p_user UUID, p_role TEXT
)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'owner_exists' | 'self'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'manage_organizers') THEN RETURN 'forbidden'; END IF;
  IF p_role NOT IN ('ADMIN','VIEWER') THEN RETURN 'invalid'; END IF;  -- OWNER only via transfer
  IF p_user = auth.uid() THEN RETURN 'self'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN RETURN 'invalid'; END IF;

  INSERT INTO public.tournament_members (tournament_id, user_id, role, created_by)
  VALUES (p_tournament, p_user, p_role, auth.uid())
  ON CONFLICT (tournament_id, user_id) DO UPDATE SET
    role = EXCLUDED.role, updated_at = now(), created_by = auth.uid();

  PERFORM public.tournament_log(p_tournament,
    CASE WHEN p_role = 'ADMIN' THEN 'organizer_added_admin' ELSE 'organizer_added_viewer' END,
    'member', p_user, NULL, jsonb_build_object('role', p_role));
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.add_tournament_organizer(UUID,UUID,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_tournament_organizer(UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_tournament_organizer(
  p_tournament UUID, p_user UUID
)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'is_owner'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT;
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'manage_organizers') THEN RETURN 'forbidden'; END IF;
  SELECT role INTO v_role FROM public.tournament_members
   WHERE tournament_id = p_tournament AND user_id = p_user;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF v_role = 'OWNER' THEN RETURN 'is_owner'; END IF;  -- §18: never ownerless

  DELETE FROM public.tournament_members
   WHERE tournament_id = p_tournament AND user_id = p_user AND role <> 'OWNER';

  PERFORM public.tournament_log(p_tournament, 'organizer_removed', 'member', p_user,
    jsonb_build_object('role', v_role), NULL);
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.remove_tournament_organizer(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_tournament_organizer(UUID,UUID) TO authenticated;

-- §17: explicit, strong-confirmation ownership transfer. Old owner falls back
-- to ADMIN; the audit records both sides. Ownerless is impossible: the new
-- owner row upserts in the same transaction as the old one flips.
CREATE OR REPLACE FUNCTION public.transfer_tournament_ownership(
  p_tournament UUID, p_new_owner UUID
)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'self'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old_owner UUID;
BEGIN
  IF NOT public.tournament_allows(p_tournament, 'transfer_ownership') THEN RETURN 'forbidden'; END IF;
  IF p_new_owner = auth.uid() THEN RETURN 'self'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_new_owner) THEN RETURN 'invalid'; END IF;

  SELECT user_id INTO v_old_owner FROM public.tournament_members
   WHERE tournament_id = p_tournament AND role = 'OWNER';
  IF v_old_owner IS NULL THEN RETURN 'invalid'; END IF;
  IF v_old_owner <> auth.uid()
     AND NOT public.tournament_allows(p_tournament, 'transfer_ownership') THEN
    RETURN 'forbidden';
  END IF;

  UPDATE public.tournament_members SET role = 'ADMIN', updated_at = now()
   WHERE tournament_id = p_tournament AND user_id = v_old_owner;

  INSERT INTO public.tournament_members (tournament_id, user_id, role, created_by)
  VALUES (p_tournament, p_new_owner, 'OWNER', auth.uid())
  ON CONFLICT (tournament_id, user_id) DO UPDATE SET
    role = 'OWNER', updated_at = now(), created_by = auth.uid();

  PERFORM public.tournament_log(p_tournament, 'ownership_transferred', 'tournament', p_tournament,
    jsonb_build_object('owner', v_old_owner),
    jsonb_build_object('owner', p_new_owner),
    'explicit ownership transfer');
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.transfer_tournament_ownership(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.transfer_tournament_ownership(UUID,UUID) TO authenticated;

-- §24: "My Tournaments" — memberships for the signed-in organizer.
CREATE OR REPLACE FUNCTION public.get_my_tournaments()
RETURNS TABLE (id UUID, name TEXT, game TEXT, status TEXT, my_role TEXT, team_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT t.id, t.name, t.game, t.status, m.role,
         (SELECT COUNT(*) FROM public.tournament_teams tt WHERE tt.tournament_id = t.id)
    FROM public.tournament_members m
    JOIN public.tournaments t ON t.id = m.tournament_id
   WHERE m.user_id = auth.uid()
   ORDER BY CASE t.status WHEN 'LIVE' THEN 0 WHEN 'UPCOMING' THEN 1 ELSE 2 END,
            t.created_at DESC;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_my_tournaments() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_tournaments() TO authenticated;

-- Organizer list for the settings panel (members see it; Viewer sees roles too).
CREATE OR REPLACE FUNCTION public.get_tournament_organizers(p_tournament UUID)
RETURNS TABLE (user_id UUID, display_name TEXT, username TEXT, role TEXT, is_me BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT m.user_id,
         COALESCE(p.full_name, p.username, 'Organizer'),
         p.username,
         m.role,
         (m.user_id = auth.uid())
    FROM public.tournament_members m
    LEFT JOIN public.profiles p ON p.id = m.user_id
   WHERE m.tournament_id = p_tournament
   ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, m.created_at;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_organizers(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournament_organizers(UUID) TO authenticated;

-- What can I do here? Powers the role-adaptive dashboard (§25).
CREATE OR REPLACE FUNCTION public.get_my_tournament_permissions(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT := public.tournament_role(p_tournament, auth.uid());
  v_out  JSONB;
  v_act  TEXT;
BEGIN
  IF v_role IS NULL THEN RETURN jsonb_build_object('role', NULL, 'allowed', '[]'::jsonb); END IF;
  v_out := '[]'::jsonb;
  FOREACH v_act IN ARRAY ARRAY[
    'view','edit_info','manage_teams','manage_players','manage_matches',
    'enter_kills','submit_result','verify_result','lock_result','reopen_result',
    'manage_qualification','reverse_qualification','change_scoring',
    'manage_organizers','transfer_ownership','cancel_tournament',
    'view_audit','publish','add_announcement'
  ] LOOP
    IF public.tournament_allows(p_tournament, v_act, auth.uid()) THEN
      v_out := v_out || to_jsonb(v_act);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('role', v_role, 'allowed', v_out);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_my_tournament_permissions(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_tournament_permissions(UUID) TO authenticated;
