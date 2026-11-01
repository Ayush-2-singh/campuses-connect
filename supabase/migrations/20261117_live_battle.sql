-- ============================================================
-- ConnectToCampus — LIVE BATTLE (YouTube live quiz engine)
--
-- Phase 1 of the Live Quiz Competition Engine: the persistent
-- layer only. No UI depends on it yet.
--
-- DESIGN RULES THIS MIGRATION ENFORCES
--   1. The question BANK is permanent; a competition gets an
--      immutable SNAPSHOT copied at creation. Editing or deleting
--      a bank question can never change an existing competition.
--   2. Scores are computed ONLY inside SECURITY DEFINER functions
--      from a server timestamp. There is no INSERT policy on
--      `competition_answers` — a browser cannot write a score.
--   3. The answer key (`is_correct`) is never readable by a
--      participant: no SELECT policy for it, and the RPC that
--      hands out options omits the flag until the window closes.
--   4. One answer per participant per question (UNIQUE), so a
--      replay or a double-tap cannot score twice.
--   5. Text lives in Postgres; images live in object storage and
--      only their URL is stored here.
--   6. Room codes are 6 digits, unique and indexed — the join path
--      is one index lookup, not a scan.
--
-- Idempotent: every object uses IF NOT EXISTS / DROP … IF EXISTS.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Who may host
--    Not every student is a host, and we do not want to widen
--    `profiles` for it. A tiny allow-list, granted by an admin,
--    plus the existing platform-admin check.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_quiz_hosts (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_quiz_hosts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_live_quiz_host(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.live_quiz_hosts h WHERE h.user_id = p_user_id)
       OR public.is_platform_admin()
     );
$$;

REVOKE EXECUTE ON FUNCTION public.is_live_quiz_host(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_live_quiz_host(UUID) TO authenticated;

DROP POLICY IF EXISTS live_quiz_hosts_admin_all ON public.live_quiz_hosts;
CREATE POLICY live_quiz_hosts_admin_all ON public.live_quiz_hosts
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS live_quiz_hosts_self_read ON public.live_quiz_hosts;
CREATE POLICY live_quiz_hosts_self_read ON public.live_quiz_hosts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 1. QUESTION BANK (permanent, reusable, never mutated by a run)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_bank (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject            TEXT NOT NULL DEFAULT 'General',
  topic              TEXT,
  difficulty         TEXT NOT NULL DEFAULT 'medium'
                     CHECK (difficulty IN ('easy', 'medium', 'hard')),
  -- 'single' = one correct, 'multiple' = several, 'true_false' = two fixed
  question_type      TEXT NOT NULL DEFAULT 'single'
                     CHECK (question_type IN ('single', 'multiple', 'true_false')),
  question_text      TEXT NOT NULL CHECK (char_length(btrim(question_text)) BETWEEN 3 AND 2000),
  explanation        TEXT,
  image_url          TEXT,
  tags               TEXT[] NOT NULL DEFAULT '{}',
  marks              INT NOT NULL DEFAULT 100 CHECK (marks BETWEEN 1 AND 1000),
  time_limit_seconds INT NOT NULL DEFAULT 20 CHECK (time_limit_seconds BETWEEN 5 AND 300),
  is_archived        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_bank_creator ON public.question_bank (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_bank_filter ON public.question_bank (subject, difficulty, is_archived);
CREATE INDEX IF NOT EXISTS idx_question_bank_tags ON public.question_bank USING GIN (tags);

CREATE TABLE IF NOT EXISTS public.question_bank_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  position    INT NOT NULL CHECK (position BETWEEN 0 AND 3),
  option_text TEXT NOT NULL CHECK (char_length(btrim(option_text)) BETWEEN 1 AND 500),
  is_correct  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (question_id, position)
);

CREATE INDEX IF NOT EXISTS idx_question_bank_options_question ON public.question_bank_options (question_id, position);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_options ENABLE ROW LEVEL SECURITY;

-- The bank is a private authoring surface: the creator and admins only.
DROP POLICY IF EXISTS question_bank_owner ON public.question_bank;
CREATE POLICY question_bank_owner ON public.question_bank
  FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.is_platform_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS question_bank_options_owner ON public.question_bank_options;
CREATE POLICY question_bank_options_owner ON public.question_bank_options
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.question_bank q
      WHERE q.id = question_bank_options.question_id
        AND (q.created_by = auth.uid() OR public.is_platform_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.question_bank q
      WHERE q.id = question_bank_options.question_id
        AND (q.created_by = auth.uid() OR public.is_platform_admin())
    )
  );

-- ------------------------------------------------------------
-- 2. IMPORT JOBS
--    The uploaded file is NOT kept: it lands in storage only long
--    enough to be parsed, and only the parse report survives.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_import_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name     TEXT,
  file_type     TEXT CHECK (file_type IN ('csv', 'xlsx', 'json', 'pdf', 'docx')),
  storage_path  TEXT,
  status        TEXT NOT NULL DEFAULT 'uploaded'
                CHECK (status IN ('uploaded', 'parsed', 'validated', 'published', 'failed')),
  row_count     INT NOT NULL DEFAULT 0,
  accepted_count INT NOT NULL DEFAULT 0,
  report        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_import_jobs_owner ON public.quiz_import_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_import_jobs_status ON public.quiz_import_jobs (status, created_at);

ALTER TABLE public.quiz_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_import_jobs_owner ON public.quiz_import_jobs;
CREATE POLICY quiz_import_jobs_owner ON public.quiz_import_jobs
  FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.is_platform_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_platform_admin());

