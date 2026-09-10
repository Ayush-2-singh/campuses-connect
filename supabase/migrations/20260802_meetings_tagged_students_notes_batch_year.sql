-- Migration: Add tagged_students to meetings + batch_year to notes
-- Run this in Supabase SQL Editor or via Supabase CLI

-- 1. Add tagged_students column to meetings table
--    Stores an array of profile UUIDs that the faculty tagged for a meeting
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS tagged_students uuid[] DEFAULT NULL;

-- 2. Add batch_year column to notes table
--    Tracks which admission-year cohort a note's syllabus applies to
--    e.g., 2024 means "notes for students who joined in 2024"
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS batch_year integer DEFAULT NULL;

-- 3. Index to make batch-year filtering fast
CREATE INDEX IF NOT EXISTS idx_notes_batch_year ON notes (batch_year);
CREATE INDEX IF NOT EXISTS idx_notes_semester_batch ON notes (semester, batch_year);
