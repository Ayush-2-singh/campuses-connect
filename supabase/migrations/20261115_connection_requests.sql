-- ============================================================
-- 20261115 — CONNECTION REQUESTS, MADE RELIABLE
--
-- Why this migration exists
-- -------------------------
-- Sending a connection request failed with a generic client error. The legacy
-- notification trigger is the known culprit (migration 007 documents the old
-- `NEW.user_id` body failing every insert with 42703). Re-asserting the fixed
-- trigger here repairs databases that skipped 007.
--
-- It also adds `send_connection_request(uuid)`, the one call the client makes:
--   * refuses a campus-only profile on another campus with a REASON instead of
--     an opaque RLS error;
--   * reuses an existing pending/accepted row instead of raising 23505;
--   * auto-accepts a reverse request (both students asked for the same thing),
--     so the pair connects instead of leaving two pending rows stuck.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. Re-assert the fixed notification trigger ────────────────────────────
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

DROP TRIGGER IF EXISTS on_connection_request ON public.connections;
CREATE TRIGGER on_connection_request AFTER INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_connection();

-- ── 2. One idempotent request call ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_connection_request(p_receiver_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_existing public.connections%ROWTYPE;
BEGIN
  IF v_me IS NULL OR p_receiver_id IS NULL OR p_receiver_id = v_me THEN
    RETURN 'invalid';
  END IF;

  -- Same gate the INSERT policy applies; returning a reason beats a 42501.
  IF NOT public.can_interact_with_profile(p_receiver_id) THEN
    RETURN 'campus_only';
  END IF;

  -- Prefer an accepted row, then the incoming request, so a pair that both
  -- sides already asked about resolves by accepting instead of duplicating.
  SELECT * INTO v_existing
  FROM public.connections
  WHERE (requester_id = v_me AND receiver_id = p_receiver_id)
     OR (requester_id = p_receiver_id AND receiver_id = v_me)
  ORDER BY (status = 'accepted') DESC, (receiver_id = v_me) DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.status = 'accepted' THEN
      RETURN 'accepted';
    END IF;
    IF v_existing.status = 'blocked' THEN
      RETURN 'blocked';
    END IF;

    -- I already asked: nothing to do. They asked me: accept it now.
    IF v_existing.requester_id = v_me THEN
      RETURN 'pending';
    END IF;
    PERFORM public.respond_to_connection(v_existing.id, true);
    RETURN 'accepted';
  END IF;

  INSERT INTO public.connections (requester_id, receiver_id, status)
  VALUES (v_me, p_receiver_id, 'pending');
  RETURN 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_connection_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_connection_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_connection_request(uuid) TO authenticated;

-- Verification (should return the function + trigger):
--   SELECT proname, proacl FROM pg_proc WHERE proname = 'send_connection_request';
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.connections'::regclass;
