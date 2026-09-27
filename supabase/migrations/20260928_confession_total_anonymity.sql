-- 20260928_confession_total_anonymity.sql
--
-- WHY — three product requirements, one design:
--
--   1. TOTALLY ANONYMOUS: not even the database may keep an author id. The
--      previous design stored a private author_id (+ campus_id) for
--      moderation and a per-user daily cap. Hiding a column from readers is
--      not the same as not having it: one leaked row still links a
--      confession to a student. This migration DROPS both columns —
--      retroactively unlinking every confession already stored.
--
--   2. ADMINS CAN ALWAYS DELETE: admin_delete_confession() hard-deletes any
--      confession (platform/campus admins — the same gate as
--      moderate_confession) and writes an audit_log entry FIRST, so the
--      deletion itself stays traceable even though the author never was.
--
--   3. THE POSTER CAN DELETE THEIR OWN: with no author id, ownership has to
--      be proven by a SECRET, not by identity. create_confession() now
--      returns a one-time delete token alongside the id; only
--      SHA-256(token) is stored (delete_token_hash), so a database leak
--      cannot revoke anyone's posts. The token lives in the poster's
--      browser (localStorage) and delete_confession() accepts it as the
--      sole proof of ownership.
--
-- KNOWN TRADE-OFF: the old 5-per-day cap was keyed on author_id — it cannot
-- exist for posts that are anonymous at rest. Remaining spam defences:
-- login required to post, phone/email/link-heavy bodies start 'hidden' for
-- review, five unique reports auto-hide, admins can delete at any time.
--
-- Only sha256() and gen_random_uuid() are used — both core Postgres, no
-- extensions. Reads stay on the confessions_public view (unchanged: id,
-- body, reaction_count, created_at). ADDITIVE except the two dropped
-- columns. Idempotent. Safe to re-run.

-- ── 1. Strip every stored identity ──────────────────────────────────────────

-- The policy's predicate reads author_id — drop it before the column.
DROP POLICY IF EXISTS confessions_select_own ON public.confessions;
DROP INDEX IF EXISTS idx_confessions_author;
ALTER TABLE public.confessions DROP COLUMN IF EXISTS author_id;
ALTER TABLE public.confessions DROP COLUMN IF EXISTS campus_id;

-- ── 2. One-time delete secret, stored only as a hash ────────────────────────

ALTER TABLE public.confessions ADD COLUMN IF NOT EXISTS delete_token_hash TEXT;

-- ── 3. Create: no identity in, one-time token out ───────────────────────────
-- Return type changes (UUID → JSONB) and CREATE OR REPLACE cannot change a
-- function's return type — drop first, then create.
DROP FUNCTION IF EXISTS public.create_confession(TEXT);

CREATE FUNCTION public.create_confession(p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user   UUID := auth.uid();
  v_body   TEXT := btrim(COALESCE(p_body, ''));
  v_id     UUID;
  v_status TEXT;
  v_token  TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF length(v_body) < 1 OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'confession must be between 1 and 2000 characters';
  END IF;

  -- NOTE: no per-user daily cap here — it would require storing who posted,
  -- and requirement #1 is that nothing links a confession to a student.

  -- 64 hex chars of CSPRNG output (two uuids, dashes stripped).
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.confessions (body, status, delete_token_hash)
  VALUES (
    v_body,
    CASE
      -- obvious contact/identity leaks or many links start hidden for review
      WHEN v_body ~* '(\+91[ -]?)?[6-9][0-9]{9}'                    THEN 'hidden'
      WHEN v_body ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'        THEN 'hidden'
      WHEN (length(v_body) - length(replace(v_body, 'http', ''))) / 4 >= 3 THEN 'hidden'
      ELSE 'published'
    END,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
  )
  RETURNING id, status INTO v_id, v_status;

  -- The plaintext token leaves the database here; only the hash stays.
  RETURN jsonb_build_object('id', v_id, 'token', v_token, 'status', v_status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_confession(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_confession(TEXT) TO authenticated;

-- ── 4. The poster deletes their own confession — the secret IS the proof ────

CREATE OR REPLACE FUNCTION public.delete_confession(
  p_confession_id UUID,
  p_delete_token  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_hash TEXT;
  v_try  TEXT := encode(
    sha256(convert_to(btrim(COALESCE(p_delete_token, '')), 'UTF8')), 'hex'
  );
BEGIN
  IF p_confession_id IS NULL OR length(btrim(COALESCE(p_delete_token, ''))) < 16 THEN
    RETURN FALSE;
  END IF;

  SELECT delete_token_hash INTO v_hash
    FROM public.confessions
   WHERE id = p_confession_id;

  -- Confessions posted before this migration have no token — only an admin
  -- can delete those (requirement #2 still covers them).
  IF v_hash IS NULL OR v_hash <> v_try THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.content_reports
   WHERE content_type = 'confession' AND content_id = p_confession_id;
  DELETE FROM public.confessions WHERE id = p_confession_id; -- reactions cascade
  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_confession(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_confession(UUID, TEXT) TO authenticated;

-- ── 5. Admin hard delete — audited ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_delete_confession(p_confession_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_admin UUID := auth.uid();
  v_row   RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_grants
     WHERE user_id = v_admin AND admin_type IN ('platform_admin', 'campus_admin')
  ) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT status, reaction_count, report_count INTO v_row
    FROM public.confessions
   WHERE id = p_confession_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Audit FIRST — the row (and its id) disappears right after this.
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_admin, 'delete_confession', 'confession', p_confession_id,
          jsonb_build_object('status', v_row.status,
                             'reaction_count', v_row.reaction_count,
                             'report_count', v_row.report_count));

  DELETE FROM public.content_reports
   WHERE content_type = 'confession' AND content_id = p_confession_id;
  DELETE FROM public.confessions WHERE id = p_confession_id;
  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_delete_confession(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_confession(UUID) TO authenticated;

-- ── 6. Verification ─────────────────────────────────────────────────────────
-- A. No identity anywhere:
--      SELECT column_name FROM information_schema.columns
--       WHERE table_name = 'confessions';        -- no author_id / campus_id
-- B. Posting returns a token that is never stored in plaintext:
--      create_confession(...) → { id, token, status }  (keep the token)
--      SELECT delete_token_hash IS NOT NULL FROM public.confessions LIMIT 1;
-- C. Poster delete:  SELECT public.delete_confession('<id>', '<token>');
-- D. Admin delete:   SELECT public.admin_delete_confession('<id>');  -- audited
