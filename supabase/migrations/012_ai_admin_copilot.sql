-- ============================================================
-- CampusConnect — AI Admin Copilot (migration 012)
-- Auto-moderates new content (Gemini verdict -> held posts),
-- merges AI flags + user reports into one queue, and lets
-- moderators approve/remove/dismiss with author notifications.
-- Idempotent — safe to re-run.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. moderation_queue: AI verdict + author columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.moderation_queue
  ADD COLUMN IF NOT EXISTS author_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ai_verdict  JSONB;

-- extend content_type CHECK to also cover Q&A content
ALTER TABLE public.moderation_queue DROP CONSTRAINT IF EXISTS moderation_queue_content_type_check;
ALTER TABLE public.moderation_queue
  ADD CONSTRAINT moderation_queue_content_type_check
  CHECK (content_type IN ('post', 'comment', 'opportunity', 'note', 'question', 'answer'));

-- ─────────────────────────────────────────────────────────────
-- 2. notify_user — SECURITY DEFINER notification helper
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_user(
  p_recipient UUID, p_actor UUID, p_type TEXT, p_title TEXT,
  p_ref_type TEXT, p_ref_id UUID, p_body TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_recipient IS NULL OR p_recipient = p_actor THEN RETURN; END IF;
  INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body, is_read)
  VALUES (p_recipient, p_actor, p_type, p_ref_type, p_ref_id, p_title, p_body, FALSE);
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. flag_content — AI (or moderator) flags content -> queue row
--    + notifies the author. Caller must be the content author
--    OR have content.moderation.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.flag_content(TEXT, UUID, TEXT, JSONB, UUID);
CREATE OR REPLACE FUNCTION public.flag_content(
  p_content_type TEXT,
  p_content_id   UUID,
  p_reason       TEXT,
  p_ai_verdict   JSONB DEFAULT NULL,
  p_author_id    UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author UUID := COALESCE(p_author_id, auth.uid());
  v_id     UUID;
BEGIN
  -- only the content author (or a moderator) may flag it
  IF v_author <> auth.uid() AND NOT public.has_mod_permission(auth.uid(), 'content.moderation') THEN
    RETURN NULL;
  END IF;

  -- avoid duplicate open AI flags for the same item
  SELECT id INTO v_id FROM public.moderation_queue
  WHERE content_type = p_content_type AND content_id = p_content_id AND status = 'open'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.moderation_queue
    SET reason = p_reason, ai_verdict = COALESCE(p_ai_verdict, ai_verdict)
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.moderation_queue (content_type, content_id, reason, source, status, author_id, ai_verdict)
  VALUES (p_content_type, p_content_id, p_reason, 'ai', 'open', v_author, p_ai_verdict)
  RETURNING id INTO v_id;

  PERFORM public.notify_user(v_author, auth.uid(), 'moderation',
    'Your content is under review', p_content_type, p_content_id, p_reason);

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.flag_content(TEXT, UUID, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.flag_content(TEXT, UUID, TEXT, JSONB, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. resolve_moderation_item — approve / remove / dismiss.
--    Works for BOTH moderation_queue ids and content_reports ids.
--    Notifies the author, writes audit log. Moderator-only.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.resolve_moderation_item(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.resolve_moderation_item(p_item_id UUID, p_action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_content_type TEXT;
  v_content_id   UUID;
  v_author_id    UUID;
  v_reason       TEXT;
  v_queue        BOOLEAN := TRUE;
BEGIN
  IF p_action NOT IN ('approve', 'remove', 'dismiss') THEN RETURN FALSE; END IF;
  IF NOT public.has_mod_permission(auth.uid(), 'content.moderation') THEN RETURN FALSE; END IF;

  -- try moderation_queue first, then content_reports
  SELECT content_type, content_id, author_id, reason
    INTO v_content_type, v_content_id, v_author_id, v_reason
  FROM public.moderation_queue WHERE id = p_item_id;
  IF NOT FOUND THEN
    v_queue := FALSE;
    SELECT content_type, content_id, reported_by, reason
      INTO v_content_type, v_content_id, v_author_id, v_reason
    FROM public.content_reports WHERE id = p_item_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;
  END IF;

  -- ── apply the action to the content itself (posts/comments)
  IF p_action = 'approve' THEN
    IF v_content_type = 'post' THEN
      UPDATE public.posts SET status = 'published', held_reason = NULL WHERE id = v_content_id;
    ELSIF v_content_type = 'comment' THEN
      UPDATE public.post_comments SET is_deleted = FALSE WHERE id = v_content_id;
    END IF;
  ELSIF p_action = 'remove' THEN
    IF v_content_type = 'post' THEN
      UPDATE public.posts SET status = 'removed', held_reason = COALESCE(v_reason, 'Removed by moderator') WHERE id = v_content_id;
    ELSIF v_content_type = 'comment' THEN
      UPDATE public.post_comments SET is_deleted = TRUE WHERE id = v_content_id;
    ELSIF v_content_type = 'answer' THEN
      DELETE FROM public.answers WHERE id = v_content_id;
    END IF;
  ELSIF p_action = 'dismiss' THEN
    -- undo a hold: publish it back
    IF v_content_type = 'post' AND EXISTS (SELECT 1 FROM public.posts WHERE id = v_content_id AND status = 'held') THEN
      UPDATE public.posts SET status = 'published', held_reason = NULL WHERE id = v_content_id;
    END IF;
  END IF;

  -- ── mark the queue/report row resolved
  IF v_queue THEN
    UPDATE public.moderation_queue
    SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'resolved' END,
        resolved_by = auth.uid(), resolved_at = now()
    WHERE id = p_item_id;
  ELSE
    UPDATE public.content_reports
    SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'resolved' END,
        handled_by = auth.uid(), resolved_at = now()
    WHERE id = p_item_id;
  END IF;

  -- ── notify the author + audit
  IF v_author_id IS NOT NULL AND v_author_id <> auth.uid() THEN
    IF p_action = 'approve' THEN
      PERFORM public.notify_user(v_author_id, auth.uid(), 'moderation',
        'Your content was approved', v_content_type, v_content_id, 'It is now live.');
    ELSIF p_action = 'remove' THEN
      PERFORM public.notify_user(v_author_id, auth.uid(), 'moderation',
        'Your content was removed', v_content_type, v_content_id, COALESCE(v_reason, 'Removed by moderator'));
    END IF;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'moderation_' || p_action, v_content_type, v_content_id,
          jsonb_build_object('item_id', p_item_id, 'source', CASE WHEN v_queue THEN 'ai_queue' ELSE 'user_report' END));

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.resolve_moderation_item(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_moderation_item(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. get_moderation_queue — unified open queue (AI flags + user
--    reports) with content previews + author/reporter names.
--    Moderator-only (SECURITY DEFINER, checks content.moderation).
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_moderation_queue(INT);
CREATE OR REPLACE FUNCTION public.get_moderation_queue(p_limit INT DEFAULT 50)
RETURNS TABLE (
  item_id        UUID,
  source         TEXT,
  content_type   TEXT,
  content_id     UUID,
  reason         TEXT,
  ai_verdict     JSONB,
  preview        TEXT,
  status         TEXT,
  author_id      UUID,
  author_name    TEXT,
  author_username TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_mod_permission(auth.uid(), 'content.moderation') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id::uuid,
    'ai'::text,
    q.content_type,
    q.content_id,
    q.reason,
    q.ai_verdict,
    COALESCE(
      CASE q.content_type
        WHEN 'post'       THEN (SELECT p.body       FROM public.posts        p  WHERE p.id  = q.content_id)
        WHEN 'comment'    THEN (SELECT c.body       FROM public.post_comments c  WHERE c.id  = q.content_id)
        WHEN 'question'   THEN (SELECT qq.title || ' — ' || COALESCE(qq.body, '') FROM public.questions qq WHERE qq.id = q.content_id)
        WHEN 'answer'     THEN (SELECT a.body       FROM public.answers      a  WHERE a.id  = q.content_id)
        WHEN 'note'       THEN (SELECT n.title      FROM public.notes        n  WHERE n.id  = q.content_id)
        WHEN 'opportunity' THEN (SELECT p.body      FROM public.posts        p  WHERE p.id  = q.content_id)
      END, '')::text,
    q.status,
    q.author_id,
    (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = q.author_id),
    (SELECT pr.username  FROM public.profiles pr WHERE pr.id = q.author_id),
    q.created_at
  FROM public.moderation_queue q
  WHERE q.status = 'open'
  ORDER BY q.created_at DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    r.id::uuid,
    'user_report'::text,
    r.content_type,
    r.content_id,
    r.reason,
    NULL::jsonb,
    COALESCE(
      CASE r.content_type
        WHEN 'post'    THEN (SELECT p.body FROM public.posts        p WHERE p.id = r.content_id)
        WHEN 'comment' THEN (SELECT c.body FROM public.post_comments c WHERE c.id = r.content_id)
      END, '')::text,
    r.status,
    r.reported_by,
    (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = r.reported_by),
    (SELECT pr.username  FROM public.profiles pr WHERE pr.id = r.reported_by),
    r.created_at
  FROM public.content_reports r
  WHERE r.status = 'open'
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_moderation_queue(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_moderation_queue(INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Real-time: keep the queue in the realtime feed is NOT needed
--    (moderator-only page polls on load). No publication change.
-- ─────────────────────────────────────────────────────────────
