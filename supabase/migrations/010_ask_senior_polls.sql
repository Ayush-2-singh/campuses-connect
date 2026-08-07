-- ============================================================
-- CampusConnect — Ask a Senior (Q&A) + Real-time Polls
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Idempotent — safe to re-run.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ASK A SENIOR — questions & answers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asked_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id   UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  subject     TEXT,
  body        TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.answers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answered_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  is_accepted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_campus  ON public.questions (campus_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_question  ON public.answers (question_id, created_at);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers  ENABLE ROW LEVEL SECURITY;

-- questions
DROP POLICY IF EXISTS questions_select ON public.questions;
CREATE POLICY questions_select ON public.questions
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS questions_insert ON public.questions;
CREATE POLICY questions_insert ON public.questions
  FOR INSERT WITH CHECK (asked_by = auth.uid());

DROP POLICY IF EXISTS questions_update ON public.questions;
CREATE POLICY questions_update ON public.questions
  FOR UPDATE USING (
    asked_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

DROP POLICY IF EXISTS questions_delete ON public.questions;
CREATE POLICY questions_delete ON public.questions
  FOR DELETE USING (
    asked_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

-- answers
DROP POLICY IF EXISTS answers_select ON public.answers;
CREATE POLICY answers_select ON public.answers
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS answers_insert ON public.answers;
CREATE POLICY answers_insert ON public.answers
  FOR INSERT WITH CHECK (answered_by = auth.uid());

DROP POLICY IF EXISTS answers_update ON public.answers;
CREATE POLICY answers_update ON public.answers
  FOR UPDATE USING (
    answered_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

DROP POLICY IF EXISTS answers_delete ON public.answers;
CREATE POLICY answers_delete ON public.answers
  FOR DELETE USING (
    answered_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

-- ── accept_answer: marks an answer accepted, resolves the question,
--    and awards the answerer 15 karma. SECURITY DEFINER so it can
--    credit the answerer (not the caller). Only the asker or a
--    moderator may accept.
DROP FUNCTION IF EXISTS public.accept_answer(UUID);
CREATE OR REPLACE FUNCTION public.accept_answer(p_answer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question_id UUID;
  v_answerer    UUID;
BEGIN
  SELECT question_id, answered_by INTO v_question_id, v_answerer
  FROM public.answers WHERE id = p_answer_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Already accepted -> no-op (prevents double karma)
  IF EXISTS (SELECT 1 FROM public.answers WHERE id = p_answer_id AND is_accepted) THEN
    RETURN TRUE;
  END IF;

  -- Only one accepted answer per question
  IF EXISTS (SELECT 1 FROM public.answers WHERE question_id = v_question_id AND is_accepted) THEN
    RETURN FALSE;
  END IF;

  -- Only the asker or a moderator may accept
  IF NOT EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = v_question_id
      AND (q.asked_by = auth.uid()
           OR public.has_mod_permission(auth.uid(), 'content.moderation'))
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.answers SET is_accepted = TRUE WHERE id = p_answer_id;
  UPDATE public.questions SET is_resolved = TRUE WHERE id = v_question_id;

  -- Credit the answerer once (never the acceptor themselves)
  IF v_answerer IS NOT NULL AND v_answerer <> auth.uid() THEN
    UPDATE public.profiles
    SET karma_points = COALESCE(karma_points, 0) + 15
    WHERE id = v_answerer;

    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'answer_accepted', 'answer', p_answer_id,
            jsonb_build_object('answerer', v_answerer));
  END IF;

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.accept_answer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_answer(UUID) TO authenticated;

-- ── submit_answer: server-gated answer submission. Blocks self-answering
--    and awards +5 karma only once per question per student.
DROP FUNCTION IF EXISTS public.submit_answer(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.submit_answer(p_question_id UUID, p_body TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asker UUID;
  v_first BOOLEAN;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RETURN FALSE; END IF;

  SELECT asked_by INTO v_asker FROM public.questions WHERE id = p_question_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Students cannot answer their own question (no self-karma)
  IF v_asker = auth.uid() THEN RETURN FALSE; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.answers
    WHERE question_id = p_question_id AND answered_by = auth.uid()
  ) INTO v_first;

  INSERT INTO public.answers (question_id, answered_by, body)
  VALUES (p_question_id, auth.uid(), trim(p_body));

  -- +5 karma only for the student's FIRST answer to this question
  IF v_first THEN
    UPDATE public.profiles SET karma_points = COALESCE(karma_points, 0) + 5
    WHERE id = auth.uid();
  END IF;

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) TO authenticated;

-- ── notify the asker when someone answers their question
DROP FUNCTION IF EXISTS public.notify_answer();
CREATE OR REPLACE FUNCTION public.notify_answer()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asker   UUID;
  v_title   TEXT;
BEGIN
  SELECT asked_by, title INTO v_asker, v_title
  FROM public.questions WHERE id = NEW.question_id;

  IF v_asker IS NOT NULL AND v_asker <> NEW.answered_by THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body, is_read)
    VALUES (v_asker, NEW.answered_by, 'answer', 'question', NEW.question_id,
            'New answer on your question', v_title, FALSE);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_answer ON public.answers;
CREATE TRIGGER trg_notify_answer AFTER INSERT ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.notify_answer();

-- ─────────────────────────────────────────────────────────────
-- 2. REAL-TIME POLLS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.polls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question    TEXT NOT NULL,
  options     JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),  -- ["Option A", "Option B", ...]
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id   UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  closes_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index INT NOT NULL CHECK (option_index >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_polls_campus ON public.polls (campus_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes (poll_id);

ALTER TABLE public.polls       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS polls_select ON public.polls;
CREATE POLICY polls_select ON public.polls
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS polls_insert ON public.polls;
CREATE POLICY polls_insert ON public.polls
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS polls_update ON public.polls;
CREATE POLICY polls_update ON public.polls
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

DROP POLICY IF EXISTS polls_delete ON public.polls;
CREATE POLICY polls_delete ON public.polls
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

DROP POLICY IF EXISTS poll_votes_select ON public.poll_votes;
CREATE POLICY poll_votes_select ON public.poll_votes
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS poll_votes_insert ON public.poll_votes;
CREATE POLICY poll_votes_insert ON public.poll_votes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS poll_votes_update ON public.poll_votes;
CREATE POLICY poll_votes_update ON public.poll_votes
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS poll_votes_delete ON public.poll_votes;
CREATE POLICY poll_votes_delete ON public.poll_votes
  FOR DELETE USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 3. Grants + realtime
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions, public.answers,
      public.polls, public.poll_votes TO authenticated;

-- Live updates for polls
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'polls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'poll_votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
  END IF;
END $$;
