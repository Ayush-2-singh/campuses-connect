-- ============================================================
-- CampusConnect — 025 CONNECTIVITY FLOWS
-- Makes the core loops logically complete:
--   1. Students can post (discussion/resource/notes/hackathon/
--      project/opportunity at campus scope) via the matrix.
--   2. Hackathon posts get an in-app Join action (post_joins)
--      with author notification.
--   3. Team requests open to every student + a request→accept
--      flow (team_request_interests) that creates a real
--      `connections` row when the poster accepts.
--   4. Communities can require an entry test set by the owner
--      (communities.join_test); passing it is what lets a
--      student in. join_community() now enforces the test too.
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enable student posting (V3 matrix — data, not code)
--    Community/announcement/event stay admin-only.
-- ------------------------------------------------------------
INSERT INTO public.content_permissions (actor_type, category_id, max_scope)
SELECT 'student', cc.id, v.scope
FROM public.content_categories cc
JOIN (VALUES
  ('discussion',   'campus'),
  ('resource',     'campus'),
  ('notes',        'campus'),
  ('hackathon',    'campus'),
  ('project',      'campus'),
  ('opportunity',  'campus')
) AS v(key, scope) ON v.key = cc.key
ON CONFLICT (actor_type, category_id) DO UPDATE SET max_scope = EXCLUDED.max_scope;

-- ------------------------------------------------------------
-- 2. Hackathon joins — anyone who can see the post can join it
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_joins (
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_joins_post ON public.post_joins (post_id);
CREATE INDEX IF NOT EXISTS idx_post_joins_user ON public.post_joins (user_id);

ALTER TABLE public.post_joins ENABLE ROW LEVEL SECURITY;

-- Anyone who can view the post can see who joined (counts).
CREATE POLICY post_joins_select ON public.post_joins
  FOR SELECT TO authenticated USING (public.can_view_post_id(post_id));

-- Members can remove their own join (writes go through the RPC below).
CREATE POLICY post_joins_delete_own ON public.post_joins
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Join a hackathon post (validates category + publish state + visibility)
CREATE OR REPLACE FUNCTION public.join_hackathon(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  IF auth.uid() IS NULL OR p_post_id IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.can_view_post_id(p_post_id) THEN RETURN FALSE; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.posts p
    JOIN public.content_categories cc ON cc.id = p.category_id
    WHERE p.id = p_post_id AND p.status = 'published' AND cc.key = 'hackathon'
  ) THEN RETURN FALSE; END IF;

  INSERT INTO public.post_joins (post_id, user_id)
  VALUES (p_post_id, auth.uid())
  ON CONFLICT (post_id, user_id) DO NOTHING;

  SELECT author_id INTO v_author FROM public.posts WHERE id = p_post_id;
  IF v_author IS NOT NULL AND v_author <> auth.uid() THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
    VALUES (v_author, auth.uid(), 'system', 'post', p_post_id,
            'New hackathon join', 'Someone joined your hackathon post');
  END IF;
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_hackathon(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_hackathon(UUID) TO authenticated;

-- Leave a hackathon post
CREATE OR REPLACE FUNCTION public.leave_hackathon(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_post_id IS NULL THEN RETURN FALSE; END IF;
  DELETE FROM public.post_joins WHERE post_id = p_post_id AND user_id = auth.uid();
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.leave_hackathon(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_hackathon(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. Teammate flow — any student can post; others request to
--    join; the poster accepts → both become connected.
-- ------------------------------------------------------------
-- Open team_requests to every authenticated student (was admin-only)
DROP POLICY IF EXISTS team_requests_insert ON public.team_requests;
CREATE POLICY team_requests_insert ON public.team_requests
  FOR INSERT TO authenticated WITH CHECK (posted_by = auth.uid());

-- Interest / join requests on a team request
CREATE TABLE IF NOT EXISTS public.team_request_interests (
  request_id UUID NOT NULL REFERENCES public.team_requests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tri_request ON public.team_request_interests (request_id, status);
CREATE INDEX IF NOT EXISTS idx_tri_user ON public.team_request_interests (user_id);

ALTER TABLE public.team_request_interests ENABLE ROW LEVEL SECURITY;

-- See your own interests OR interests on team requests you posted
CREATE POLICY tri_select ON public.team_request_interests
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.team_requests tr
               WHERE tr.id = request_id AND tr.posted_by = auth.uid())
  );

-- Poster resolves interests (accept/decline); users can withdraw their own
CREATE POLICY tri_update ON public.team_request_interests
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.team_requests tr
               WHERE tr.id = request_id AND tr.posted_by = auth.uid())
  ) WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.team_requests tr
               WHERE tr.id = request_id AND tr.posted_by = auth.uid())
  );