-- ------------------------------------------------------------
-- 3. COMPETITIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.competitions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                       TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 140),
  category                    TEXT NOT NULL DEFAULT 'General',
  youtube_url                 TEXT,
  room_code                   TEXT NOT NULL UNIQUE CHECK (room_code ~ '^[0-9]{6}$'),
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'waiting', 'live', 'paused', 'completed', 'cancelled')),
  visibility                  TEXT NOT NULL DEFAULT 'code_only'
                              CHECK (visibility IN ('public', 'code_only')),
  question_count              INT NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  default_timer_seconds       INT NOT NULL DEFAULT 20 CHECK (default_timer_seconds BETWEEN 5 AND 300),
  points_correct              INT NOT NULL DEFAULT 100 CHECK (points_correct BETWEEN 1 AND 1000),
  max_speed_bonus             INT NOT NULL DEFAULT 20 CHECK (max_speed_bonus BETWEEN 0 AND 200),
  max_participants            INT NOT NULL DEFAULT 500 CHECK (max_participants BETWEEN 1 AND 5000),
  allow_late_join             BOOLEAN NOT NULL DEFAULT TRUE,
  show_leaderboard_to_players BOOLEAN NOT NULL DEFAULT TRUE,
  reveal_answers_after       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Cursor into competition_questions. The server owns this; every
  -- participant reads the same value, which is what "synchronised" means here.
  current_position            INT NOT NULL DEFAULT -1,
  current_started_at          TIMESTAMPTZ,
  scheduled_at                TIMESTAMPTZ,
  started_at                  TIMESTAMPTZ,
  ended_at                    TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT competitions_youtube_url_chk CHECK (youtube_url IS NULL OR youtube_url ~ '^https?://')
);

