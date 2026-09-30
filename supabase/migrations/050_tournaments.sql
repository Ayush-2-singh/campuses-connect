-- ═══════════════════════════════════════════════════════════════════════════
-- 050_tournaments.sql — Free Fire Tournament Management System
-- ═══════════════════════════════════════════════════════════════════════════
-- CORE PRINCIPLE: the admin records FACTS (placements, raw player kills);
-- the system calculates EVERYTHING else. No client ever supplies totals.
--
--   player kills → team kills → kill points ┐
--   placement  → placement points (config)  ├→ match total → stage board
--                                           ┘      → qualification → next stage
--                                                  → final board → champion
--
-- REUSE: profiles/auth (existing), admin authorisation via the EXISTING
-- admin_grants / is_platform_admin() (20261001), RLS conventions, and
-- jsonb audit payloads. All derived columns are ONLY written by the scoring
-- RPCs; clients get INSERT/UPDATE nowhere except through them.
--
-- All statements are idempotent; safe to re-run.

-- ── 1. TOURNAMENTS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournaments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 80),
  game             TEXT NOT NULL DEFAULT 'FREE_FIRE'
                     CHECK (game IN ('FREE_FIRE','BGMI','VALORANT','CHESS')),
  status           TEXT NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','UPCOMING','LIVE','COMPLETED','CANCELLED')),
  description      TEXT,
  start_date       DATE,
  end_date         DATE,
  format           TEXT NOT NULL DEFAULT 'SQUAD_ELIMINATION',
  team_size        INT  NOT NULL DEFAULT 4 CHECK (team_size BETWEEN 1 AND 6),
  entry_fee        INT  NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  kill_point_value INT  NOT NULL DEFAULT 1 CHECK (kill_point_value BETWEEN 0 AND 10),
  champion_team_id UUID,  -- set ONLY by finalize_tournament()
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. STAGES (Day 1 / Day 2 / Grand Final — a proper model, not UI text) ────

CREATE TABLE IF NOT EXISTS public.tournament_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id       UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name                TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  stage_number        INT  NOT NULL CHECK (stage_number >= 1),
  stage_type          TEXT NOT NULL DEFAULT 'QUALIFIER'
                        CHECK (stage_type IN ('QUALIFIER','SEMIFINAL','FINAL')),
  qualification_limit INT,  -- NULL = no auto-qualification from this stage
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','LIVE','COMPLETED')),
  sort_order          INT  NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, stage_number)
);

-- ── 3. MATCHES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id      UUID NOT NULL REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  match_number  INT  NOT NULL CHECK (match_number >= 1),
  scheduled_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'SCHEDULED'
                  CHECK (status IN ('SCHEDULED','LIVE','COMPLETED','CANCELLED')),
  result_state  TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (result_state IN ('NONE','DRAFT','SUBMITTED','VERIFIED','LOCKED')),
  result_version INT NOT NULL DEFAULT 0,          -- optimistic concurrency
  result_locked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result_locked_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_id, match_number)
);

-- ── 4. TEAMS (tournament-scoped; the SAME team row continues across stages) ──

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_name     TEXT NOT NULL CHECK (length(btrim(team_name)) BETWEEN 1 AND 40),
  team_tag      TEXT CHECK (team_tag IS NULL OR length(btrim(team_tag)) <= 6),
  leader_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','QUALIFIED','ELIMINATED','DISQUALIFIED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, team_name)
);

-- ── 5. PLAYERS (profile link + display-name SNAPSHOT for immutability) ───────

CREATE TABLE IF NOT EXISTS public.tournament_team_players (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id          UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id                UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name_snapshot  TEXT NOT NULL,           -- frozen at registration time
  role                   TEXT NOT NULL DEFAULT 'player'
                           CHECK (role IN ('leader','player','substitute')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, display_name_snapshot)
);

