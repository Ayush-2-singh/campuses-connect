-- Migration: Add external storage fields to notes table
-- This migration adds support for storing files in external storage (Cloudflare R2)
-- while keeping Supabase as metadata-only.

-- Add new columns for external storage
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'link' CHECK (storage_provider IN ('link', 'r2', 'supabase')),
  ADD COLUMN IF NOT EXISTS external_file_url TEXT,
  ADD COLUMN IF NOT EXISTS external_file_id TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Add index for storage provider (useful for filtering)
CREATE INDEX IF NOT EXISTS idx_notes_storage_provider ON notes(storage_provider);

-- Add index for external file ID (useful for cleanup operations)
CREATE INDEX IF NOT EXISTS idx_notes_external_file_id ON notes(external_file_id);

-- Update existing notes to have default storage_provider
UPDATE notes SET storage_provider = 'link' WHERE storage_provider IS NULL;

-- Add comment explaining the architecture
COMMENT ON COLUMN notes.storage_provider IS 'Where the actual file is stored: link (external URL), r2 (Cloudflare R2), supabase (Supabase Storage)';
COMMENT ON COLUMN notes.external_file_url IS 'URL to access the file (presigned URL for R2, public URL for others)';
COMMENT ON COLUMN notes.external_file_id IS 'File identifier in external storage (e.g., R2 key path)';
COMMENT ON COLUMN notes.file_size IS 'File size in bytes';
COMMENT ON COLUMN notes.mime_type IS 'MIME type of the file';
COMMENT ON COLUMN notes.preview_url IS 'URL for preview thumbnail';
