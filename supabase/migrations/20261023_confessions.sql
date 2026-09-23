-- 20261023_confessions.sql
--
-- CONFESSIONS — anonymous student expression (Phases 23-28).
--
-- Design constraints that shape everything here:
--   * Anonymity is real: a normal user must never see the author's id, name or
--     campus. Row LEVEL security cannot hide a column, so `confessions` is
--     readable ONLY through a view that does not select `author_id`. The base
--     table is revoked from `authenticated`/`anon` entirely. The platform keeps
--     `author_id` privately for moderation and abuse prevention.
--   * NO COMMENTS. There is no comment table, no comment_count, no reply path,
--     and none should ever be added. Interactions are a heart reaction and a
--     report, and nothing else.
--   * Exactly five reports from five UNIQUE users auto-hides a confession. It
--     is hidden, never deleted.
--
-- Moderation reuses the EXISTING `content_reports` / `audit_log` tables from
-- 001 — no second reporting system.
--
-- ADDITIVE ONLY.

-- ============================================================================
-- 1. Confessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.confessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- PRIVATE. Never exposed to other users; used for moderation only.
  author_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body           TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  -- Coarse context, OPTIONAL and never surfaced as an identity. Stored so
  -- moderators can spot brigade patterns; deliberately not in the public view.
  campus_id      UUID,
  status         TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('published', 'hidden', 'removed')),
  reaction_count INT NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
  report_count   INT NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  -- Set when the 5-report threshold trips, and cleared by an admin restore.
  auto_hidden_at TIMESTAMPTZ,
  moderated_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  moderated_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feed read: newest published first.
CREATE INDEX IF NOT EXISTS idx_confessions_feed
  ON public.confessions (status, created_at DESC);
-- Trending read: most-reacted published first.
CREATE INDEX IF NOT EXISTS idx_confessions_trending
  ON public.confessions (status, reaction_count DESC, created_at DESC);
-- A user's own confessions (they may see their own, including hidden ones).
CREATE INDEX IF NOT EXISTS idx_confessions_author
  ON public.confessions (author_id, created_at DESC);

-- ============================================================================
-- 2. Reactions — one per user, toggleable
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.confession_reactions (
  confession_id UUID NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (confession_id, user_id)
);

-- ============================================================================
-- 3. Public view — the ONLY way a normal user reads confessions
-- ============================================================================
-- security_invoker = FALSE means the view runs as its owner and bypasses the
-- base table's RLS, which is exactly why the base table grants nothing to
-- `authenticated`. The view's column list is the wall: no author_id, no
-- campus_id, no moderation fields.
CREATE OR REPLACE VIEW public.confessions_public
WITH (security_invoker = FALSE) AS
  SELECT
    c.id,
    c.body,
    c.reaction_count,
    c.created_at
  FROM public.confessions c
  WHERE c.status = 'published';

REVOKE ALL ON public.confessions_public FROM PUBLIC;
GRANT SELECT ON public.confessions_public TO authenticated, anon;

-- ============================================================================
-- 4. RLS on the base table — locked shut
-- ============================================================================
ALTER TABLE public.confessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confession_reactions ENABLE ROW LEVEL SECURITY;

-- Authors may read their OWN rows (so they can see their hidden post and its
-- state); that single policy is the only read path on the base table, and it
-- returns rows, so a client with the anon key still cannot read it (see grants
-- below). Combined with REVOKE, the table is effectively admin/service only.
DROP POLICY IF EXISTS confessions_select_own ON public.confessions;
CREATE POLICY confessions_select_own ON public.confessions
  FOR SELECT USING (author_id = auth.uid());

