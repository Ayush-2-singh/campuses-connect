-- ============================================================
-- FIX: Notes RLS — admin-only upload/update/delete
-- Migration 20260908 weakened notes INSERT to allow any authenticated
-- user. This migration tightens it back: only platform_admin or
-- campus_admin may INSERT/UPDATE/DELETE notes.
-- ============================================================

-- ── 1. DROP permissive INSERT policy (any authenticated user) ──
DROP POLICY IF EXISTS notes_insert ON public.notes;

-- ── 2. CREATE admin-only INSERT policy ─────────────────────────
CREATE POLICY notes_insert ON public.notes
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admin_grants
      WHERE user_id = auth.uid()
        AND admin_type IN ('platform_admin', 'campus_admin')
    )
  );

-- ── 3. DROP old UPDATE/DELETE policies (owner + mod) ──────────
DROP POLICY IF EXISTS notes_update ON public.notes;
DROP POLICY IF EXISTS notes_delete ON public.notes;

-- ── 4. CREATE admin-only UPDATE policy ────────────────────────
CREATE POLICY notes_update ON public.notes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.admin_grants
      WHERE user_id = auth.uid()
        AND admin_type IN ('platform_admin', 'campus_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_grants
      WHERE user_id = auth.uid()
        AND admin_type IN ('platform_admin', 'campus_admin')
    )
  );

-- ── 5. CREATE admin-only DELETE policy ────────────────────────
CREATE POLICY notes_delete ON public.notes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.admin_grants
      WHERE user_id = auth.uid()
        AND admin_type IN ('platform_admin', 'campus_admin')
    )
  );
