-- ============================================================
-- CampusConnect P0-5 — Repair notification triggers (migration 007)
-- Legacy triggers referenced dropped columns (NEW.user_id, NEW.requested_id)
-- so EVERY like and EVERY connection request failed with 42703.
-- Rewritten against the current schema; SECURITY DEFINER so the
-- notification insert works under the new notifications RLS (005).
-- Idempotent. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
  IF v_author IS NOT NULL AND v_author <> NEW.profile_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
    VALUES (v_author, NEW.profile_id, 'post_reaction', 'post', NEW.post_id,
            'New like', 'Someone liked your post');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
  IF v_author IS NOT NULL AND v_author <> NEW.author_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
    VALUES (v_author, NEW.author_id, 'post_comment', 'post', NEW.post_id,
            'New comment', left(NEW.body, 200));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_connection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.receiver_id <> NEW.requester_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
    VALUES (NEW.receiver_id, NEW.requester_id, 'connection_request', 'connection', NEW.id,
            'New connection request', 'Someone wants to connect with you');
  END IF;
  RETURN NEW;
END;
$$;

-- Drop any existing trigger bound to these functions (legacy bindings vary),
-- then recreate deterministically.
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT t.tgname, t.tgrelid::regclass AS tbl
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname IN ('notify_on_like','notify_on_comment','notify_on_connection')
      AND NOT t.tgisinternal
  ) LOOP
    EXECUTE format('DROP TRIGGER %I ON %s', r.tgname, r.tbl);
  END LOOP;
END $$;

CREATE TRIGGER on_post_like AFTER INSERT ON public.post_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

CREATE TRIGGER on_post_comment AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE TRIGGER on_connection_request AFTER INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_connection();

-- ------------------------------------------------------------
-- Verify: like/comment/connection inserts must now succeed and the
-- notification row must be visible inside the transaction.
--   BEGIN;
--   INSERT INTO post_reactions (post_id, profile_id, reaction)
--     SELECT p.id, pr.id, 'like' FROM posts p
--     CROSS JOIN LATERAL (SELECT id FROM profiles WHERE id <> p.author_id LIMIT 1) pr LIMIT 1;
--   SELECT count(*) FROM notifications WHERE type = 'post_reaction';
--   ROLLBACK;
-- ------------------------------------------------------------
SELECT t.tgname, t.tgrelid::regclass AS tbl, p.proname AS fn, p.prosecdef AS security_definer
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE p.proname IN ('notify_on_like','notify_on_comment','notify_on_connection')
  AND NOT t.tgisinternal
ORDER BY 2;
