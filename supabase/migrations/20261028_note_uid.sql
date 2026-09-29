-- 20261028_note_uid.sql
--
-- PUBLIC NOTE UIDs — every Library resource gets a short, human-shareable
-- reference code (CC-NOTE-XXXX) so it can be tagged in any group chat and
-- deep-linked from anywhere, without pasting raw URLs.
--
-- Design:
--   * Format CC-NOTE-XXXX over a 31-char confusion-free alphabet
--     (no I/O/0/1) — 32^4 ≈ 1M codes, plenty for a campus library, and the
--     code survives being read out loud or handwritten.
--   * Assigned by a BEFORE INSERT trigger, not application code: the upload
--     route, the submit route and admin tools are all writers, and an id
--     that is only sometimes present is worse than none.
--   * Unique partial index guarantees no collisions even if two writers race
--     (the trigger loop re-rolls on a hit).
--   * Existing rows are backfilled so OLD notes are taggable too — the card
--     in chat must resolve regardless of when the note was posted.
--
-- Everything is ADDITIVE: a new nullable column, one index, one trigger.
-- No row is deleted, no policy is changed.

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS note_uid TEXT;

COMMENT ON COLUMN public.notes.note_uid IS
  'Public shareable reference (CC-NOTE-XXXX, confusion-free alphabet). Tagged in chat as [CC-NOTE-XXXX] and deep-linked at /notes?uid=CC-NOTE-XXXX.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_note_uid
  ON public.notes (note_uid)
  WHERE note_uid IS NOT NULL;

-- ============================================================================
-- Auto-assignment on insert (and normalisation if a code is supplied)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notes_assign_note_uid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     TEXT;
  i        INT;
BEGIN
  IF NEW.note_uid IS NOT NULL THEN
    NEW.note_uid := upper(btrim(NEW.note_uid));
    RETURN NEW;
  END IF;
  LOOP
    code := 'CC-NOTE-';
    FOR i IN 1..4 LOOP
      code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.notes WHERE note_uid = code);
  END LOOP;
  NEW.note_uid := code;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_notes_note_uid ON public.notes;
CREATE TRIGGER trg_notes_note_uid
  BEFORE INSERT ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_assign_note_uid();

-- Backfill: existing notes get codes too, one row at a time so the
-- uniqueness check sees previously assigned codes.
DO $backfill$
DECLARE
  r        RECORD;
  code     TEXT;
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i        INT;
BEGIN
  FOR r IN SELECT id FROM public.notes WHERE note_uid IS NULL LOOP
    LOOP
      code := 'CC-NOTE-';
      FOR i IN 1..4 LOOP
        code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.notes WHERE note_uid = code);
    END LOOP;
    UPDATE public.notes SET note_uid = code WHERE id = r.id;
  END LOOP;
END
$backfill$;
