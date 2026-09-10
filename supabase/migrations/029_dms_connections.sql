-- ============================================================
-- CampusConnect — 029 DMS & CONNECTIONS
-- Make "Connect" actually complete (accept/decline) and enable
-- private messaging — but ONLY between accepted connections.
--   1. respond_to_connection   — receiver accepts/declines a request
--   2. start_or_get_conversation — find/create a 1:1 chat; refuses
--      unless the two users have an accepted connection
--   3. mark_conversation_read  — participant last_read_at (unread)
--   4. messages INSERT policy  — sender must be a participant AND the
--      peer in that conversation must be an accepted connection
--   5. realtime on messages    — live chat updates
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Receiver accepts or declines a pending connection request.
--    Accept → status accepted + notify the requester.
--    Decline → remove the request (they can re-request later).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_connection(p_connection_id UUID, p_accept BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_requester UUID;
BEGIN
  IF auth.uid() IS NULL OR p_connection_id IS NULL THEN RETURN FALSE; END IF;

  SELECT requester_id INTO v_requester
  FROM public.connections
  WHERE id = p_connection_id AND receiver_id = auth.uid() AND status = 'pending';
  IF v_requester IS NULL THEN RETURN FALSE; END IF;

  IF p_accept THEN
    UPDATE public.connections SET status = 'accepted', updated_at = now()
    WHERE id = p_connection_id AND status = 'pending';
    IF NOT FOUND THEN RETURN FALSE; END IF;

    INSERT INTO public.notifications (recipient_id, actor_id, type, ref_type, ref_id, title, body)
    VALUES (v_requester, auth.uid(), 'connection_accepted', 'connection', p_connection_id,
            'Connection accepted',
            'Your connection request was accepted — you can now message each other');
  ELSE
    DELETE FROM public.connections WHERE id = p_connection_id AND status = 'pending';
  END IF;

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.respond_to_connection(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.respond_to_connection(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 2. Find or create a 1:1 conversation — ONLY between users with
--    an accepted connection (either direction). Returns NULL when
--    not connected. SECURITY DEFINER so the client never inserts
--    into conversations/participants directly (no INSERT policies).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_or_get_conversation(p_peer_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
        v_conv UUID;
BEGIN
  IF v_me IS NULL OR p_peer_id IS NULL OR p_peer_id = v_me THEN RETURN NULL; END IF;

  -- Hard gate: only accepted connections may chat
  IF NOT EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.status = 'accepted'
      AND ((c.requester_id = v_me AND c.receiver_id = p_peer_id)
        OR (c.requester_id = p_peer_id AND c.receiver_id = v_me))
  ) THEN RETURN NULL; END IF;

  -- Existing conversation between exactly these two?
  SELECT c.id INTO v_conv
  FROM public.conversations c
  JOIN public.conversation_participants a ON a.conversation_id = c.id AND a.profile_id = v_me
  JOIN public.conversation_participants b ON b.conversation_id = c.id AND b.profile_id = p_peer_id
  LIMIT 1;
  IF v_conv IS NOT NULL THEN RETURN v_conv; END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv;
  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv, v_me), (v_conv, p_peer_id);

  RETURN v_conv;
END $$;
REVOKE EXECUTE ON FUNCTION public.start_or_get_conversation(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_or_get_conversation(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. Mark a conversation read for the calling participant.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_conversation_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.conversation_participants
  SET last_read_at = now()
  WHERE conversation_id = p_conversation_id AND profile_id = auth.uid();
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. messages INSERT — sender must be a participant AND the other
--    participant in that conversation must be an accepted
--    connection. This keeps DMs connected-only even if a rogue
--    row is ever inserted into participants.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.profile_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants me
      JOIN public.conversation_participants peer
        ON peer.conversation_id = me.conversation_id AND peer.profile_id <> me.profile_id
      JOIN public.connections c ON
        ((c.requester_id = me.profile_id AND c.receiver_id = peer.profile_id)
         OR (c.requester_id = peer.profile_id AND c.receiver_id = me.profile_id))
        AND c.status = 'accepted'
      WHERE me.conversation_id = messages.conversation_id AND me.profile_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 5. Realtime: live new-message inserts on the messages table.
-- ------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Prevent duplicate same-direction connection requests
CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_pair ON public.connections (requester_id, receiver_id);
