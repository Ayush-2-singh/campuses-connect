-- 20261024_discovery_collab.sql
--
-- DISCOVERY — ideas, projects and builder matching (swipe-based collab).
--
-- Discovery becomes the app's idea + builder discovery layer. The legacy
-- `opportunities` table keeps its data (backed up into discovery as seed rows);
-- its UI is retired in favour of /discover.
--
-- Loop: create idea → others swipe right (interested) → author accepts →
-- MATCH → an accepted `connections` row + existing 1:1 conversation. No second
-- chat system: matching reuses 025/029 (connections + start_or_get_conversation).
--
-- SECURITY MODEL
--   * `discovery_posts`  — public read, owner-only write via RLS.
--   * `discovery_interests` — owner-scoped RLS; ALL writes go through
--     `record_discovery_action` which derives the user from auth.uid().
--     Match creation is server-authorized: only the post AUTHOR can accept.
--   * Notifications reuse the existing notifications table via a DO-block
--     constraint extension (two new enum-ish values).
--
-- ADDITIVE ONLY. Idempotent. Safe to re-run.

-- ============================================================================
-- 1. Discovery posts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.discovery_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 120),
  short_desc     TEXT NOT NULL CHECK (length(btrim(short_desc)) BETWEEN 1 AND 280),
  content        TEXT,
  category       TEXT NOT NULL DEFAULT 'startup'
                   CHECK (category IN ('startup', 'project', 'hackathon', 'collab')),
  stage          TEXT NOT NULL DEFAULT 'idea'
                   CHECK (stage IN ('idea', 'prototype', 'mvp', 'building', 'launched')),
  tags           TEXT[] NOT NULL DEFAULT '{}',
  looking_for    TEXT[] NOT NULL DEFAULT '{}',
  -- Optional coarse location context; denormalized from the author profile at
  -- write time. Never used to restrict who can see a post.
  college_id     UUID REFERENCES public.colleges(id) ON DELETE SET NULL,
  campus_id      UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  interested_count INT NOT NULL DEFAULT 0 CHECK (interested_count >= 0),
  view_count     INT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_posts_feed
  ON public.discovery_posts (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_posts_author
  ON public.discovery_posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_posts_category
  ON public.discovery_posts (is_active, category, created_at DESC);

-- ============================================================================
-- 2. Interests — one action per (post, user); idempotent by PK
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.discovery_interests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.discovery_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'interested' = right swipe; 'passed' = left swipe (hidden from the queue
  -- but kept so we never re-show a card the user already judged).
  action      TEXT NOT NULL CHECK (action IN ('interested', 'passed')),
  -- Server-side state for the two-sided flow: author accepted the interest?
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_interests_user
  ON public.discovery_interests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_interests_post
  ON public.discovery_interests (post_id);

-- ============================================================================
-- 3. RLS
-- ============================================================================
ALTER TABLE public.discovery_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_posts_select ON public.discovery_posts;
CREATE POLICY discovery_posts_select ON public.discovery_posts
  FOR SELECT USING (TRUE);

-- Anyone signed in can publish; authors manage their own rows.
DROP POLICY IF EXISTS discovery_posts_insert ON public.discovery_posts;
CREATE POLICY discovery_posts_insert ON public.discovery_posts
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS discovery_posts_update ON public.discovery_posts;
CREATE POLICY discovery_posts_update ON public.discovery_posts
  FOR UPDATE TO authenticated USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS discovery_posts_delete ON public.discovery_posts;
CREATE POLICY discovery_posts_delete ON public.discovery_posts
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- Interests: a user sees only rows they own (their queue filters) or rows on
-- posts they authored (their incoming interests). Writes are RPC-only — no
-- INSERT/UPDATE/DELETE policies exist, so a forged client insert fails RLS.
DROP POLICY IF EXISTS discovery_interests_select ON public.discovery_interests;
CREATE POLICY discovery_interests_select ON public.discovery_interests
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.discovery_posts p
      WHERE p.id = post_id AND p.author_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Constraint extension: notifications.type (DO block = stateless)
-- ============================================================================
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND ARRAY(
      SELECT a.attname::text
      FROM unnest(conkey) k
      JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
    ) = ARRAY['type']::text[]
  LIMIT 1;

  IF v_conname IS NULL THEN
    RAISE NOTICE 'no check constraint on notifications.type found; skipping';
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.notifications DROP CONSTRAINT %I', v_conname
  );
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT %I
     CHECK (type IN (
       ''connection_request'', ''connection_accepted'', ''post_reaction'',
       ''post_comment'', ''comment_reply'', ''new_opportunity'', ''new_event'',
       ''new_note'', ''mention'', ''message'', ''system'', ''announcement'',
       ''assignment'',
       ''discovery_interest'', ''discovery_match''
     ))',
    v_conname
  );
