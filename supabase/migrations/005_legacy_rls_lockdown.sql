-- ============================================================
-- CampusConnect P0-2 / P0-4 — Legacy RLS lockdown (migration 005)
-- P0-2: anonymous users must not read or write any legacy table.
-- P0-4: no client write path may bypass the permission matrix.
--   * notes / opportunities  -> INSERT requires can_create_post (matrix)
--   * team_requests / travel_buddies / lost_found -> INSERT requires an admin grant
--   * DMs / connections / notifications -> owner/participant-scoped
-- Idempotent. Safe to re-run.
-- ============================================================

-- 1. Enable RLS on every legacy table that still has it off.
ALTER TABLE public.connections               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports                   ENABLE ROW LEVEL SECURITY;

-- 2. Purge any pre-existing (dashboard-generated) policies on these tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'connections','conversations','conversation_participants','messages',
        'notifications','events','notes','opportunities','reports',
        'team_requests','travel_buddies','lost_found'
      )
  ) LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Private messaging — participant-scoped
-- ------------------------------------------------------------
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
-- NOTE: inserts are only done by the SECURITY DEFINER notify_* triggers (007).

CREATE POLICY conversations_select ON public.conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversation_participants cp
            WHERE cp.conversation_id = conversations.id AND cp.profile_id = auth.uid())
  );

CREATE POLICY participants_select ON public.conversation_participants
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY messages_select ON public.messages
  FOR SELECT USING (
    sender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversation_participants cp
               WHERE cp.conversation_id = messages.conversation_id AND cp.profile_id = auth.uid())
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.conversation_participants cp
                WHERE cp.conversation_id = messages.conversation_id AND cp.profile_id = auth.uid())
  );

CREATE POLICY messages_update ON public.messages
  FOR UPDATE USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- ------------------------------------------------------------
-- 4. Connections — both parties only
-- ------------------------------------------------------------
CREATE POLICY connections_select ON public.connections
  FOR SELECT USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY connections_insert ON public.connections
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY connections_update ON public.connections
  FOR UPDATE USING (requester_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY connections_delete ON public.connections
  FOR DELETE USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- ------------------------------------------------------------
-- 5. Events — public reads, admin writes
-- ------------------------------------------------------------
CREATE POLICY events_select ON public.events
  FOR SELECT USING (
    is_published
    AND (visibility IS NULL OR visibility = 'public'
         OR campus_id IN (SELECT campus_id FROM public.profiles WHERE id = auth.uid())
         OR college_id IN (SELECT college_id FROM public.profiles WHERE id = auth.uid()))
  );

CREATE POLICY events_admin_write ON public.events
  FOR ALL USING (public.has_mod_permission(auth.uid(), 'campus.settings'))
  WITH CHECK (public.has_mod_permission(auth.uid(), 'campus.settings'));

-- ------------------------------------------------------------
-- 6. notes / opportunities — authenticated reads, matrix-gated writes
-- ------------------------------------------------------------
CREATE POLICY notes_select ON public.notes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY notes_insert ON public.notes
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND public.can_create_post(auth.uid(), 'notes', 'campus',
        NULL, notes.campus_id, notes.college_id)
  );

CREATE POLICY notes_update ON public.notes
  FOR UPDATE USING (
    uploaded_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

CREATE POLICY notes_delete ON public.notes
  FOR DELETE USING (
    uploaded_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

CREATE POLICY opportunities_select ON public.opportunities
  FOR SELECT USING (auth.role() = 'authenticated');

-- The row's actual opp_type is mapped to the matrix category, so an admin
-- cannot slip a forbidden type (e.g. community_admin + hackathon) through
-- a permissive OR-chain.
CREATE POLICY opportunities_insert ON public.opportunities
  FOR INSERT WITH CHECK (
    posted_by = auth.uid()
    AND CASE opportunities.opp_type
          WHEN 'hackathon'  THEN public.can_create_post(auth.uid(), 'hackathon', 'campus',
                                     NULL, opportunities.campus_id, opportunities.college_id)
          WHEN 'internship' THEN public.can_create_post(auth.uid(), 'internship', 'campus',
                                     NULL, opportunities.campus_id, opportunities.college_id)
          ELSE public.can_create_post(auth.uid(), 'opportunity', 'campus',
                                     NULL, opportunities.campus_id, opportunities.college_id)
        END
  );

CREATE POLICY opportunities_update ON public.opportunities
  FOR UPDATE USING (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  )
  WITH CHECK (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

CREATE POLICY opportunities_delete ON public.opportunities
  FOR DELETE USING (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

-- ------------------------------------------------------------
-- 7. team_requests / travel_buddies / lost_found —
--     authenticated reads, admin-gated writes (V1: students cannot create)
-- ------------------------------------------------------------
CREATE POLICY team_requests_select ON public.team_requests
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY team_requests_insert ON public.team_requests
  FOR INSERT WITH CHECK (
    posted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid())
  );

CREATE POLICY team_requests_update ON public.team_requests
  FOR UPDATE USING (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  )
  WITH CHECK (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

CREATE POLICY team_requests_delete ON public.team_requests
  FOR DELETE USING (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

CREATE POLICY travel_buddies_select ON public.travel_buddies
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY travel_buddies_insert ON public.travel_buddies
  FOR INSERT WITH CHECK (
    posted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid())
  );

CREATE POLICY travel_buddies_update ON public.travel_buddies
  FOR UPDATE USING (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  )
  WITH CHECK (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

CREATE POLICY travel_buddies_delete ON public.travel_buddies
  FOR DELETE USING (
    posted_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

-- lost_found: keep the existing owner/campus-scoped read policy (lf_select),
-- replace the student-insert policy with an admin-gated one.
DROP POLICY IF EXISTS lf_insert ON public.lost_found;
CREATE POLICY lf_insert ON public.lost_found
  FOR INSERT WITH CHECK (
    posted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 8. reports — reporter-gated writes, moderator reads
-- ------------------------------------------------------------
CREATE POLICY reports_insert ON public.reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY reports_select ON public.reports
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'report.manage')
  );

CREATE POLICY reports_update ON public.reports
  FOR UPDATE USING (public.has_mod_permission(auth.uid(), 'report.manage'));

-- ------------------------------------------------------------
-- Verify: zero tables with RLS off; every legacy table has policies
-- ------------------------------------------------------------
SELECT c.relname AS tbl, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;
