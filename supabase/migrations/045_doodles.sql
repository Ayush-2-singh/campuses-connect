-- ═══════════════════════════════════════════════════════════════════
-- 045 — Doodles: freehand drawing canvas feature
-- ═══════════════════════════════════════════════════════════════════

-- Doodles table
CREATE TABLE IF NOT EXISTS doodles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  storage_path TEXT,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching a user's doodles
CREATE INDEX IF NOT EXISTS idx_doodles_user ON doodles(user_id, created_at DESC);

-- RLS
ALTER TABLE doodles ENABLE ROW LEVEL SECURITY;

-- Users can read their own doodles
CREATE POLICY "doodles_select_own" ON doodles
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own doodles
CREATE POLICY "doodles_insert_own" ON doodles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own doodles
CREATE POLICY "doodles_delete_own" ON doodles
  FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for doodle images
INSERT INTO storage.buckets (id, name, public)
VALUES ('doodles', 'doodles', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can upload to their own folder
CREATE POLICY "doodles_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'doodles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: anyone can read doodles (public bucket)
CREATE POLICY "doodles_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'doodles');

-- Storage RLS: users can delete their own files
CREATE POLICY "doodles_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'doodles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