-- Join path: room_code (UNIQUE above) is the only lookup a student does.
CREATE INDEX IF NOT EXISTS idx_competitions_host ON public.competitions (host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.competitions (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_competitions_public ON public.competitions (visibility, status, created_at DESC);

-- ------------------------------------------------------------
-- 4. COMPETITION QUESTIONS — the IMMUTABLE SNAPSHOT
--    Values are copied, not referenced. `source_question_id` is
--    informational only and disappears with the bank row.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.competition_questions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id     UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  source_question_id UUID REFERENCES public.question_bank(id) ON DELETE SET NULL,
  position           INT NOT NULL CHECK (position >= 0),
  question_type      TEXT NOT NULL CHECK (question_type IN ('single', 'multiple', 'true_false')),
  question_text      TEXT NOT NULL,
  explanation        TEXT,
  image_url          TEXT,
  marks              INT NOT NULL DEFAULT 100,
  time_limit_seconds INT NOT NULL DEFAULT 20,
  UNIQUE (competition_id, position)
);

CREATE INDEX IF NOT EXISTS idx_competition_questions_comp ON public.competition_questions (competition_id, position);

CREATE TABLE IF NOT EXISTS public.competition_question_options (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_question_id UUID NOT NULL REFERENCES public.competition_questions(id) ON DELETE CASCADE,
  position               INT NOT NULL CHECK (position BETWEEN 0 AND 3),
  option_text            TEXT NOT NULL,
  is_correct             BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (competition_question_id, position)
);

CREATE INDEX IF NOT EXISTS idx_competition_options_question ON public.competition_question_options (competition_question_id, position);

-- ------------------------------------------------------------
-- 5. PARTICIPANTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.competition_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id    UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  score             INT NOT NULL DEFAULT 0,
  correct_count     INT NOT NULL DEFAULT 0,
  answered_count    INT NOT NULL DEFAULT 0,
  total_response_ms BIGINT NOT NULL DEFAULT 0,
  is_kicked         BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One participant row per user per competition: no duplicate entry,
  -- no second account farming the same room with the same account.
  UNIQUE (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_participants_comp ON public.competition_participants (competition_id, score DESC, total_response_ms ASC);
CREATE INDEX IF NOT EXISTS idx_competition_participants_user ON public.competition_participants (user_id, joined_at DESC);

-- ------------------------------------------------------------
-- 6. ANSWERS — server-scored, one per question per participant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.competition_answers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id         UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  competition_question_id UUID NOT NULL REFERENCES public.competition_questions(id) ON DELETE CASCADE,
  participant_id         UUID NOT NULL REFERENCES public.competition_participants(id) ON DELETE CASCADE,
  selected_positions     INT[] NOT NULL DEFAULT '{}',
  is_correct             BOOLEAN NOT NULL DEFAULT FALSE,
  points                 INT NOT NULL DEFAULT 0,
  response_ms            INT NOT NULL DEFAULT 0,
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- THE duplicate guard: a second submission for the same question from the
  -- same participant cannot exist, so a replayed request scores nothing.
  UNIQUE (competition_question_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_answers_comp ON public.competition_answers (competition_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_competition_answers_question ON public.competition_answers (competition_question_id);

-- ------------------------------------------------------------
-- 7. EVENT LOG — the realtime broadcast surface
--    One narrow append-only table. Clients subscribe to INSERTs on
--    it instead of receiving a full leaderboard per answer.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.competition_events (
  id             BIGSERIAL PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL CHECK (event_type IN (
                   'competition_created', 'participant_joined', 'competition_started',
                   'question_started', 'question_ended', 'leaderboard_updated',
                   'competition_paused', 'competition_resumed',
                   'competition_completed', 'competition_cancelled')),
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competition_events_comp ON public.competition_events (competition_id, id DESC);

-- ------------------------------------------------------------
-- 8. FINAL RESULTS + PERIODIC LEADERBOARD SNAPSHOTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.competition_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id    UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank              INT NOT NULL,
  score             INT NOT NULL,
  correct_count     INT NOT NULL,
  answered_count    INT NOT NULL,
  accuracy          NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_response_ms BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_results_comp ON public.competition_results (competition_id, rank);
CREATE INDEX IF NOT EXISTS idx_competition_results_user ON public.competition_results (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  top            JSONB NOT NULL DEFAULT '[]'::jsonb,
  participant_count INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_comp ON public.leaderboard_snapshots (competition_id, created_at DESC);

-- ------------------------------------------------------------
-- 9. RLS
-- ------------------------------------------------------------
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- Competitions: the host owns their rows; a public competition is readable.
DROP POLICY IF EXISTS competitions_host_all ON public.competitions;
CREATE POLICY competitions_host_all ON public.competitions
  FOR ALL TO authenticated
  USING (host_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (host_id = auth.uid() AND public.is_live_quiz_host() OR public.is_platform_admin());

DROP POLICY IF EXISTS competitions_public_read ON public.competitions;
CREATE POLICY competitions_public_read ON public.competitions
  FOR SELECT TO authenticated, anon
  USING (visibility = 'public' AND status <> 'draft');

-- Questions are readable by the host and by anyone who joined that room.
-- (The option rows are NOT: see the next block.)
DROP POLICY IF EXISTS competition_questions_member_read ON public.competition_questions;
CREATE POLICY competition_questions_member_read ON public.competition_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_questions.competition_id
        AND (c.host_id = auth.uid() OR public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.competition_participants p
               WHERE p.competition_id = c.id AND p.user_id = auth.uid()
             ))
    )
  );

-- ANSWER KEY: host/admins only. A participant can never SELECT is_correct;
-- they receive options through live_quiz_question(), which omits the flag.
DROP POLICY IF EXISTS competition_options_host_read ON public.competition_question_options;
CREATE POLICY competition_options_host_read ON public.competition_question_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competition_questions q
      JOIN public.competitions c ON c.id = q.competition_id
      WHERE q.id = competition_question_options.competition_question_id
        AND (c.host_id = auth.uid() OR public.is_platform_admin())
    )
  );

-- Participants: the host sees everyone; a participant sees their own row.
DROP POLICY IF EXISTS competition_participants_read ON public.competition_participants;
CREATE POLICY competition_participants_read ON public.competition_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_participants.competition_id
        AND (c.host_id = auth.uid() OR public.is_platform_admin())
    )
  );

