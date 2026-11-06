-- ============================================================
-- ConnectToCampus — REUSABLE QUIZ LIBRARY (P2)
--
-- Adds the one object the platform was missing: a quiz that exists
-- independently of a single live competition.
--
-- OWNERSHIP / ACCESS DECISION
--   A quiz references `question_bank` rows; it never copies answer data
--   at library level. The competition snapshot (20261117) stays the only
--   place content is frozen, so editing a bank question keeps working for
--   future quizzes while a running competition stays immutable.
--
--   Cross-user access is solved WITHOUT widening `question_bank`:
--     • question ownership is enforced when questions are added
--       (the caller must own them), so every quiz_questions row points
--       at a bank row its quiz owner can already read;
--     • `quiz_fork` copies the source bank rows into the forker's bank,
--       so a fork never depends on someone else's rows and deleting the
--       original cannot break it;
--     • everything a viewer needs to see (question text, option text,
--       never `is_correct`) is returned by SECURITY DEFINER RPCs, so
--       `question_bank_options` keeps its owner-only policy untouched.
--
--   Implications:
--     editing   — owner edits bank rows; every unpublished quiz sees it
--     deleting  — quiz_questions cascades on bank delete (question drops
--                 out of the quiz and question_count self-heals)
--     forks     — independent copy; edits never propagate either way
--
-- Idempotent. Applied by scripts/apply-one-migration.mjs.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quizzes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id      UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  title          TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 140),
  description    TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  cover_url      TEXT,
  subject        TEXT NOT NULL DEFAULT 'General' CHECK (char_length(btrim(subject)) BETWEEN 1 AND 60),
  visibility     TEXT NOT NULL DEFAULT 'private'
                 CHECK (visibility IN ('private', 'campus', 'public')),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'published', 'archived')),
  source         TEXT NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual', 'import', 'ai', 'competition')),
  fork_of        UUID REFERENCES public.quizzes(id) ON DELETE SET NULL,
  question_count INT NOT NULL DEFAULT 0 CHECK (question_count BETWEEN 0 AND 200),
  play_count     BIGINT NOT NULL DEFAULT 0 CHECK (play_count >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_owner  ON public.quizzes (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quizzes_browse ON public.quizzes (visibility, status, campus_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  quiz_id     UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  position    INT  NOT NULL CHECK (position >= 0),
  PRIMARY KEY (quiz_id, question_id),
  CONSTRAINT quiz_questions_position_unique UNIQUE (quiz_id, position)
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_order ON public.quiz_questions (quiz_id, position);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_bank  ON public.quiz_questions (question_id);

-- ------------------------------------------------------------
-- 2. question_count is database-controlled, never client-supplied
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_questions_sync_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz UUID := coalesce(NEW.quiz_id, OLD.quiz_id);
BEGIN
  UPDATE public.quizzes q
  SET question_count = (
        SELECT count(*) FROM public.quiz_questions qq WHERE qq.quiz_id = v_quiz
      ),
      updated_at = now()
  WHERE q.id = v_quiz;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_quiz_questions_count ON public.quiz_questions;
CREATE TRIGGER trg_quiz_questions_count
AFTER INSERT OR DELETE ON public.quiz_questions
FOR EACH ROW EXECUTE FUNCTION public.quiz_questions_sync_count();

CREATE OR REPLACE FUNCTION public.quizzes_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_quizzes_touch ON public.quizzes;
CREATE TRIGGER trg_quizzes_touch
BEFORE UPDATE ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.quizzes_touch_updated_at();

-- ------------------------------------------------------------
-- 3. Visibility predicate
--    Follows the existing `can_view_opportunity(p_row)` convention from
--    034_content_visibility.sql rather than inventing a new one.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_quiz(p_quiz public.quizzes)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF p_quiz.id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- owner and platform admins always see their own material
  IF v_uid IS NOT NULL
     AND (p_quiz.owner_id = v_uid OR public.is_platform_admin(v_uid)) THEN
    RETURN TRUE;
  END IF;

  -- only published quizzes are discoverable at all
  IF p_quiz.status <> 'published' THEN
    RETURN FALSE;
  END IF;

  IF p_quiz.visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  IF p_quiz.visibility = 'campus' THEN
    RETURN v_uid IS NOT NULL
       AND p_quiz.campus_id IS NOT NULL
       AND p_quiz.campus_id = public.my_campus_id();
  END IF;

  RETURN FALSE;
END $$;

REVOKE EXECUTE ON FUNCTION public.can_view_quiz(public.quizzes) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_quiz(public.quizzes) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE public.quizzes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quizzes_owner_all ON public.quizzes;
CREATE POLICY quizzes_owner_all ON public.quizzes
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS quizzes_public_read ON public.quizzes;
CREATE POLICY quizzes_public_read ON public.quizzes
  FOR SELECT TO anon
  USING (status = 'published' AND visibility = 'public');

DROP POLICY IF EXISTS quizzes_campus_read ON public.quizzes;
CREATE POLICY quizzes_campus_read ON public.quizzes
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND (
      visibility = 'public'
      OR (visibility = 'campus' AND campus_id IS NOT NULL AND campus_id = public.my_campus_id())
    )
  );

-- quiz_questions mirrors the parent quiz; there is no independent access.
DROP POLICY IF EXISTS quiz_questions_visible_read ON public.quiz_questions;
CREATE POLICY quiz_questions_visible_read ON public.quiz_questions
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_questions.quiz_id AND public.can_view_quiz(q)
    )
  );