-- A student expresses interest in joining a team request
CREATE OR REPLACE FUNCTION public.request_team_join(p_request_id UUID, p_message TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID;
BEGIN
  IF auth.uid() IS NULL OR p_request_id IS NULL THEN RETURN FALSE; END IF;

  SELECT posted_by INTO v_owner
  FROM public.team_requests WHERE id = p_request_id AND is_open;
  IF v_owner IS NULL OR v_owner = auth.uid() THEN RETURN FALSE; END IF;

  INSERT INTO public.team_request_interests (request_id, user_id, message)
  VALUES (p_request_id, auth.uid(), NULLIF(p_message, ''))
  ON CONFLICT (request_id, user_id) DO NOTHING;

  INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
  VALUES (v_owner, auth.uid(), 'connection_request', 'team_request', p_request_id,
          'New teammate request', 'Someone wants to join your team for ' ||
          COALESCE((SELECT event_name FROM public.team_requests WHERE id = p_request_id), 'an event'));

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.request_team_join(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.request_team_join(UUID, TEXT) TO authenticated;

-- The poster accepts or declines an interested student.
-- On accept, both parties get a real `connections` row (accepted).
CREATE OR REPLACE FUNCTION public.respond_team_join(p_request_id UUID, p_user_id UUID, p_accept BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID;
BEGIN
  IF auth.uid() IS NULL OR p_request_id IS NULL OR p_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT posted_by INTO v_owner FROM public.team_requests WHERE id = p_request_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN RETURN FALSE; END IF;

  UPDATE public.team_request_interests
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
  WHERE request_id = p_request_id AND user_id = p_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF p_accept THEN
    INSERT INTO public.connections (requester_id, receiver_id, status)
    VALUES (p_user_id, v_owner, 'accepted')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
    VALUES (p_user_id, v_owner, 'connection_accepted', 'team_request', p_request_id,
            'Team request accepted', 'Your teammate request was accepted — you are now connected');
  END IF;
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.respond_team_join(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.respond_team_join(UUID, UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 4. Community entry test — owner sets a short test; passing it
--    is what lets a student join (works with open/approval mode).
-- ------------------------------------------------------------
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS join_test JSONB;
-- join_test format: [{"q": "...", "options": ["A","B","C"], "answer": 0}]

-- Test submissions (own view only; graded inside the RPC below)
CREATE TABLE IF NOT EXISTS public.community_test_submissions (
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL,
  score        INT  NOT NULL,
  total        INT  NOT NULL,
  passed       BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE public.community_test_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cts_select_own ON public.community_test_submissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Gate community membership so raw inserts can only join open,
-- test-free communities; everything else must go through the
-- join_community() / submit_community_test() gateways.
DROP POLICY IF EXISTS members_insert_own ON public.community_members;
CREATE POLICY members_insert_own ON public.community_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_id
        AND (c.visibility <> 'open' OR c.join_test IS NOT NULL)
    )
  );

-- join_community() now reports when an entry test is required
CREATE OR REPLACE FUNCTION public.join_community(p_community_id UUID, p_password TEXT DEFAULT NULL)
RETURNS TEXT   -- 'joined' | 'pending' | 'test_required' | 'wrong_password' | 'already' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vis   TEXT;
  v_pass  TEXT;
  v_test  JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'error'; END IF;

  SELECT visibility, join_password, join_test INTO v_vis, v_pass, v_test
    FROM public.communities WHERE id = p_community_id;
  IF NOT FOUND THEN RETURN 'error'; END IF;

  IF EXISTS (SELECT 1 FROM public.community_members
              WHERE community_id = p_community_id AND user_id = auth.uid()) THEN
    RETURN 'already';
  END IF;

  -- Entry test takes priority — student must pass it first
  IF v_test IS NOT NULL AND jsonb_typeof(v_test) = 'array' AND jsonb_array_length(v_test) > 0 THEN
    RETURN 'test_required';
  END IF;

  IF v_vis = 'private' THEN
    IF p_password IS NULL OR v_pass IS NULL OR p_password <> v_pass THEN
      RETURN 'wrong_password';
    END IF;
    INSERT INTO public.community_members (community_id, user_id, status)
    VALUES (p_community_id, auth.uid(), 'approved');
    RETURN 'joined';
  END IF;

  IF v_vis = 'approval' THEN
    INSERT INTO public.community_members (community_id, user_id, status)
    VALUES (p_community_id, auth.uid(), 'pending');
    RETURN 'pending';
  END IF;

  INSERT INTO public.community_members (community_id, user_id, status)
  VALUES (p_community_id, auth.uid(), 'approved');
  RETURN 'joined';
END $$;
REVOKE EXECUTE ON FUNCTION public.join_community(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_community(UUID, TEXT) TO authenticated;

-- Grade + submit the entry test; on pass the student joins
-- (open → approved; approval → pending for the owner to confirm).
CREATE OR REPLACE FUNCTION public.submit_community_test(p_community_id UUID, p_answers JSONB)
RETURNS BOOLEAN   -- TRUE = passed (and joined / queued), FALSE = failed
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_test     JSONB;
  v_total    INT := 0;
  v_score    INT := 0;
  v_idx      INT;
  v_ans      INT;
  v_correct  INT;
  v_passed   BOOLEAN;
  v_vis      TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_community_id IS NULL OR p_answers IS NULL THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.community_members
              WHERE community_id = p_community_id AND user_id = auth.uid()) THEN
    RETURN TRUE;  -- already a member
  END IF;

  SELECT join_test, visibility INTO v_test, v_vis
  FROM public.communities WHERE id = p_community_id;
  IF v_test IS NULL OR jsonb_typeof(v_test) <> 'array' OR jsonb_array_length(v_test) = 0 THEN
    RETURN FALSE;  -- no test configured; use join_community() instead
  END IF;

  v_total := jsonb_array_length(v_test);
  FOR v_idx IN 0 .. v_total - 1 LOOP
    v_correct := COALESCE((v_test -> v_idx ->> 'answer')::INT, -1);
    v_ans     := COALESCE((p_answers -> v_idx)::INT, -1);
    IF v_ans = v_correct THEN v_score := v_score + 1; END IF;
  END LOOP;

  -- Pass = 60% or more correct (1/1 required, 2/3 required, 3/4 required, ...)
  v_passed := v_score >= CEIL(v_total * 0.6);

  INSERT INTO public.community_test_submissions (community_id, user_id, answers, score, total, passed)
  VALUES (p_community_id, auth.uid(), p_answers, v_score, v_total, v_passed)
  ON CONFLICT (community_id, user_id) DO UPDATE
    SET answers = EXCLUDED.answers, score = EXCLUDED.score,
        total = EXCLUDED.total, passed = EXCLUDED.passed, created_at = now();

  IF v_passed THEN
    IF v_vis = 'approval' THEN
      INSERT INTO public.community_members (community_id, user_id, status)
      VALUES (p_community_id, auth.uid(), 'pending')
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO public.community_members (community_id, user_id, status)
      VALUES (p_community_id, auth.uid(), 'approved')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN v_passed;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_community_test(UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_community_test(UUID, JSONB) TO authenticated;

-- Owner / platform admin sets (or clears with NULL) the entry test
CREATE OR REPLACE FUNCTION public.set_community_test(p_community_id UUID, p_test JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_item     JSONB;
  v_i        INT;
  v_opts     INT;
BEGIN
  IF auth.uid() IS NULL OR p_community_id IS NULL THEN RETURN FALSE; END IF;

  SELECT
    EXISTS (SELECT 1 FROM public.admin_grants
            WHERE user_id = auth.uid() AND admin_type = 'platform_admin')
    OR EXISTS (SELECT 1 FROM public.admin_grants
               WHERE user_id = auth.uid() AND admin_type = 'community_admin'
                 AND community_id = p_community_id)
  INTO v_is_admin;
  IF NOT v_is_admin THEN RETURN FALSE; END IF;

  -- Validate shape: array of { q, options[>=2], answer in range } (NULL clears)
  IF p_test IS NOT NULL THEN
    IF jsonb_typeof(p_test) <> 'array' THEN RETURN FALSE; END IF;
    FOR v_i IN 0 .. jsonb_array_length(p_test) - 1 LOOP
      v_item := p_test -> v_i;
      v_opts := jsonb_array_length(v_item -> 'options');
      IF (v_item ->> 'q') IS NULL OR NULLIF(v_item ->> 'q', '') IS NULL
         OR jsonb_typeof(v_item -> 'options') <> 'array' OR v_opts < 2
         OR (v_item ->> 'answer') IS NULL
         OR (v_item ->> 'answer')::INT < 0 OR (v_item ->> 'answer')::INT >= v_opts THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.communities SET join_test = p_test WHERE id = p_community_id;
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_community_test(UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_community_test(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 5. Connection trigger: only announce *pending* requests so the
--    accept flow (which inserts accepted rows directly) does not
--    fire a misleading "Someone wants to connect" notification.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_connection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.receiver_id <> NEW.requester_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
    VALUES (NEW.receiver_id, NEW.requester_id, 'connection_request', 'connection', NEW.id,
            'New connection request', 'Someone wants to connect with you');
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Verify: student matrix rows exist, tables + RPCs are present
-- ------------------------------------------------------------
SELECT actor_type, cc.key, cp.max_scope
FROM public.content_permissions cp
JOIN public.content_categories cc ON cc.id = cp.category_id
WHERE cp.actor_type = 'student'
ORDER BY cc.sort_order;
