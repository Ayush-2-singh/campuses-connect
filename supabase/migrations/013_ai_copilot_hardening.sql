-- ============================================================
-- CampusConnect — AI Admin Copilot hardening (migration 013)
-- Fixes found in code review:
--  1. notify_user was callable by any client (PostgREST) via the
--     default PUBLIC execute grant → could forge notifications.
--     Now revoked from PUBLIC and NOT granted to authenticated —
--     it is only used internally by SECURITY DEFINER functions.
--  2. flag_content let non-moderators queue-flag ARBITRARY content
--     (false-flag spam) because ownership was never verified.
--     Now verifies the content belongs to the caller unless the
--     caller has content.moderation.
-- Idempotent — safe to re-run.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. notify_user: internal-only (fix PUBLIC exposure)
-- ─────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.notify_user(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
-- (deliberately NOT granted to authenticated — only callable by
--  other SECURITY DEFINER functions running as the table owner)

-- ─────────────────────────────────────────────────────────────
-- 2. flag_content: verify content ownership for non-moderators
-- ─────────────────────────────────────────────────────────────
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
  v_owns   BOOLEAN;
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  -- moderators may flag anything; everyone else may only flag their OWN content
  IF public.has_mod_permission(auth.uid(), 'content.moderation') THEN
    v_owns := TRUE;
  ELSE
    v_owns := EXISTS (
      SELECT 1 FROM public.posts         x WHERE x.id = p_content_id AND x.author_id = v_author AND p_content_type IN ('post','opportunity')
    ) OR EXISTS (
      SELECT 1 FROM public.post_comments x WHERE x.id = p_content_id AND x.author_id = v_author AND p_content_type = 'comment'
    ) OR EXISTS (
      SELECT 1 FROM public.questions     x WHERE x.id = p_content_id AND x.asked_by   = v_author AND p_content_type = 'question'
    ) OR EXISTS (
      SELECT 1 FROM public.answers       x WHERE x.id = p_content_id AND x.answered_by = v_author AND p_content_type = 'answer'
    ) OR EXISTS (
      SELECT 1 FROM public.notes         x WHERE x.id = p_content_id AND x.uploaded_by = v_author AND p_content_type = 'note'
    );
    IF NOT v_owns THEN RETURN NULL; END IF;
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