DROP POLICY IF EXISTS quiz_questions_owner_write ON public.quiz_questions;
CREATE POLICY quiz_questions_owner_write ON public.quiz_questions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_questions.quiz_id
        AND (q.owner_id = auth.uid() OR public.is_platform_admin(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_questions.quiz_id AND q.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 5. Helpers
-- ------------------------------------------------------------
-- Ownership check used by every mutating RPC.
CREATE OR REPLACE FUNCTION public.assert_quiz_owner(p_quiz_id UUID)
RETURNS public.quizzes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id;
  IF v_quiz.id IS NULL THEN
    RAISE EXCEPTION 'quiz not found' USING ERRCODE = '02000';
  END IF;
  IF v_quiz.owner_id <> auth.uid() AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only the quiz owner can do that' USING ERRCODE = '42501';
  END IF;

  RETURN v_quiz;
END $$;

REVOKE EXECUTE ON FUNCTION public.assert_quiz_owner(UUID) FROM PUBLIC;

-- Copy a bank question (and its options) into a new row owned by p_owner.
-- Used by quiz_fork so a fork never references another user's bank rows.
CREATE OR REPLACE FUNCTION public.quiz_clone_bank_question(p_question_id UUID, p_owner UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src  public.question_bank;
  v_new  UUID;
BEGIN
  SELECT * INTO v_src FROM public.question_bank WHERE id = p_question_id;
  IF v_src.id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.question_bank (
    created_by, subject, topic, difficulty, question_type,
    question_text, explanation, image_url, tags, marks, time_limit_seconds
  ) VALUES (
    p_owner, v_src.subject, v_src.topic, v_src.difficulty, v_src.question_type,
    v_src.question_text, v_src.explanation, v_src.image_url, v_src.tags,
    v_src.marks, v_src.time_limit_seconds
  ) RETURNING id INTO v_new;

  INSERT INTO public.question_bank_options (question_id, position, option_text, is_correct)
  SELECT v_new, o.position, o.option_text, o.is_correct
  FROM public.question_bank_options o
  WHERE o.question_id = p_question_id
  ORDER BY o.position;

  RETURN v_new;
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_clone_bank_question(UUID, UUID) FROM PUBLIC;

-- ------------------------------------------------------------
-- 6. Quiz RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_create(
  p_title        TEXT,
  p_description  TEXT DEFAULT NULL,
  p_subject      TEXT DEFAULT 'General',
  p_visibility   TEXT DEFAULT 'private',
  p_campus_id    UUID DEFAULT NULL,
  p_question_ids UUID[] DEFAULT '{}',
  p_source       TEXT DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_quiz    public.quizzes;
  v_vis     TEXT;
  v_campus  UUID;
  v_id      UUID;
  v_pos     INT := 0;
  v_added   INT := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_vis := CASE WHEN p_visibility IN ('private', 'campus', 'public')
                THEN p_visibility ELSE 'private' END;

  -- campus visibility is only meaningful with a campus on the caller
  v_campus := CASE WHEN v_vis = 'campus' THEN coalesce(p_campus_id, public.my_campus_id())
                   ELSE p_campus_id END;

  IF v_vis = 'campus' AND v_campus IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campus_required');
  END IF;

  INSERT INTO public.quizzes (
    owner_id, campus_id, title, description, subject, visibility, status, source
  ) VALUES (
    v_me, v_campus, btrim(p_title), p_description,
    coalesce(nullif(btrim(p_subject), ''), 'General'),
    v_vis, 'draft',
    CASE WHEN p_source IN ('manual', 'import', 'ai', 'competition') THEN p_source ELSE 'manual' END
  ) RETURNING * INTO v_quiz;

  IF p_question_ids IS NOT NULL AND array_length(p_question_ids, 1) IS NOT NULL THEN
    FOR v_id IN
      SELECT q.id
      FROM unnest(p_question_ids) WITH ORDINALITY AS t(id, ord)
      JOIN public.question_bank q ON q.id = t.id
      WHERE q.created_by = v_me AND q.is_archived = FALSE
      ORDER BY t.ord
    LOOP
      INSERT INTO public.quiz_questions (quiz_id, question_id, position)
      VALUES (v_quiz.id, v_id, v_pos)
      ON CONFLICT DO NOTHING;
      v_pos := v_pos + 1;
      v_added := v_added + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quiz_id', v_quiz.id, 'question_count', v_added);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_create(TEXT, TEXT, TEXT, TEXT, UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_create(TEXT, TEXT, TEXT, TEXT, UUID, UUID[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_update(
  p_quiz_id     UUID,
  p_title       TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_subject     TEXT DEFAULT NULL,
  p_visibility  TEXT DEFAULT NULL,
  p_campus_id   UUID DEFAULT NULL,
  p_cover_url   TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes;
  v_vis  TEXT;
BEGIN
  v_quiz := public.assert_quiz_owner(p_quiz_id);

  v_vis := CASE WHEN p_visibility IN ('private', 'campus', 'public')
                THEN p_visibility ELSE v_quiz.visibility END;

  UPDATE public.quizzes
  SET title       = coalesce(nullif(btrim(p_title), ''), title),
      description = coalesce(p_description, description),
      subject     = coalesce(nullif(btrim(p_subject), ''), subject),
      cover_url   = coalesce(p_cover_url, cover_url),
      visibility  = v_vis,
      campus_id   = CASE
                      WHEN v_vis = 'campus'
                      THEN coalesce(p_campus_id, campus_id, public.my_campus_id())
                      ELSE coalesce(p_campus_id, campus_id)
                    END
  WHERE id = p_quiz_id
  RETURNING * INTO v_quiz;

  IF v_quiz.visibility = 'campus' AND v_quiz.campus_id IS NULL THEN
    -- undo, a campus quiz without a campus would be invisible to everyone
    UPDATE public.quizzes SET visibility = 'private' WHERE id = p_quiz_id;
    RETURN jsonb_build_object('ok', false, 'error', 'campus_required');
  END IF;

  RETURN jsonb_build_object('ok', true, 'quiz_id', v_quiz.id, 'visibility', v_quiz.visibility);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_update(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_update(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_add_questions(p_quiz_id UUID, p_question_ids UUID[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_quiz   public.quizzes;
  v_next   INT;
  v_id     UUID;
  v_added  INT := 0;
  v_skipped INT := 0;
BEGIN
  v_quiz := public.assert_quiz_owner(p_quiz_id);

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'added', 0, 'skipped', 0);
  END IF;

  SELECT coalesce(max(position) + 1, 0) INTO v_next
  FROM public.quiz_questions WHERE quiz_id = v_quiz.id;

  FOR v_id IN
    SELECT q.id
    FROM unnest(p_question_ids) WITH ORDINALITY AS t(id, ord)
    JOIN public.question_bank q ON q.id = t.id
    WHERE q.created_by = v_me AND q.is_archived = FALSE
    ORDER BY t.ord
  LOOP
    IF EXISTS (SELECT 1 FROM public.quiz_questions
               WHERE quiz_id = v_quiz.id AND question_id = v_id) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.quiz_questions (quiz_id, question_id, position)
    VALUES (v_quiz.id, v_id, v_next);
    v_next := v_next + 1;
    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skipped);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_add_questions(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_add_questions(UUID, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_remove_question(p_quiz_id UUID, p_question_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_quiz_owner(p_quiz_id);

  DELETE FROM public.quiz_questions
  WHERE quiz_id = p_quiz_id AND question_id = p_question_id;

  -- close the gap so positions stay 0..n-1
  WITH ordered AS (
    SELECT question_id, row_number() OVER (ORDER BY position) - 1 AS new_pos
    FROM public.quiz_questions WHERE quiz_id = p_quiz_id
  )
  UPDATE public.quiz_questions qq
  SET position = ordered.new_pos + 100000
  FROM ordered
  WHERE qq.quiz_id = p_quiz_id AND qq.question_id = ordered.question_id;

  UPDATE public.quiz_questions
  SET position = position - 100000
  WHERE quiz_id = p_quiz_id AND position >= 100000;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_remove_question(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_remove_question(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_reorder(p_quiz_id UUID, p_question_ids UUID[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected INT;
  v_given    INT;
BEGIN
  PERFORM public.assert_quiz_owner(p_quiz_id);

  SELECT count(*) INTO v_expected FROM public.quiz_questions WHERE quiz_id = p_quiz_id;
  v_given := coalesce(array_length(p_question_ids, 1), 0);

  -- the call must name every question exactly once
  IF v_given <> v_expected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_mismatch');
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_question_ids) AS x) <> v_expected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_in_order');
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_question_ids) AS x
    WHERE x NOT IN (SELECT question_id FROM public.quiz_questions WHERE quiz_id = p_quiz_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_mismatch');
  END IF;

  -- shift out of the way first so the UNIQUE(quiz_id, position) never trips
  UPDATE public.quiz_questions SET position = position + 100000 WHERE quiz_id = p_quiz_id;

  UPDATE public.quiz_questions qq
  SET position = t.ord - 1
  FROM unnest(p_question_ids) WITH ORDINALITY AS t(id, ord)
  WHERE qq.quiz_id = p_quiz_id AND qq.question_id = t.id;

  RETURN jsonb_build_object('ok', true, 'count', v_expected);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_reorder(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_reorder(UUID, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_publish(p_quiz_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes;
  v_bad  INT;
BEGIN
  v_quiz := public.assert_quiz_owner(p_quiz_id);

  IF v_quiz.question_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_questions');
  END IF;

  -- every referenced bank row must still be readable by the owner, and
  -- must have at least two options with exactly one-or-more marked correct
  SELECT count(*) INTO v_bad
  FROM public.quiz_questions qq
  JOIN public.question_bank q ON q.id = qq.question_id
  WHERE qq.quiz_id = p_quiz_id
    AND (
      q.created_by <> v_quiz.owner_id
      OR q.is_archived = TRUE
      OR (SELECT count(*) FROM public.question_bank_options o WHERE o.question_id = q.id) < 2
      OR (SELECT count(*) FROM public.question_bank_options o
          WHERE o.question_id = q.id AND o.is_correct) < 1
    );

  IF v_bad > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_questions', 'count', v_bad);
  END IF;

  IF v_quiz.visibility = 'campus' AND v_quiz.campus_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campus_required');
  END IF;

  UPDATE public.quizzes
  SET status = 'published'
  WHERE id = p_quiz_id;

  RETURN jsonb_build_object('ok', true, 'quiz_id', p_quiz_id, 'status', 'published');
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_publish(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_publish(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_set_status(p_quiz_id UUID, p_status TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes;
BEGIN
  v_quiz := public.assert_quiz_owner(p_quiz_id);

  IF p_status NOT IN ('draft', 'published', 'archived') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_status');
  END IF;

  IF p_status = 'published' THEN
    RETURN public.quiz_publish(p_quiz_id);
  END IF;

  UPDATE public.quizzes SET status = p_status WHERE id = p_quiz_id;
  RETURN jsonb_build_object('ok', true, 'quiz_id', p_quiz_id, 'status', p_status);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_set_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_set_status(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_delete(p_quiz_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes;
BEGIN
  v_quiz := public.assert_quiz_owner(p_quiz_id);

  -- A quiz that has been played stays as an archive: competitions and
  -- results reference it, and deleting it would orphan history.
  IF EXISTS (SELECT 1 FROM public.competitions c WHERE c.quiz_id = p_quiz_id)
     OR v_quiz.play_count > 0 THEN
    UPDATE public.quizzes SET status = 'archived' WHERE id = p_quiz_id;
    RETURN jsonb_build_object('ok', true, 'archived', true);
  END IF;

  DELETE FROM public.quizzes WHERE id = p_quiz_id;
  RETURN jsonb_build_object('ok', true, 'archived', false);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_delete(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_delete(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_fork(p_quiz_id UUID, p_title TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_src    public.quizzes;
  v_new    public.quizzes;
  v_row    RECORD;
  v_clone  UUID;
  v_pos    INT := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_src FROM public.quizzes WHERE id = p_quiz_id;
  IF v_src.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT public.can_view_quiz(v_src) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.quizzes (
    owner_id, campus_id, title, description, cover_url, subject,
    visibility, status, source, fork_of
  ) VALUES (
    v_me,
    coalesce(public.my_campus_id(), v_src.campus_id),
    left(coalesce(nullif(btrim(p_title), ''), v_src.title), 140),
    v_src.description, v_src.cover_url, v_src.subject,
    'private', 'draft', 'manual', v_src.id
  ) RETURNING * INTO v_new;

  FOR v_row IN
    SELECT qq.question_id
    FROM public.quiz_questions qq
    WHERE qq.quiz_id = v_src.id
    ORDER BY qq.position
  LOOP
    -- copy the bank row too: the fork must not depend on another user's bank
    IF EXISTS (SELECT 1 FROM public.question_bank q
               WHERE q.id = v_row.question_id AND q.created_by = v_me) THEN
      v_clone := v_row.question_id;
    ELSE
      v_clone := public.quiz_clone_bank_question(v_row.question_id, v_me);
    END IF;

    IF v_clone IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.quiz_questions (quiz_id, question_id, position)
    VALUES (v_new.id, v_clone, v_pos);
    v_pos := v_pos + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'quiz_id', v_new.id, 'question_count', v_pos);
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_fork(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_fork(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 7. Read RPCs — the only cross-user path to question content.
--    Never returns is_correct. Explanations are withheld until a
--    caller is the owner (they describe the answer).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quiz_detail(p_quiz_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz  public.quizzes;
  v_owner BOOLEAN;
  v_qs    JSONB;
BEGIN
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id;
  IF v_quiz.id IS NULL OR NOT public.can_view_quiz(v_quiz) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_owner := auth.uid() IS NOT NULL
             AND (v_quiz.owner_id = auth.uid() OR public.is_platform_admin(auth.uid()));

  SELECT coalesce(jsonb_agg(row ORDER BY ord), '[]'::jsonb) INTO v_qs
  FROM (
    SELECT qq.position AS ord,
           jsonb_build_object(
             'position', qq.position,
             'question_id', q.id,
             'type', q.question_type,
             'question', q.question_text,
             'image_url', q.image_url,
             'difficulty', q.difficulty,
             'subject', q.subject,
             'topic', q.topic,
             'marks', q.marks,
             'time_limit_seconds', q.time_limit_seconds,
             'options', (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'position', o.position, 'text', o.option_text) ORDER BY o.position), '[]'::jsonb)
               FROM public.question_bank_options o
               WHERE o.question_id = q.id
             ),
             -- owner-only: the explanation describes the correct answer
             'explanation', CASE WHEN v_owner THEN q.explanation ELSE NULL END,
             'is_correct_positions', CASE WHEN v_owner THEN (
               SELECT coalesce(jsonb_agg(o.position ORDER BY o.position), '[]'::jsonb)
               FROM public.question_bank_options o
               WHERE o.question_id = q.id AND o.is_correct
             ) ELSE NULL END
           ) AS row
    FROM public.quiz_questions qq
    JOIN public.question_bank q ON q.id = qq.question_id
    WHERE qq.quiz_id = p_quiz_id
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'quiz', jsonb_build_object(
      'id', v_quiz.id, 'title', v_quiz.title, 'description', v_quiz.description,
      'cover_url', v_quiz.cover_url, 'subject', v_quiz.subject,
      'visibility', v_quiz.visibility, 'status', v_quiz.status,
      'source', v_quiz.source, 'fork_of', v_quiz.fork_of,
      'question_count', v_quiz.question_count, 'play_count', v_quiz.play_count,
      'campus_id', v_quiz.campus_id,
      'is_owner', v_owner,
      'owner_id', CASE WHEN v_owner THEN v_quiz.owner_id ELSE NULL END
    ),
    'questions', v_qs
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.quiz_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_detail(UUID) TO anon, authenticated;
