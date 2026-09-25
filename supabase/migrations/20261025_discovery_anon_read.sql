-- 20261025_discovery_anon_read.sql
--
-- PUBLIC-FIRST DISCOVERY READ (final-audit spec).
--
-- Browsing Discovery must work logged-out. The queue RPC previously raised
-- for anonymous callers (and was granted to `authenticated` only). Reading
-- idea summaries is public content (RLS on discovery_posts already allows a
-- public SELECT), so:
--   * discovery_feed now serves anonymous callers — when auth.uid() is NULL
--     the per-user queue filtering simply doesn't apply.
--   * discovery_posts SELECT stays public (already true via RLS policy).
--
-- NOTHING changes for writes: record_discovery_action and
-- accept_discovery_interest still require auth.uid() (they raise otherwise),
-- and the interests table still has no client write policies.
--
-- ADDITIVE ONLY. Idempotent. Safe to re-run.

-- ----------------------------------------------------------------------------
-- 1. discovery_feed — allow anonymous reads (STABLE, SECURITY DEFINER kept:
--    the embedded profile read goes through RLS which is unchanged).
-- ----------------------------------------------------------------------------
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
  v_me    UUID := auth.uid();  -- NULL for anonymous: public browse mode
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
BEGIN
  -- Freshness-ordered queue; tag/skill relevance can layer on later without
  -- changing this contract. Already-acted cards never return for a signed-in
  -- user (STEP 9); anonymous callers get the public queue.
  RETURN QUERY
  SELECT
    p.id, p.title, p.short_desc, p.category, p.stage, p.tags, p.looking_for,
    p.interested_count, p.created_at,
    pr.id, pr.full_name, pr.username, pr.avatar_url,
    NULL::TEXT
  FROM public.discovery_posts p
  JOIN public.profiles pr ON pr.id = p.author_id
  WHERE p.is_active
    AND (v_me IS NULL OR p.author_id <> v_me)
    AND (p_category IS NULL OR p.category = p_category)
    AND (
      v_me IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.discovery_interests di
        WHERE di.post_id = p.id AND di.user_id = v_me
      )
    )
    AND (
      p_cursor_created IS NULL OR p_cursor_id IS NULL
      OR (p.created_at, p.id) < (p_cursor_created, p_cursor_id)
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT v_limit;
END;
$fn$;

-- Grants: authenticated (existing) + anon (new: public browse).
REVOKE ALL ON FUNCTION public.discovery_feed(TIMESTAMPTZ, UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_feed(TIMESTAMPTZ, UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discovery_feed(TIMESTAMPTZ, UUID, TEXT, INT) TO anon;

-- ----------------------------------------------------------------------------
-- 2. Re-assert the interaction guards stay auth-only (defense in depth).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_discovery_action(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discovery_action(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_discovery_interest(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_discovery_interest(UUID, UUID) TO authenticated;