-- ── 6. MATCH PARTICIPANTS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.match_teams (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id             UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  team_id              UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  participation_status TEXT NOT NULL DEFAULT 'CONFIRMED'
                         CHECK (participation_status IN ('CONFIRMED','WITHDRAWN','DISQUALIFIED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id)
);

-- ── 7. RAW PLAYER KILLS — the source of truth ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.match_player_stats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES public.tournament_team_players(id) ON DELETE CASCADE,
  kills      INT  NOT NULL DEFAULT 0 CHECK (kills >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- the player must belong to THE team the admin filed them under
  UNIQUE (match_id, team_id, player_id)
);

-- ── 8. DERIVED TEAM RESULTS — written ONLY by recalc RPCs ────────────────────

CREATE TABLE IF NOT EXISTS public.match_team_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  team_id          UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  placement        INT CHECK (placement >= 1),
  total_kills      INT  NOT NULL DEFAULT 0,
  kill_points      INT  NOT NULL DEFAULT 0,
  placement_points INT  NOT NULL DEFAULT 0,
  total_points     INT  NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id)
);

-- ── 9. CONFIGURABLE PLACEMENT SCORING (per tournament, not hardcoded) ────────

CREATE TABLE IF NOT EXISTS public.tournament_scoring_rules (
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  placement     INT  NOT NULL CHECK (placement BETWEEN 1 AND 24),
  points        INT  NOT NULL CHECK (points >= 0),
  PRIMARY KEY (tournament_id, placement)
);

-- ── 10. QUALIFICATION RECORDS — explicit, reversible, never hard-deleted ─────

CREATE TABLE IF NOT EXISTS public.stage_qualifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id             UUID NOT NULL REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  tournament_id        UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id              UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  source_match_id      UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  qualification_status TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (qualification_status IN ('PENDING','QUALIFIED','REJECTED','REVERSED')),
  is_manual            BOOLEAN NOT NULL DEFAULT FALSE,
  reason               TEXT,
  qualified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- one live row per team/stage: reversal flips status instead of deleting
  UNIQUE (stage_id, team_id)
);

-- ── 11. ANNOUNCEMENTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournament_announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  body          TEXT NOT NULL,
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 12. AUDIT LOG — every sensitive action, old→new, with reason ─────────────

CREATE TABLE IF NOT EXISTS public.tournament_audit_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name    TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     UUID,
  old_value     JSONB,
  new_value     JSONB,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taudit_tournament ON public.tournament_audit_log (tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mps_match ON public.match_player_stats (match_id);
CREATE INDEX IF NOT EXISTS idx_mtr_match ON public.match_team_results (match_id);
CREATE INDEX IF NOT EXISTS idx_mteams_match ON public.match_teams (match_id);

-- NOTE: production has TWO is_platform_admin() overloads (zero-arg and
-- uid-arg). is_platform_admin() without parens would be ambiguous to the
-- planner, so every call site uses the explicit zero-arg form below.
CREATE OR REPLACE FUNCTION public.tournament_is_admin_caller()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid()
  );
$fn$;

-- ══════════════════════════════════════════════════════════════════════════
-- RLS — public can read everything finished; writes ONLY via RPCs.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tournaments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_stages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_team_players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_player_stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_team_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_scoring_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_qualifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_announcements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_audit_log      ENABLE ROW LEVEL SECURITY;

-- Tournaments: hidden in DRAFT/CANCELLED from the public; readable otherwise.
DROP POLICY IF EXISTS tournaments_read ON public.tournaments;
CREATE POLICY tournaments_read ON public.tournaments
  FOR SELECT USING (status NOT IN ('DRAFT', 'CANCELLED'));

DROP POLICY IF EXISTS tournaments_admin_write ON public.tournaments;
CREATE POLICY tournaments_admin_write ON public.tournaments
  FOR UPDATE USING (public.tournament_is_admin_caller())
  WITH CHECK (public.tournament_is_admin_caller());

DROP POLICY IF EXISTS tournaments_admin_insert ON public.tournaments;
CREATE POLICY tournaments_admin_insert ON public.tournaments
  FOR INSERT WITH CHECK (public.tournament_is_admin_caller() AND created_by = auth.uid());

-- Everything below: SELECT for everyone (parent tournament gates drafts via
-- join where it matters — the RPCs re-check server-side anyway).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tournament_stages','tournament_matches','tournament_teams',
    'tournament_team_players','match_teams','match_player_stats',
    'match_team_results','tournament_scoring_rules',
    'stage_qualifications','tournament_announcements','tournament_audit_log'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_read', t);
  END LOOP;