END $$;

-- ============================================================================
-- 5. record_discovery_action — pass/interested, idempotent, match-aware
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_discovery_action(
  p_post_id UUID,
  p_action  TEXT
)
RETURNS TABLE (matched BOOLEAN, connection_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user  UUID := auth.uid();
  v_action TEXT := btrim(COALESCE(p_action, ''));
  v_post  RECORD;
  v_connection UUID;
  v_row   RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_action NOT IN ('interested', 'passed') THEN
    RAISE EXCEPTION 'action must be interested or passed';
  END IF;
  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id required';
  END IF;

  SELECT * INTO v_post FROM public.discovery_posts
   WHERE id = p_post_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_post.author_id = v_user THEN
    RAISE EXCEPTION 'cannot act on your own post';
  END IF;

  -- Idempotent: one logical action per (post, user). A pass followed by an
  -- interested swipe (they came back) upgrades the row.
  INSERT INTO public.discovery_interests (post_id, user_id, action)
  VALUES (p_post_id, v_user, v_action)
  ON CONFLICT (post_id, user_id) DO UPDATE
    SET action = EXCLUDED.action,
        updated_at = now()
    WHERE discovery_interests.action <> EXCLUDED.action;

  -- Re-read the row so `status` reflects reality (already accepted, etc.).
  SELECT * INTO v_row FROM public.discovery_interests
   WHERE post_id = p_post_id AND user_id = v_user;

  IF v_action = 'interested' THEN
    UPDATE public.discovery_posts
       SET interested_count = (
             SELECT COUNT(*) FROM public.discovery_interests
              WHERE post_id = p_post_id AND action = 'interested'
           )
     WHERE id = p_post_id;

    PERFORM public.create_notification(
      v_post.author_id,
      'discovery_interest',
      'Someone is interested in your idea: ' || v_post.title,
      NULL, 'discovery_post', p_post_id
    );
  END IF;

  RETURN QUERY SELECT FALSE, NULL::UUID, v_row.status;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_discovery_action(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discovery_action(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 6. accept_discovery_interest — author-side accept; creates the MATCH.
--    Match = accepted connection (existing table) so the existing chat RPC
--    (start_or_get_conversation) immediately works for the pair.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_discovery_interest(
  p_post_id UUID,
  p_user_id UUID
)
RETURNS TABLE (matched BOOLEAN, connection_id UUID, conversation_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   UUID := auth.uid();
  v_post RECORD;
  v_conn UUID;
  v_conv UUID;
  v_had_pending BOOLEAN := FALSE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_post FROM public.discovery_posts
   WHERE id = p_post_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_post.author_id <> v_me THEN
    -- Only the author can accept. This is the forged-match guard: interest +
    -- author-acceptance is the ONLY server path to a match.
    RAISE EXCEPTION 'only the author can accept interests';
  END IF;

  UPDATE public.discovery_interests
     SET status = 'accepted', updated_at = now()
   WHERE post_id = p_post_id
     AND user_id = p_user_id
     AND action = 'interested';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no pending interest from that user on this post';
  END IF;

  -- MATCH: ensure an accepted connection row (either direction is fine for
  -- start_or_get_conversation — it checks both directions).
  SELECT id INTO v_conn FROM public.connections
   WHERE status = 'accepted'
     AND ((requester_id = v_me AND receiver_id = p_user_id)
       OR (requester_id = p_user_id AND receiver_id = v_me))
   LIMIT 1;

  IF v_conn IS NULL THEN
    -- If a pending request already exists for this pair we upgrade it instead
    -- of inserting (no trigger fires on the UPDATE path).
    SELECT EXISTS (
      SELECT 1 FROM public.connections
       WHERE requester_id = v_me AND receiver_id = p_user_id AND status = 'pending'
    ) INTO v_had_pending;

    INSERT INTO public.connections (requester_id, receiver_id, status)
    VALUES (v_me, p_user_id, 'accepted')
    ON CONFLICT (requester_id, receiver_id) DO UPDATE
      SET status = 'accepted', updated_at = now()
    RETURNING id INTO v_conn;

    -- Fresh INSERT → the on_connection_request trigger just queued a
    -- "New connection request" notification for an auto-accepted match.
    -- Remove it; the discovery_match notification below tells the story.
    IF NOT v_had_pending THEN
      DELETE FROM public.notifications
       WHERE type = 'connection_request'
         AND ref_type = 'connection'
         AND ref_id = v_conn;
    END IF;
  END IF;

  -- Open (or reuse) the 1:1 conversation via the EXISTING chat RPC.
  v_conv := public.start_or_get_conversation(p_user_id);

  PERFORM public.create_notification(
    p_user_id,
    'discovery_match',
    'It''s a match! ' || v_post.title || ' — chat is open',
    NULL, 'discovery_post', p_post_id
  );

  RETURN QUERY SELECT TRUE, v_conn, v_conv;
END;
$fn$;

REVOKE ALL ON FUNCTION public.accept_discovery_interest(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_discovery_interest(UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. discovery_feed — cursor pagination; summary only (no content col).
--    MVP ranking: freshness first (STEP 13 — deterministic, one index).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.discovery_feed(
  p_cursor_created TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id      UUID DEFAULT NULL,
  p_category       TEXT DEFAULT NULL,
  p_limit          INT DEFAULT 10
)
RETURNS TABLE (
  id               UUID,
  title            TEXT,
  short_desc       TEXT,
  category         TEXT,
  stage            TEXT,
  tags             TEXT[],
  looking_for      TEXT[],
  interested_count INT,
  created_at       TIMESTAMPTZ,
  author_id        UUID,
  author_name      TEXT,
  author_username  TEXT,
  author_avatar    TEXT,
  my_action        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    UUID := auth.uid();
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Freshness-ordered queue; tag/skill relevance can layer on later without
  -- changing this contract. Already-acted cards never return (STEP 9).
  RETURN QUERY
  SELECT
    p.id, p.title, p.short_desc, p.category, p.stage, p.tags, p.looking_for,
    p.interested_count, p.created_at,
    pr.id, pr.full_name, pr.username, pr.avatar_url,
    NULL::TEXT
  FROM public.discovery_posts p
  JOIN public.profiles pr ON pr.id = p.author_id
  WHERE p.is_active
    AND p.author_id <> v_me
    AND (p_category IS NULL OR p.category = p_category)
    AND NOT EXISTS (
      SELECT 1 FROM public.discovery_interests di
      WHERE di.post_id = p.id AND di.user_id = v_me
    )
    AND (
      p_cursor_created IS NULL OR p_cursor_id IS NULL
      OR (p.created_at, p.id) < (p_cursor_created, p_cursor_id)
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.discovery_feed(TIMESTAMPTZ, UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discovery_feed(TIMESTAMPTZ, UUID, TEXT, INT) TO authenticated;

-- ============================================================================
-- 8. Opportunity data migration — preserve records, no destructive change.
--    Rows land as 'collab' posts; original data stays in `opportunities`.
-- ============================================================================
INSERT INTO public.discovery_posts
      (author_id, title, short_desc, content, category, stage, tags,
       looking_for, college_id, campus_id, created_at)
SELECT
  o.posted_by,
  o.title,
  -- short_desc is NOT NULL + btrim>=1; fall back to the title when the
  -- description is missing or whitespace-only so one bad row can't fail the
  -- whole migration.
  LEFT(COALESCE(NULLIF(btrim(COALESCE(o.description, '')), ''), o.title), 280),
  o.description,
  -- Hackathon listings map onto the hackathon tab; everything else lands in
  -- Collab so the startup/project queues stay curated.
  CASE WHEN o.opp_type = 'hackathon' THEN 'hackathon' ELSE 'collab' END,
  'idea',
  COALESCE(o.skills_required, '{}'),
  ARRAY[]::TEXT[],
  o.college_id,
  o.campus_id,
  o.created_at
FROM public.opportunities o
WHERE o.is_active
  AND o.posted_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.discovery_posts dp
    WHERE dp.title = o.title
      AND dp.author_id = o.posted_by
      AND dp.created_at = o.created_at
  )
ON CONFLICT DO NOTHING;
