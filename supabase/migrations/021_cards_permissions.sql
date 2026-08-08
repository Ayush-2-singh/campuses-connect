-- ─────────────────────────────────────────────────────────────────────────────
-- 021 — Card actions parity
-- Hosts can now delete their own events (update was already allowed).
-- Posts / notes / comments already have author update+delete policies.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS campus_events_delete_own ON public.campus_events;
CREATE POLICY campus_events_delete_own ON public.campus_events
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Moderators can delete any event
DROP POLICY IF EXISTS campus_events_delete_mod ON public.campus_events;
CREATE POLICY campus_events_delete_mod ON public.campus_events
  FOR DELETE TO authenticated
  USING (public.has_mod_permission(auth.uid(), 'content.moderation'));
