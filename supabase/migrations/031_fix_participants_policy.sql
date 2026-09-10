-- ============================================================
-- CampusConnect — 031 PARTICIPANTS POLICY FIX
-- The 030 participants_select policy self-referenced
-- conversation_participants inside its own USING clause, which
-- recursed forever (42P17). Replaced with a SECURITY DEFINER
-- helper so the "am I a participant?" check bypasses RLS.
-- Idempotent. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id AND cp.profile_id = p_profile_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS participants_select ON public.conversation_participants;
CREATE POLICY participants_select ON public.conversation_participants
  FOR SELECT TO authenticated USING (
    profile_id = auth.uid()
    OR public.is_conversation_participant(conversation_participants.conversation_id, auth.uid())
  );
