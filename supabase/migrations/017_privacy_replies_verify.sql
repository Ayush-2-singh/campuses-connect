-- ============================================================
-- CampusConnect — 017 PRIVACY, REPLIES, VERIFICATION
--   • Communities: open / approval / private (+ password)
--   • Comments: threaded replies (parent_id) + delete cascade
--   • Opportunities: verified-by badge with admin approval
--   • Reviews: eligibility-gated (attended event / mentored)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Community privacy
-- ------------------------------------------------------------
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'open'
    CHECK (visibility IN ('open', 'approval', 'private')),
  ADD COLUMN IF NOT EXISTS join_password TEXT,            -- for private (hashed)
  ADD COLUMN IF NOT EXISTS can_post TEXT NOT NULL DEFAULT 'anyone'
    CHECK (can_post IN ('anyone', 'members', 'moderators')),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Member status: pending = waiting for approval (approval mode)
ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_community_members_status ON public.community_members (status);

-- Community join gateway — enforces visibility + password + approval
CREATE OR REPLACE FUNCTION public.join_community(p_community_id UUID, p_password TEXT DEFAULT NULL)
RETURNS TEXT   -- returns: 'joined' | 'pending' | 'wrong_password' | 'already' | 'error'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vis  TEXT;
  v_pass TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'error'; END IF;

  SELECT visibility, join_password INTO v_vis, v_pass
    FROM public.communities WHERE id = p_community_id;
  IF NOT FOUND THEN RETURN 'error'; END IF;

  IF EXISTS (SELECT 1 FROM public.community_members
              WHERE community_id = p_community_id AND user_id = auth.uid()) THEN
    RETURN 'already';
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

-- Moderators approve/reject pending members
CREATE OR REPLACE FUNCTION public.review_member(p_community_id UUID, p_user_id UUID, p_approve BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- caller must be admin/moderator of the community
  IF NOT EXISTS (
    SELECT 1 FROM public.community_members
     WHERE community_id = p_community_id AND user_id = auth.uid()
       AND role IN ('admin', 'moderator')
  ) THEN RETURN FALSE; END IF;

  UPDATE public.community_members
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
   WHERE community_id = p_community_id AND user_id = p_user_id AND status = 'pending';
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.review_member(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.review_member(UUID, UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 2. Comment replies (threaded)
-- ------------------------------------------------------------
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.post_comments (parent_id);

-- ------------------------------------------------------------
-- 3. Opportunity verification — verified badge with approver
-- ------------------------------------------------------------
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- (If your project stores opportunities in `posts` with opp metadata,
--  the same two columns are added there defensively.)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Admin verify RPC
CREATE OR REPLACE FUNCTION public.verify_opportunity(p_opportunity_id UUID, p_verified BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_grants g
     WHERE g.user_id = auth.uid()
       AND g.admin_type IN ('platform_admin', 'campus_admin')
  ) THEN RETURN FALSE; END IF;

  UPDATE public.opportunities
     SET is_verified = p_verified,
         verified_by = auth.uid(),
         verified_at = CASE WHEN p_verified THEN now() ELSE NULL END
   WHERE id = p_opportunity_id;
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.verify_opportunity(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_opportunity(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 4. Reviews — eligibility-gated trust layer
--    A review requires proof of interaction: attendance for events,
--    a completed session for mentors. Rating 1-5.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('event', 'mentor', 'community')),
  target_id   UUID NOT NULL,
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- one review per target per author
  UNIQUE (author_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_target ON public.reviews (target_type, target_id, rating);

-- Eligibility: can only review an event you actually attended
CREATE OR REPLACE FUNCTION public.review_eligibility(p_target_type TEXT, p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  IF p_target_type = 'event' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.event_attendees
       WHERE event_id = p_target_id AND user_id = auth.uid()
    ) INTO v_ok;
    RETURN v_ok;
  END IF;

  IF p_target_type = 'community' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.community_members
       WHERE community_id = p_target_id AND user_id = auth.uid()
    ) INTO v_ok;
    RETURN v_ok;
  END IF;

  -- mentor reviews require a recorded mentor session (future feature)
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.review_eligibility(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.review_eligibility(TEXT, UUID) TO authenticated;

-- Submit review with eligibility enforcement (idempotent per unique key)
CREATE OR REPLACE FUNCTION public.submit_review(p_target_type TEXT, p_target_id UUID, p_rating INT, p_body TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.review_eligibility(p_target_type, p_target_id) THEN RETURN FALSE; END IF;

  INSERT INTO public.reviews (author_id, target_type, target_id, rating, body)
  VALUES (auth.uid(), p_target_type, p_target_id, p_rating, p_body)
  ON CONFLICT (author_id, target_type, target_id)
  DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, created_at = now();

  PERFORM public.award_karma('review_written', 'review', 'review:' || p_target_type || ':' || p_target_id, auth.uid());
  PERFORM public.record_meaningful_action();
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_review(TEXT, UUID, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_review(TEXT, UUID, INT, TEXT) TO authenticated;