END $$;

-- No INSERT/UPDATE/DELETE policies exist on the child tables: every write
-- goes through the SECURITY DEFINER RPCs below (same lockdown pattern as
-- live chat / game rooms). Audit log is append-only via RPC.

-- ══════════════════════════════════════════════════════════════════════════
-- HELPERS
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tournament_is_admin(p_tournament UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.tournament_is_admin_caller();
$fn$;

CREATE OR REPLACE FUNCTION public.tournament_log(
  p_tournament UUID, p_action TEXT, p_entity TEXT, p_entity_id UUID,
  p_old JSONB, p_new JSONB, p_reason TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.tournament_audit_log
    (tournament_id, actor_id, actor_name, action, entity, entity_id, old_value, new_value, reason)
  VALUES
    (p_tournament, auth.uid(),
     COALESCE((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'admin'),
     p_action, p_entity, p_entity_id, p_old, p_new, p_reason);
END;
$fn$;

-- ══════════════════════════════════════════════════════════════════════════
-- SETUP RPCs (admin = platform admin, existing grant system)
-- ══════════════════════════════════════════════════════════════════════════

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
  IF NOT public.tournament_is_admin_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.tournaments (name, game, description, start_date, end_date, team_size,
                                  kill_point_value, format, entry_fee, created_by)
  VALUES (btrim(p_name), p_game, p_description, p_start_date, p_end_date, p_team_size,
          p_kill_point_value, p_format, p_entry_fee, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.tournament_log(v_id, 'tournament_created', 'tournament', v_id, NULL,
    jsonb_build_object('name', p_name, 'game', p_game, 'kill_point_value', p_kill_point_value));
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
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;
  SELECT * INTO v_old FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;

  -- forward-only status machine; CANCELLED allowed from anything not COMPLETED
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
    p_description);
  RETURN 'ok';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.update_tournament(UUID,TEXT,TEXT,TEXT,DATE,DATE,INT,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_tournament(UUID,TEXT,TEXT,TEXT,DATE,DATE,INT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_scoring_rule(p_tournament UUID, p_placement INT, p_points INT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;
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

-- Bulk: standard 8-slot table in one call.
CREATE OR REPLACE FUNCTION public.set_default_scoring(p_tournament UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;
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
  IF NOT public.tournament_is_admin_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
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
  IF NOT public.tournament_is_admin_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
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
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
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

-- ══════════════════════════════════════════════════════════════════════════
-- SCORING ENGINE — the ONE calculation, used everywhere (server-authoritative)
-- ══════════════════════════════════════════════════════════════════════════

-- Recalculate one team's derived result inside one match.
-- Returns 'ok' | 'forbidden' | 'invalid'.
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
  SELECT st.tournament_id, st.tournament_id INTO v_tour
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

-- ── THE ADMIN RESULT-ENTRY RPC ──────────────────────────────────────────────
-- Admin enters FACTS only: per-team placement + per-player kills.
-- p_teams: [{team_id, placement, players:[{player_id, kills}]}]
-- Everything derived is computed HERE; client numbers are ignored.
CREATE OR REPLACE FUNCTION public.submit_match_result(
  p_match UUID,
  p_teams JSONB,
  p_expected_version INT DEFAULT NULL,
  p_as_draft BOOLEAN DEFAULT FALSE
)
RETURNS TEXT  -- 'ok' | 'draft' | 'forbidden' | 'invalid' | 'locked' | 'conflict'
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
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;

  SELECT st.tournament_id, m.result_state, m.result_version INTO v_tour, v_state, v_version
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;
  IF v_state = 'LOCKED' THEN RETURN 'locked'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_version THEN
    RETURN 'conflict';  -- another admin modified it meanwhile
  END IF;

  -- Wipe prior raw rows for a clean resubmission (results are re-derived).
  DELETE FROM public.match_player_stats WHERE match_id = p_match;
  DELETE FROM public.match_team_results WHERE match_id = p_match;

  FOR v_team IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
    v_tid := NULLIF(v_team->>'team_id', '')::UUID;
    v_placement := NULLIF(v_team->>'placement', '')::INT;
    IF v_tid IS NULL THEN RETURN 'invalid'; END IF;

    -- the team must actually be a participant of this match
    IF NOT EXISTS (SELECT 1 FROM public.match_teams WHERE match_id = p_match AND team_id = v_tid) THEN
      RETURN 'invalid';
    END IF;
    -- unique placement per match
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
      -- only players OF this team may receive kills (FK + explicit check)
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

-- ── RESULT LIFECYCLE: submit → verify → lock → (super) reopen ────────────────

CREATE OR REPLACE FUNCTION public.set_match_result_state(
  p_match UUID, p_action TEXT, p_reason TEXT DEFAULT NULL
)
RETURNS TEXT  -- 'ok' | 'forbidden' | 'invalid' | 'reason_required' | 'not_ready'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour UUID;
  v_state TEXT;
  v_new TEXT;
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;

  SELECT st.tournament_id, m.result_state INTO v_tour, v_state
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;

  CASE p_action
    WHEN 'verify' THEN
      IF v_state <> 'SUBMITTED' THEN RETURN 'not_ready'; END IF;
      v_new := 'VERIFIED';
    WHEN 'lock' THEN
      IF v_state <> 'VERIFIED' THEN RETURN 'not_ready'; END IF;
      v_new := 'LOCKED';
    WHEN 'reopen' THEN
      IF v_state <> 'LOCKED' THEN RETURN 'not_ready'; END IF;
      -- reopening a LOCKED result is the sensitive action: log with reason
      IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
        RETURN 'reason_required';
      END IF;
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

-- ── QUALIFICATION: review → confirm → reverse → manual override ─────────────

-- Preview the top-N teams of a stage (N = stage.qualification_limit) from
-- LOCKED/VERIFIED results only. Read-only, callable by admins.
CREATE OR REPLACE FUNCTION public.preview_stage_qualifiers(p_stage UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_limit INT;
  v_tour UUID;
BEGIN
  SELECT qualification_limit, tournament_id INTO v_limit, v_tour
    FROM public.tournament_stages WHERE id = p_stage;
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object('eligible', FALSE);
  END IF;
  RETURN jsonb_build_object(
    'eligible', TRUE,
    'limit', v_limit,
    'standings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'team_id', r.team_id, 'team_name', t.team_name,
        'total_points', SUM(r.total_points),
        'total_kills', SUM(r.total_kills),
        'best_placement', MIN(r.placement),
        'qualifies', ROW_NUMBER() OVER (
            ORDER BY SUM(r.total_points) DESC, SUM(r.total_kills) DESC,
                     MIN(r.placement) ASC, t.team_name ASC) <= v_limit
      ) ORDER BY SUM(r.total_points) DESC), '[]'::jsonb)
      FROM public.match_team_results r
      JOIN public.tournament_teams t ON t.id = r.team_id
      JOIN public.tournament_matches m ON m.id = r.match_id
      JOIN public.match_teams mt ON mt.match_id = m.id AND mt.team_id = r.team_id
       AND mt.participation_status = 'CONFIRMED'
      WHERE m.stage_id = p_stage AND m.result_state IN ('VERIFIED','LOCKED')
      GROUP BY r.team_id, t.team_name
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.preview_stage_qualifiers(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.preview_stage_qualifiers(UUID) TO authenticated;

-- Confirm (or create pending rows for) qualifications from verified results.
CREATE OR REPLACE FUNCTION public.confirm_stage_qualifications(p_stage UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour UUID;
  v_limit INT;
  v_team RECORD;
  v_rank INT;
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;
  SELECT tournament_id, qualification_limit INTO v_tour, v_limit
    FROM public.tournament_stages WHERE id = p_stage;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;
  IF v_limit IS NULL THEN RETURN 'invalid'; END IF;

  -- Prerequisite: no match in this stage may remain un-verified.
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

-- Reverse a qualification (never deleted — status flips, audit preserved).
CREATE OR REPLACE FUNCTION public.reverse_qualification(
  p_qualification UUID, p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_row public.stage_qualifications%ROWTYPE;
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN RETURN 'reason_required'; END IF;

  SELECT * INTO v_row FROM public.stage_qualifications WHERE id = p_qualification;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
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

-- Manual override (qualify / eliminate) — requires a reason, marked manual.
CREATE OR REPLACE FUNCTION public.manual_qualification_override(
  p_stage UUID, p_team UUID, p_qualify BOOLEAN, p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tour UUID;
  v_status TEXT;
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN RETURN 'reason_required'; END IF;
  SELECT tournament_id INTO v_tour FROM public.tournament_stages WHERE id = p_stage;
  IF v_tour IS NULL THEN RETURN 'invalid'; END IF;

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

-- ── ANNOUNCEMENTS ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_tournament_announcement(
  p_tournament UUID, p_title TEXT, p_body TEXT, p_pinned BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
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

-- ── CHAMPION — derived from the FINAL stage leaderboard, server-side ─────────

CREATE OR REPLACE FUNCTION public.finalize_tournament(p_tournament UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_champion UUID;
  v_final_stage UUID;
  v_old UUID;
BEGIN
  IF NOT public.tournament_is_admin_caller() THEN RETURN 'forbidden'; END IF;

  SELECT id INTO v_final_stage
    FROM public.tournament_stages
   WHERE tournament_id = p_tournament AND stage_type = 'FINAL';
  IF v_final_stage IS NULL THEN RETURN 'invalid'; END IF;

  -- every final match must be locked
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

-- ══════════════════════════════════════════════════════════════════════════
-- PUBLIC READ VIEWS — the single source of every leaderboard
-- ══════════════════════════════════════════════════════════════════════════

-- Overall / per-stage team leaderboard (filter by stage_id = NULL for ALL).
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
     GROUP BY r.team_id
  )
  SELECT ROW_NUMBER() OVER (
           ORDER BY a.total_points DESC, a.kills_tiebreak DESC, a.best_placement ASC, t.team_name ASC
         )::BIGINT,
         t.id, t.team_name, t.team_tag, t.status,
         a.matches_played, a.total_kills, a.kill_points, a.placement_points, a.total_points
    FROM agg a
    JOIN public.tournament_teams t ON t.id = a.team_id
   ORDER BY 1;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_team_leaderboard(UUID,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournament_team_leaderboard(UUID,UUID) TO anon, authenticated;

-- Player kill leaderboard — pure raw kills, filterable by stage.
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
   GROUP BY p.id, p.display_name_snapshot, t.team_name
   ORDER BY 1
   LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1);
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_player_leaderboard(UUID,UUID,INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournament_player_leaderboard(UUID,UUID,INT) TO anon, authenticated;

-- One match's full public result (teams + placements + player kills).
CREATE OR REPLACE FUNCTION public.get_match_result(p_match UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_stage UUID;
  v_tour UUID;
BEGIN
  SELECT st.tournament_id, st.id INTO v_tour, v_stage
    FROM public.tournament_matches m
    JOIN public.tournament_stages st ON st.id = m.stage_id
   WHERE m.id = p_match;
  IF v_tour IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
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

-- Full tournament payload for the public homepage (one call).
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
            'team_count', (SELECT COUNT(*) FROM public.match_teams mt WHERE mt.match_id = m.id)
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

CREATE OR REPLACE FUNCTION public.get_tournaments_list()
RETURNS TABLE (id UUID, name TEXT, game TEXT, status TEXT, start_date DATE, end_date DATE, team_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT t.id, t.name, t.game, t.status, t.start_date, t.end_date,
         (SELECT COUNT(*) FROM public.tournament_teams tt WHERE tt.tournament_id = t.id)
    FROM public.tournaments t
   WHERE t.status NOT IN ('DRAFT','CANCELLED')
   ORDER BY CASE t.status WHEN 'LIVE' THEN 0 WHEN 'UPCOMING' THEN 1 ELSE 2 END,
            t.start_date DESC NULLS LAST;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_tournaments_list() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tournaments_list() TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- REALTIME — public leaderboard reacts to verified results (secondary to
-- correctness; the RPCs remain the source of truth).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'match_team_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_team_results;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tournaments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
  END IF;
END $$;
