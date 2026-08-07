-- ============================================================
-- CampusConnect — Recreate `meetings` table
-- The V3 migration (001_v3_core_schema.sql) dropped meetings
-- ("Faculty feature removed"), which broke the /meetings page.
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Recreate the table (matches what the /meetings page inserts)
CREATE TABLE IF NOT EXISTS public.meetings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id       UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,                -- JSON-encoded meeting metadata (see meetings page)
  meeting_date    DATE NOT NULL,
  meeting_time    TEXT,
  location        TEXT,
  meeting_link    TEXT,
  tagged_students uuid[] DEFAULT NULL, -- profile UUIDs tagged by the organizer
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_campus  ON public.meetings (campus_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date    ON public.meetings (meeting_date DESC);

-- 2. RLS — same pattern as team_requests / travel_buddies / lost_found
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meetings_select ON public.meetings;
CREATE POLICY meetings_select ON public.meetings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only users with an admin grant can schedule meetings
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
CREATE POLICY meetings_insert ON public.meetings
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.admin_grants g WHERE g.user_id = auth.uid())
  );

DROP POLICY IF EXISTS meetings_update ON public.meetings;
CREATE POLICY meetings_update ON public.meetings
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

DROP POLICY IF EXISTS meetings_delete ON public.meetings;
CREATE POLICY meetings_delete ON public.meetings
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.has_mod_permission(auth.uid(), 'content.moderation')
  );

-- 3. Grant standard privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
