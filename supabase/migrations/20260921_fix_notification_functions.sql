-- ═══════════════════════════════════════════════════════════════════════════
-- 20260921_fix_notification_functions.sql
-- Repair the note / announcement / assignment notification chain
-- ═══════════════════════════════════════════════════════════════════════════
-- SYMPTOM
-- Uploading a note failed with an opaque HTTP 500 and the note never appeared.
--
-- ROOT CAUSE
-- `create_notification()` still wrote the pre-005 shape of `notifications`:
--
--     INSERT INTO notifications (user_id, type, content, link, is_read, created_at)
--
-- The live table is:
--
--     id, recipient_id, actor_id, type, ref_type, ref_id, title, body,
--     is_read, created_at
--
-- `user_id`, `content` and `link` do not exist, so every call raised
-- 42703 (undefined_column). The function is called from three AFTER INSERT
-- triggers:
--
--     notes       -> on_note_upload         -> notify_on_note()
--     posts       -> on_official_announcement -> notify_on_announcement()
--     assignments -> on_assignment_created  -> notify_on_assignment()
--
-- The exception is raised inside the trigger, so the INSERT that fired it is
-- rolled back along with it. That is why the note was never created.
--
-- A SECOND, INDEPENDENT BUG IN THE SAME CHAIN
-- `notifications` has RLS enabled with SELECT and UPDATE policies but no INSERT
-- policy, so a non-owner insert is denied. `notify_on_note`,
-- `notify_on_announcement` and `notify_on_assignment` are NOT SECURITY DEFINER,
-- so they run as the calling role: the notes route uses the service-role key
-- (which bypasses RLS) but the posts and assignments paths insert from the
-- client as `authenticated`, where the notification insert would be rejected
-- even once the columns are right.
--
-- WHAT MIGRATION 007 ALREADY DID — AND WHAT IT MISSED
-- 007 rewrote notify_on_like / notify_on_comment / notify_on_connection onto the
-- current columns and made them SECURITY DEFINER, with the comment: "SECURITY
-- DEFINER so the notification insert works under the new notifications RLS
-- (005)". It never touched create_notification or its three callers, so both
-- bugs survived here — the same class of failure 007 was written to fix.
--
-- THE FIX (minimal: one function's body, plus privileges)
--   1. create_notification writes the columns that actually exist.
--   2. It becomes SECURITY DEFINER so the insert runs as the table owner and
--      satisfies RLS — the pattern 007 already established.
--   3. Its EXECUTE is revoked from PUBLIC/anon/authenticated. Nothing in the
--      application calls it (only the triggers do), and now that it executes
--      as the owner, leaving it publicly callable would hand any client a
--      "notify any user about anything" RPC.
--   4. The three callers become SECURITY DEFINER so they retain the EXECUTE
--      they need. They are trigger functions and return `trigger`, so they are
--      not reachable through PostgREST.
--
-- A THIRD LAYER IN THE SAME CHAIN — THE TYPE VALUE
-- Fixing the columns exposed the next failure rather than fixing it: the insert
-- then hit the CHECK on the type column,
--
--     notifications_type_check:
--       connection_request, connection_accepted, post_reaction, post_comment,
--       comment_reply, new_opportunity, new_event, new_note, mention, message,
--       system
--
-- `notify_on_note` wrote the type `'note'`, which is not in that list, so the
-- notification insert raised 23514 (check_violation) and the note rolled back
-- exactly as before. The canonical value is `'new_note'`, which is also what the
-- notifications page routes to /notes (`case 'new_note': return '/notes'`), so
-- the fix is unambiguous.
--
-- DELIBERATELY NOT CHANGED
--   * `on_note_upload` and the other triggers are left bound and enabled.
--   * RLS stays enabled and no policy is added, weakened or dropped.
--   * The recipient and message of every notification are unchanged.
--   * `notify_on_announcement` and `notify_on_assignment` still pass types
--     ('announcement', 'assignment') that are NOT in the CHECK list either, so
--     those two paths remain broken. Both are reported separately rather than
--     guessed at here: unlike 'note' -> 'new_note' there is no canonical value
--     that obviously matches, and picking one would change product behaviour.
--
-- `p_link` is kept in the signature so no caller has to change. The table has
-- no link column and the notifications UI derives its destination from
-- type/ref_type, so the value is intentionally not stored.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The function every broken notification path goes through ─────────────

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type    text,
  p_content text,
  p_link    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- `body` is the message the notifications UI renders (it shows
  -- body || title). The old `link` argument has no column to live in and the
  -- UI derives its destination from type/ref_type, so it is not stored.
  INSERT INTO public.notifications (recipient_id, type, body, is_read)
  VALUES (p_user_id, p_type, p_content, false);
END;
$function$;

COMMENT ON FUNCTION public.create_notification(uuid, text, text, text) IS
  'Inserts a notification for one recipient. SECURITY DEFINER so the insert satisfies notifications RLS, which has no INSERT policy. Called only by the notify_on_* triggers.';

-- ── 2. Only the triggers may call it ────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text) TO service_role;

-- ── 3. Callers run as the owner so they keep EXECUTE and satisfy RLS ─────────
-- Bodies are reproduced verbatim; only the SECURITY/SET search_path clause and
-- the function body's INSERT path (now correct) change behaviour.

CREATE OR REPLACE FUNCTION public.notify_on_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uploader_name TEXT;
  profile_rec RECORD;
BEGIN
  SELECT full_name INTO uploader_name FROM profiles WHERE id = NEW.uploaded_by;

  FOR profile_rec IN
    SELECT id FROM profiles
    WHERE campus_id = NEW.campus_id
    AND id != NEW.uploaded_by
  LOOP
    PERFORM create_notification(
      profile_rec.id,
      'new_note',  -- was 'note', which notifications_type_check rejects
      uploader_name || ' uploaded a new note 📚',
      '/notes'
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  profile_rec RECORD;
BEGIN
  IF NEW.is_official = true THEN
    FOR profile_rec IN
      SELECT id FROM profiles
      WHERE (NEW.scope = 'global')
         OR (NEW.scope = 'campus' AND campus_id = NEW.campus_id)
    LOOP
      IF profile_rec.id != NEW.author_id THEN
        PERFORM create_notification(
          profile_rec.id,
          'announcement',
          '📢 New official announcement posted',
          '/feed'
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  faculty_name TEXT;
  student_rec RECORD;
BEGIN
  SELECT full_name INTO faculty_name FROM profiles WHERE id = NEW.posted_by;

  FOR student_rec IN
    SELECT id FROM profiles
    WHERE campus_id = NEW.campus_id
    AND department_id = NEW.department_id
    AND id != NEW.posted_by
    AND role = 'student'
  LOOP
    PERFORM create_notification(
      student_rec.id,
      'assignment',
      '📝 New assignment: ' || NEW.title || ' — ' || NEW.subject || ' (Due: ' || TO_CHAR(NEW.due_date, 'DD Mon') || ')',
      '/classroom/' || NEW.id::TEXT
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ── 4. Verify (expected: the three triggers are still bound and enabled) ────
--   SELECT t.tgname, t.tgrelid::regclass, p.proname, t.tgenabled
--   FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE NOT t.tgisinternal AND p.proname IN
--     ('notify_on_note','notify_on_announcement','notify_on_assignment');