-- Answers: own answers, or the host reviewing the room.
DROP POLICY IF EXISTS competition_answers_read ON public.competition_answers;
CREATE POLICY competition_answers_read ON public.competition_answers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competition_participants p
      WHERE p.id = competition_answers.participant_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_answers.competition_id
        AND (c.host_id = auth.uid() OR public.is_platform_admin())
    )
  );

-- No INSERT/UPDATE/DELETE policy on competition_answers on purpose: the only
-- writer is live_quiz_answer() (SECURITY DEFINER), so the scoring formula and
-- the deadline cannot be bypassed by a crafted request.

-- Events: room members (the realtime subscription reads these).
DROP POLICY IF EXISTS competition_events_member_read ON public.competition_events;
CREATE POLICY competition_events_member_read ON public.competition_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_events.competition_id
        AND (c.host_id = auth.uid() OR public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.competition_participants p
               WHERE p.competition_id = c.id AND p.user_id = auth.uid()
             ))
    )
  );

-- Results: a finished competition is public history; a participant always
-- sees their own row.
DROP POLICY IF EXISTS competition_results_read ON public.competition_results;
CREATE POLICY competition_results_read ON public.competition_results
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_results.competition_id
        AND (c.host_id = auth.uid() OR (c.status = 'completed' AND c.visibility = 'public'))
    )
  );

DROP POLICY IF EXISTS leaderboard_snapshots_read ON public.leaderboard_snapshots;
CREATE POLICY leaderboard_snapshots_read ON public.leaderboard_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = leaderboard_snapshots.competition_id
        AND (c.host_id = auth.uid() OR public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.competition_participants p
               WHERE p.competition_id = c.id AND p.user_id = auth.uid()
             ))
    )
  );

-- ------------------------------------------------------------
-- 10. ROOM CODES
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_new_room_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_try  INT := 0;
BEGIN
  LOOP
    v_code := lpad((floor(random() * 900000) + 100000)::INT::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.competitions c WHERE c.room_code = v_code);
    v_try := v_try + 1;
    IF v_try >= 40 THEN
      RAISE EXCEPTION 'could not allocate a free room code';
    END IF;
  END LOOP;
  RETURN v_code;
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_new_room_code() FROM PUBLIC;

-- ------------------------------------------------------------
-- 11. SPEED BONUS — one definition, used by the scorer only
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_speed_bonus(p_response_ms INT, p_window_ms INT, p_max_bonus INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    0,
    LEAST(
      p_max_bonus,
      ROUND(p_max_bonus * (1 - (p_response_ms::NUMERIC / GREATEST(p_window_ms, 1))))::INT
    )
  );
$$;

