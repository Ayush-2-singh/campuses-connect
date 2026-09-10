-- ============================================================
-- CampusConnect — 030 CHAT RLS FIX
-- The 029 messages_insert policy joined conversation_participants
-- from within the policy, but the participants SELECT policy only
-- exposed your OWN row — so the peer row was invisible inside the
-- policy check and every message insert failed with 403.
--   1. can_message_in_conversation() — SECURITY DEFINER helper that
--      checks both participants + an accepted connection (bypasses
--      RLS so it sees the peer row).
--   2. messages_insert policy uses that helper.
--   3. participants_select — participants may see all members of
--      conversations they belong to (needed by the chat UI to show
--      the peer name/avatar).
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Connected-check helper (bypasses RLS deliberately)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_message_in_conversation(p_conversation_id UUID, p_sender_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants me
    JOIN public.conversation_participants peer
      ON peer.conversation_id = me.conversation_id AND peer.profile_id <> me.profile_id
    JOIN public.connections c ON
      ((c.requester_id = me.profile_id AND c.receiver_id = peer.profile_id)
       OR (c.requester_id = peer.profile_id AND c.receiver_id = me.profile_id))
      AND c.status = 'accepted'
    WHERE me.conversation_id = p_conversation_id AND me.profile_id = p_sender_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_message_in_conversation(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_message_in_conversation(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 2. messages INSERT — sender + connected-participant helper
-- ------------------------------------------------------------
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND public.can_message_in_conversation(messages.conversation_id, sender_id)
  );

-- ------------------------------------------------------------
-- 3. participants — see every member of conversations you belong to
-- ------------------------------------------------------------
DROP POLICY IF EXISTS participants_select ON public.conversation_participants;
CREATE POLICY participants_select ON public.conversation_participants
  FOR SELECT TO authenticated USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants me
      WHERE me.conversation_id = conversation_participants.conversation_id
        AND me.profile_id = auth.uid()
    )
  );