-- Deny all direct table access to clients. Every write goes through a
-- SECURITY DEFINER function; every read goes through the view.
REVOKE ALL ON public.confessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.confession_reactions FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS confession_reactions_select_own ON public.confession_reactions;
CREATE POLICY confession_reactions_select_own ON public.confession_reactions
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================================
-- 5. Create a confession (rate-limited, basic deterministic safety)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_confession(p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user   UUID := auth.uid();
  v_body   TEXT := btrim(COALESCE(p_body, ''));
  v_campus UUID;
  v_today  INT;
  v_id     UUID;
  c_daily_cap CONSTANT INT := 5;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF length(v_body) < 1 OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'confession must be between 1 and 2000 characters';
  END IF;

  -- Layer 1: rate limit. Five a day is plenty for a genuine post and useless
  -- for spam.
  SELECT COUNT(*) INTO v_today
    FROM public.confessions
   WHERE author_id = v_user AND created_at >= CURRENT_DATE;
  IF v_today >= c_daily_cap THEN
    RAISE EXCEPTION 'daily confession limit reached';
  END IF;

  -- Layer 2: deterministic checks. These FLAG, they do not auto-delete — a bad
  -- word is not proof of abuse (Phase 28). Anything flagged starts hidden and
  -- waits for a human.
  SELECT campus_id INTO v_campus FROM public.profiles WHERE id = v_user;

  INSERT INTO public.confessions (author_id, body, campus_id, status)
  VALUES (
    v_user,
    v_body,
    v_campus,
    CASE
      -- obvious contact/identity leaks or many links start hidden for review
      WHEN v_body ~* '(\+91[ -]?)?[6-9][0-9]{9}'                    THEN 'hidden'
      WHEN v_body ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'        THEN 'hidden'
      WHEN (length(v_body) - length(replace(v_body, 'http', ''))) / 4 >= 3 THEN 'hidden'
      ELSE 'published'
    END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_confession(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_confession(TEXT) TO authenticated;

-- ============================================================================
-- 6. Reactions — toggle, with the aggregate kept in step
-- ============================================================================
CREATE OR REPLACE FUNCTION public.toggle_confession_reaction(p_confession_id UUID)
RETURNS TABLE (reacted BOOLEAN, reaction_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_reacted BOOLEAN;
  v_count INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Only visible confessions can be reacted to.
  IF NOT EXISTS (
    SELECT 1 FROM public.confessions WHERE id = p_confession_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'confession not available';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.confession_reactions
     WHERE confession_id = p_confession_id AND user_id = v_user
  ) THEN
    DELETE FROM public.confession_reactions
     WHERE confession_id = p_confession_id AND user_id = v_user;
    UPDATE public.confessions
       SET reaction_count = GREATEST(reaction_count - 1, 0)
     WHERE id = p_confession_id
     RETURNING reaction_count INTO v_count;
    v_reacted := FALSE;
  ELSE
    INSERT INTO public.confession_reactions (confession_id, user_id)
    VALUES (p_confession_id, v_user);
    UPDATE public.confessions
       SET reaction_count = reaction_count + 1
     WHERE id = p_confession_id
     RETURNING reaction_count INTO v_count;
    v_reacted := TRUE;
  END IF;

  RETURN QUERY SELECT v_reacted, COALESCE(v_count, 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.toggle_confession_reaction(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_confession_reaction(UUID) TO authenticated;

-- ============================================================================
-- 7. Reports + the five-unique-report auto-hide
-- ============================================================================
-- Reuses `content_reports`. A partial unique index makes "one report per user
-- per confession" a database guarantee, so re-reporting cannot inflate the
-- count.
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_reports_once_per_user
  ON public.content_reports (content_type, content_id, reported_by)
  WHERE content_type IS NOT NULL;

CREATE OR REPLACE FUNCTION public.report_confession(p_confession_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TABLE (report_count INT, hidden BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_unique INT;
  v_hidden BOOLEAN := FALSE;
  c_threshold CONSTANT INT := 5;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.confessions WHERE id = p_confession_id) THEN
    RAISE EXCEPTION 'confession not found';
  END IF;

  -- Idempotent per user: a repeated report is accepted silently, not counted.
  INSERT INTO public.content_reports (content_type, content_id, reported_by, reason)
  VALUES ('confession', p_confession_id, v_user, NULLIF(btrim(COALESCE(p_reason, '')), ''))
  ON CONFLICT DO NOTHING;

  SELECT COUNT(DISTINCT reported_by) INTO v_unique
    FROM public.content_reports
   WHERE content_type = 'confession' AND content_id = p_confession_id;

  UPDATE public.confessions
     SET report_count = v_unique
   WHERE id = p_confession_id;

  IF v_unique >= c_threshold THEN
    UPDATE public.confessions
       SET status = 'hidden', auto_hidden_at = COALESCE(auto_hidden_at, now())
     WHERE id = p_confession_id AND status = 'published';
    v_hidden := TRUE;
  END IF;

  RETURN QUERY SELECT v_unique, v_hidden;
END;
$fn$;

REVOKE ALL ON FUNCTION public.report_confession(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_confession(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 8. Admin moderation (approve / restore / remove) — audited
-- ============================================================================
CREATE OR REPLACE FUNCTION public.moderate_confession(
  p_confession_id UUID,
  p_action        TEXT,          -- 'restore' | 'remove'
  p_note          TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_admin UUID := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_grants
     WHERE user_id = v_admin AND admin_type IN ('platform_admin', 'campus_admin')
  ) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('restore', 'remove') THEN
    RAISE EXCEPTION 'unknown action: %', p_action;
  END IF;

  UPDATE public.confessions
     SET status = CASE WHEN p_action = 'restore' THEN 'published' ELSE 'removed' END,
         auto_hidden_at = CASE WHEN p_action = 'restore' THEN NULL ELSE auto_hidden_at END,
         moderated_by = v_admin,
         moderated_at = now()
   WHERE id = p_confession_id;

  -- Restoring clears the report count so the item is not instantly re-hidden.
  IF p_action = 'restore' THEN
    DELETE FROM public.content_reports
     WHERE content_type = 'confession' AND content_id = p_confession_id;
    UPDATE public.confessions SET report_count = 0 WHERE id = p_confession_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_admin, 'moderate_confession', 'confession', p_confession_id,
          jsonb_build_object('action', p_action, 'note', p_note));

  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.moderate_confession(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_confession(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 9. Verification
-- ============================================================================
-- A. A normal user reading confessions sees no author:
--    SELECT * FROM public.confessions_public LIMIT 5;   -- columns: id, body, reaction_count, created_at
--    SELECT * FROM public.confessions LIMIT 5;          -- should be denied
--
-- B. Five unique reports hide it:
--    -- as user1..user5:
--    SELECT * FROM public.report_confession('<id>', 'spam');
--    SELECT status, report_count FROM public.confessions WHERE id = '<id>';  -- hidden, 5
--
-- C. A duplicate report does not inflate:
--    SELECT * FROM public.report_confession('<id>', 'spam');  -- same user again -> still 5