-- ------------------------------------------------------------
-- 12. CREATE — copies the selected bank questions into a snapshot
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_create(
  p_title            TEXT,
  p_question_ids     UUID[],
  p_category         TEXT DEFAULT 'General',
  p_youtube_url      TEXT DEFAULT NULL,
  p_timer_seconds    INT DEFAULT 20,
  p_points_correct   INT DEFAULT 100,
  p_max_speed_bonus  INT DEFAULT 20,
  p_max_participants INT DEFAULT 500,
  p_allow_late_join  BOOLEAN DEFAULT TRUE,
  p_visibility       TEXT DEFAULT 'code_only',
  p_scheduled_at     TIMESTAMPTZ DEFAULT NULL,
  p_reveal_answers   BOOLEAN DEFAULT TRUE
)
RETURNS public.competitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_q      RECORD;
  v_snap   UUID;
  v_pos    INT := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_live_quiz_host(v_me) THEN
    RAISE EXCEPTION 'not allowed to host competitions' USING ERRCODE = '42501';
  END IF;
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'select at least one question' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.competitions (
    host_id, title, category, youtube_url, room_code, status, visibility,
    default_timer_seconds, points_correct, max_speed_bonus, max_participants,
    allow_late_join, reveal_answers_after, scheduled_at
  ) VALUES (
    v_me, btrim(p_title), coalesce(p_category, 'General'), p_youtube_url,
    public.live_quiz_new_room_code(),
    'waiting',
    CASE WHEN p_visibility IN ('public', 'code_only') THEN p_visibility ELSE 'code_only' END,
    LEAST(GREATEST(p_timer_seconds, 5), 300),
    LEAST(GREATEST(p_points_correct, 1), 1000),
    LEAST(GREATEST(p_max_speed_bonus, 0), 200),
    LEAST(GREATEST(p_max_participants, 1), 5000),
    p_allow_late_join, p_reveal_answers, p_scheduled_at
  )
  RETURNING * INTO v_comp;

  -- Snapshot in the caller's order; a bank question must belong to the host.
  FOR v_q IN
    SELECT q.*
    FROM unnest(p_question_ids) WITH ORDINALITY AS t(id, ord)
    JOIN public.question_bank q ON q.id = t.id
    WHERE (q.created_by = v_me OR public.is_platform_admin())
    ORDER BY t.ord
  LOOP
    INSERT INTO public.competition_questions (
      competition_id, source_question_id, position, question_type,
      question_text, explanation, image_url, marks, time_limit_seconds
    ) VALUES (
      v_comp.id, v_q.id, v_pos, v_q.question_type,
      v_q.question_text, v_q.explanation, v_q.image_url, v_q.marks, v_q.time_limit_seconds
    ) RETURNING id INTO v_snap;

    INSERT INTO public.competition_question_options (
      competition_question_id, position, option_text, is_correct
    )
    SELECT v_snap, o.position, o.option_text, o.is_correct
    FROM public.question_bank_options o
    WHERE o.question_id = v_q.id
    ORDER BY o.position;

    v_pos := v_pos + 1;
  END LOOP;

  IF v_pos = 0 THEN
    RAISE EXCEPTION 'none of the selected questions belong to you' USING ERRCODE = '42501';
  END IF;

  UPDATE public.competitions
  SET question_count = v_pos, updated_at = now()
  WHERE id = v_comp.id
  RETURNING * INTO v_comp;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, 'competition_created',
          jsonb_build_object('title', v_comp.title, 'room_code', v_comp.room_code,
                             'question_count', v_comp.question_count));

  RETURN v_comp;
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_create(TEXT, UUID[], TEXT, TEXT, INT, INT, INT, INT, BOOLEAN, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_create(TEXT, UUID[], TEXT, TEXT, INT, INT, INT, INT, BOOLEAN, TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 13. JOIN by room code (idempotent — reloading the page is safe)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_join(p_room_code TEXT, p_display_name TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_count  INT;
  v_name   TEXT;
  v_part   public.competition_participants;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE room_code = btrim(p_room_code);
  IF v_comp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF v_comp.status IN ('draft', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_closed');
  END IF;
  IF v_comp.status = 'live' AND NOT v_comp.allow_late_join THEN
    RETURN jsonb_build_object('ok', false, 'error', 'late_join_disabled');
  END IF;
  IF v_comp.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_finished');
  END IF;

  SELECT * INTO v_part
  FROM public.competition_participants
  WHERE competition_id = v_comp.id AND user_id = v_me;

  IF v_part.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'competition_id', v_comp.id, 'room_code', v_comp.room_code,
      'status', v_comp.status, 'rejoined', true,
      'participant_id', v_part.id, 'score', v_part.score
    );
  END IF;

  SELECT count(*) INTO v_count
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE;

  IF v_count >= v_comp.max_participants THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_full');
  END IF;

  SELECT coalesce(nullif(btrim(p_display_name), ''), pr.full_name, pr.username)
  INTO v_name
  FROM public.profiles pr
  WHERE pr.id = v_me;

  v_name := left(coalesce(v_name, 'Student'), 40);

  INSERT INTO public.competition_participants (competition_id, user_id, display_name)
  VALUES (v_comp.id, v_me, v_name)
  RETURNING * INTO v_part;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, 'participant_joined',
          jsonb_build_object('display_name', v_name, 'participants', v_count + 1));

  RETURN jsonb_build_object(
    'ok', true, 'competition_id', v_comp.id, 'room_code', v_comp.room_code,
    'status', v_comp.status, 'rejoined', false,
    'participant_id', v_part.id, 'display_name', v_name, 'participants', v_count + 1
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_join(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 14. START / NEXT / PAUSE / RESUME / END / CANCEL (host only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_advance(p_competition_id UUID, p_action TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_comp    public.competitions;
  v_next    INT;
  v_event   TEXT;
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RAISE EXCEPTION 'competition not found' USING ERRCODE = '02000'; END IF;
  IF v_comp.host_id <> v_me AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only the host can control this competition' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'start' THEN
    IF v_comp.status NOT IN ('waiting', 'draft') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_started');
    END IF;
    IF v_comp.question_count = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_questions');
    END IF;
    v_next := 0;
    v_event := 'competition_started';
    UPDATE public.competitions
    SET status = 'live', started_at = now(), current_position = 0,
        current_started_at = now(), updated_at = now()
    WHERE id = v_comp.id;
  ELSIF p_action = 'next' THEN
    IF v_comp.status <> 'live' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_live');
    END IF;
    v_next := v_comp.current_position + 1;
    IF v_next >= v_comp.question_count THEN
      RETURN public.live_quiz_finalize(v_comp.id);
    END IF;
    v_event := 'question_started';
    UPDATE public.competitions
    SET current_position = v_next, current_started_at = now(), updated_at = now()
    WHERE id = v_comp.id;
  ELSIF p_action = 'pause' THEN
    IF v_comp.status <> 'live' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_live'); END IF;
    v_event := 'competition_paused';
    UPDATE public.competitions SET status = 'paused', updated_at = now() WHERE id = v_comp.id;
    v_next := v_comp.current_position;
  ELSIF p_action = 'resume' THEN
    IF v_comp.status <> 'paused' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_paused'); END IF;
    v_event := 'competition_resumed';
    -- The clock restarts for the current question: the pause must not eat the
    -- answer window, and the deadline stays server-side.
    UPDATE public.competitions
    SET status = 'live', current_started_at = now(), updated_at = now()
    WHERE id = v_comp.id;
    v_next := v_comp.current_position;
  ELSIF p_action = 'end' THEN
    RETURN public.live_quiz_finalize(v_comp.id);
  ELSIF p_action = 'cancel' THEN
    v_event := 'competition_cancelled';
    UPDATE public.competitions
    SET status = 'cancelled', ended_at = now(), updated_at = now()
    WHERE id = v_comp.id;
    v_next := v_comp.current_position;
  ELSE
    RAISE EXCEPTION 'unknown action %', p_action USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, v_event,
          jsonb_build_object('position', v_next, 'question_count', v_comp.question_count));

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'position', v_next, 'status',
    (SELECT status FROM public.competitions WHERE id = v_comp.id));
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_advance(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_advance(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 15. THE CURRENT QUESTION — options WITHOUT the answer key
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_question(p_competition_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_q      public.competition_questions;
  v_member BOOLEAN;
  v_open   BOOLEAN;
  v_opts   JSONB;
  v_mine   public.competition_answers;
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.user_id = v_me AND p.is_kicked = FALSE
  ) INTO v_member;

  IF NOT (v_member OR v_comp.host_id = v_me OR public.is_platform_admin()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  SELECT * INTO v_q
  FROM public.competition_questions q
  WHERE q.competition_id = v_comp.id AND q.position = v_comp.current_position;

  IF v_q.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', v_comp.status, 'question', NULL);
  END IF;

  v_open := v_comp.status = 'live'
            AND v_comp.current_started_at IS NOT NULL
            AND now() < v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL;

  -- Options never carry is_correct while the window is open.
  SELECT coalesce(jsonb_agg(jsonb_build_object('position', o.position, 'text', o.option_text)
                            ORDER BY o.position), '[]'::jsonb)
  INTO v_opts
  FROM public.competition_question_options o
  WHERE o.competition_question_id = v_q.id;

  -- `a.*` only: a joined row would not match the composite variable's shape.
  SELECT a.* INTO v_mine
  FROM public.competition_answers a
  JOIN public.competition_participants p ON p.id = a.participant_id
  WHERE a.competition_question_id = v_q.id AND p.user_id = v_me;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_comp.status,
    'position', v_q.position,
    'total', v_comp.question_count,
    'question', jsonb_build_object(
      'text', v_q.question_text,
      'type', v_q.question_type,
      'image_url', v_q.image_url,
      'marks', v_q.marks,
      'time_limit_seconds', v_q.time_limit_seconds
    ),
    'options', v_opts,
    'deadline', CASE WHEN v_open
                     THEN to_jsonb(v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL)
                     ELSE NULL END,
    'answered', v_mine.id IS NOT NULL
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_question(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_question(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 16. ANSWER — the only scoring path
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_answer(p_competition_id UUID, p_positions INT[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_comp      public.competitions;
  v_q         public.competition_questions;
  v_part      public.competition_participants;
  v_deadline  TIMESTAMPTZ;
  v_response  INT;
  v_correct   INT[];
  v_selected  INT[];
  v_is_right  BOOLEAN;
  v_bonus     INT;
  v_points    INT;
  v_answered  INT;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_comp.status <> 'live' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_live'); END IF;

  SELECT * INTO v_part
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.user_id = v_me AND p.is_kicked = FALSE;
  IF v_part.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_in_room'); END IF;

  SELECT * INTO v_q
  FROM public.competition_questions q
  WHERE q.competition_id = v_comp.id AND q.position = v_comp.current_position;
  IF v_q.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_question'); END IF;

  v_deadline := v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL;
  IF v_comp.current_started_at IS NULL OR now() >= v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed');
  END IF;

  -- Duplicate submission: report it, never rescore.
  IF EXISTS (
    SELECT 1 FROM public.competition_answers a
    WHERE a.competition_question_id = v_q.id AND a.participant_id = v_part.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_answered');
  END IF;

  SELECT coalesce(array_agg(o.position ORDER BY o.position), '{}')
  INTO v_correct
  FROM public.competition_question_options o
  WHERE o.competition_question_id = v_q.id AND o.is_correct;

  SELECT coalesce(array_agg(DISTINCT pos ORDER BY pos), '{}')
  INTO v_selected
  FROM unnest(coalesce(p_positions, '{}')) AS pos
  WHERE pos BETWEEN 0 AND 3;

  -- Exact set match: a multiple-answer question needs all of them, no extras.
  v_is_right := (v_selected = v_correct);

  -- Server clock only: the browser never sends its own timing.
  v_response := GREATEST(0, LEAST(v_q.time_limit_seconds * 1000,
                   ROUND(EXTRACT(EPOCH FROM (now() - v_comp.current_started_at)) * 1000)::INT));
  v_bonus := public.live_quiz_speed_bonus(v_response, v_q.time_limit_seconds * 1000, v_comp.max_speed_bonus);
  v_points := CASE WHEN v_is_right THEN v_q.marks + v_bonus ELSE 0 END;

  INSERT INTO public.competition_answers (
    competition_id, competition_question_id, participant_id,
    selected_positions, is_correct, points, response_ms
  ) VALUES (
    v_comp.id, v_q.id, v_part.id, v_selected, v_is_right, v_points, v_response
  );

  UPDATE public.competition_participants
  SET score = score + v_points,
      correct_count = correct_count + CASE WHEN v_is_right THEN 1 ELSE 0 END,
      answered_count = answered_count + 1,
      total_response_ms = total_response_ms + v_response
  WHERE id = v_part.id;

  SELECT count(*) INTO v_answered
  FROM public.competition_answers a
  WHERE a.competition_question_id = v_q.id;

  -- Correctness is deliberately NOT returned while the window is open.
  RETURN jsonb_build_object('ok', true, 'accepted', true, 'answered_count', v_answered);
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_answer(UUID, INT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_answer(UUID, INT[]) TO authenticated;

-- ------------------------------------------------------------
-- 17. FINALISE — ranks, results, snapshot
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_finalize(p_competition_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_comp public.competitions;
  v_rows INT;
  v_top  JSONB;
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_comp.host_id <> v_me AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only the host can end this competition' USING ERRCODE = '42501';
  END IF;

  IF v_comp.status <> 'completed' THEN
    UPDATE public.competitions
    SET status = 'completed', ended_at = now(), updated_at = now(),
        current_position = GREATEST(current_position, question_count - 1)
    WHERE id = v_comp.id;
  END IF;

  -- Idempotent: replays overwrite the same (competition_id, user_id) rows.
  INSERT INTO public.competition_results (
    competition_id, user_id, rank, score, correct_count, answered_count,
    accuracy, total_response_ms
  )
  SELECT v_comp.id, p.user_id,
         RANK() OVER (ORDER BY p.score DESC, p.correct_count DESC, p.total_response_ms ASC),
         p.score, p.correct_count, p.answered_count,
         CASE WHEN p.answered_count = 0 THEN 0
              ELSE ROUND((p.correct_count::NUMERIC * 100) / p.answered_count, 2) END,
         p.total_response_ms
  FROM public.competition_participants p
  WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE
  ON CONFLICT (competition_id, user_id) DO UPDATE
    SET rank = EXCLUDED.rank, score = EXCLUDED.score,
        correct_count = EXCLUDED.correct_count, answered_count = EXCLUDED.answered_count,
        accuracy = EXCLUDED.accuracy, total_response_ms = EXCLUDED.total_response_ms;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top
  FROM (
    SELECT r.rank, r.score, r.correct_count, r.answered_count, r.accuracy,
           p.display_name
    FROM public.competition_results r
    JOIN public.competition_participants p
      ON p.competition_id = r.competition_id AND p.user_id = r.user_id
    WHERE r.competition_id = v_comp.id
    ORDER BY r.rank
    LIMIT 10
  ) t;

  INSERT INTO public.leaderboard_snapshots (competition_id, top, participant_count)
  VALUES (v_comp.id, v_top, v_rows);

  INSERT INTO public.competition_events (competition_id, event_type, payload)
  VALUES (v_comp.id, 'competition_completed',
          jsonb_build_object('participants', v_rows, 'top', v_top));

  RETURN jsonb_build_object('ok', true, 'status', 'completed', 'participants', v_rows, 'top', v_top);
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_finalize(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_finalize(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 18. LEADERBOARD — top N + my rank in ONE round trip
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_leaderboard(p_competition_id UUID, p_limit INT DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_member BOOLEAN;
  v_limit  INT := LEAST(GREATEST(coalesce(p_limit, 10), 1), 50);
  v_top    JSONB;
  v_me_row JSONB;
  v_status TEXT;
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.user_id = v_me
  ) INTO v_member;

  IF NOT (v_member OR v_comp.host_id = v_me OR public.is_platform_admin()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  v_status := v_comp.status;

  -- One pass over the room: `ranked` is materialised once and read twice, so
  -- the top rows and "my rank" come from the same numbers in one round trip.
  WITH ranked AS (
    SELECT p.user_id, p.display_name, p.score, p.correct_count, p.answered_count,
           p.total_response_ms,
           RANK() OVER (ORDER BY p.score DESC, p.correct_count DESC, p.total_response_ms ASC) AS rank,
           CASE WHEN p.answered_count = 0 THEN 0
                ELSE ROUND((p.correct_count::NUMERIC * 100) / p.answered_count, 2) END AS accuracy
    FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.is_kicked = FALSE
  ),
  top_rows AS (
    SELECT * FROM ranked ORDER BY rank LIMIT v_limit
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'rank', t.rank, 'display_name', t.display_name, 'score', t.score,
               'correct_count', t.correct_count, 'answered_count', t.answered_count,
               'accuracy', t.accuracy, 'total_response_ms', t.total_response_ms
             ) ORDER BY t.rank)
      FROM top_rows t
    ), '[]'::jsonb),
    (
      SELECT jsonb_build_object(
               'rank', r.rank, 'score', r.score, 'correct_count', r.correct_count,
               'answered_count', r.answered_count, 'accuracy', r.accuracy,
               'display_name', r.display_name)
      FROM ranked r
      WHERE r.user_id = v_me
    )
  INTO v_top, v_me_row;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'top', v_top, 'me', v_me_row);
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_leaderboard(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_leaderboard(UUID, INT) TO authenticated;

-- ------------------------------------------------------------
-- 19. REVEAL — the answer key, only once the window has closed
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_reveal(p_competition_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_comp   public.competitions;
  v_q      public.competition_questions;
  v_member BOOLEAN;
  v_key    INT[];
BEGIN
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition_id;
  IF v_comp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT v_comp.reveal_answers_after THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reveal_disabled');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants p
    WHERE p.competition_id = v_comp.id AND p.user_id = v_me
  ) INTO v_member;

  IF NOT (v_member OR v_comp.host_id = v_me OR public.is_platform_admin()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  SELECT * INTO v_q
  FROM public.competition_questions q
  WHERE q.competition_id = v_comp.id AND q.position = v_comp.current_position;
  IF v_q.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_question'); END IF;

  -- Still open → refuse. This is the "no premature disclosure" rule.
  IF v_comp.status = 'live'
     AND v_comp.current_started_at + (v_q.time_limit_seconds || ' seconds')::INTERVAL > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_still_open');
  END IF;

  SELECT coalesce(array_agg(o.position ORDER BY o.position), '{}')
  INTO v_key
  FROM public.competition_question_options o
  WHERE o.competition_question_id = v_q.id AND o.is_correct;

  RETURN jsonb_build_object(
    'ok', true,
    'question_id', v_q.id,
    'position', v_q.position,
    'correct_positions', v_key,
    'explanation', v_q.explanation
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_reveal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_reveal(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 20. MY HISTORY (paginated — never the whole table)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_quiz_my_history(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_limit INT := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
BEGIN
  IF v_me IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT r.competition_id, c.title, c.category, c.ended_at,
             r.rank, r.score, r.correct_count, r.answered_count, r.accuracy,
             r.created_at,
             (SELECT count(*) FROM public.competition_results x
              WHERE x.competition_id = r.competition_id) AS participant_count
      FROM public.competition_results r
      JOIN public.competitions c ON c.id = r.competition_id
      WHERE r.user_id = v_me
      ORDER BY r.created_at DESC
      LIMIT v_limit OFFSET GREATEST(coalesce(p_offset, 0), 0)
    ) t
  ), '[]'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.live_quiz_my_history(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_quiz_my_history(INT, INT) TO authenticated;

-- ------------------------------------------------------------
-- 21. Realtime: broadcast the event log, not the leaderboard
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_events;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
