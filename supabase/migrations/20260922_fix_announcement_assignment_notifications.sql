-- ═══════════════════════════════════════════════════════════════════════════
-- 20260922_fix_announcement_assignment_notifications.sql
-- Finish the notification repair started in 20260921
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXT
-- 20260921 fixed the column names (42703) and the note type value, which made
-- note uploads work again. It deliberately left two things alone because at the
-- time the correct replacement was not yet established. This migration closes
-- both, so the whole `notify_on_*` family is now consistent with the live
-- `notifications` schema.
--
-- ── BUG 1: notify_on_announcement writes a type the CHECK rejects ───────────
-- `notify_on_announcement()` is bound to the `on_official_announcement` trigger
-- AFTER INSERT ON `posts` WHEN NEW.is_official. It passed the type
-- `'announcement'`, but the live constraint is:
--
--     notifications_type_check:
--       connection_request, connection_accepted, post_reaction, post_comment,
--       comment_reply, new_opportunity, new_event, new_note, mention, message,
--       system
--
-- 'announcement' is not in that list, so every official post raised 23514
-- (check_violation) inside the trigger and the POST INSERT WAS ROLLED BACK.
-- This is a straight continuation of the symptom that was reported as
-- "posts cannot be created": ordinary posts are unaffected (the trigger
-- returns immediately unless is_official), but an official announcement could
-- never be created at all.
--
-- Verified live before the fix:
--     select prosrc from pg_proc where proname='notify_on_announcement';
--       ... PERFORM create_notification(profile_rec.id, 'announcement', ...)
--     select pg_get_constraintdef(oid) from pg_constraint
--      where conname='notifications_type_check';
--       ... 11 values, 'announcement' absent
--
-- ── BUG 2: notify_on_assignment reads a column that does not exist ──────────
-- `notify_on_assignment()` is bound to `on_assignment_created` AFTER INSERT ON
-- `assignments`. Its recipient loop filters on `profiles.role = 'student'`:
--
--     FOR student_rec IN
--       SELECT id FROM profiles
--       WHERE campus_id = NEW.campus_id AND department_id = NEW.department_id
--         AND id != NEW.posted_by
--         AND role = 'student'          -- <-- profiles.role does not exist
--
-- Live `profiles` has 35 columns and none of them is `role`:
--     id, college_id, campus_id, department_id, program_id, username, full_name,
--     avatar_url, bio, batch_year, current_year, roll_number, github_url,
--     linkedin_url, twitter_url, portfolio_url, resume_url, is_verified,
--     is_active, is_public, last_seen_at, created_at, updated_at, college_email,
--     college_email_verified, karma_points, streak_days, last_active_date,
--     status, last_streak_date, aura_points, streak_freezes, skills, headline,
--     interaction_scope
--
-- So the statement raised 42703 (undefined_column) and EVERY assignment insert
-- was rolled back. `role` was evidently dropped at some point — the same class
-- of drift that migration 007 describes fixing for the like/comment/connection
-- triggers ("Legacy triggers referenced dropped columns").
--
-- `role` was NOT re-added, and 'student' was NOT guessed at from some other
-- table. There is nothing in the schema that distinguishes a student from
-- faculty:
--     select status, count(*) from profiles group by status;
--       active | 54                        (only one value)
--     select admin_type, count(*) from admin_grants group by admin_type;
--       platform_admin | 6, campus_admin | 5   (only admins)
--     public.role columns exist only on membership tables
--       (club_members, community_members, group_members, live_voice_chat_members,
--        study_group_members, interview_experiences) — none of them is the
--       student/faculty axis this predicate was reaching for.
-- The predicate is therefore removed and the recipient set becomes
-- campus + department minus the poster, which is the same shape `notify_on_note`
-- already uses for campus scope. This is the smallest change that preserves the
-- observable intent (tell the department about the assignment) without
-- inventing a role system. It is flagged in the report as a product decision:
-- if a real student/faculty source is added later, this filter should be
-- restored against that source rather than against profiles.role.
--
-- ── WHY `p_link` BECOMES `p_ref_type` / `p_ref_id` ──────────────────────────
-- The three callers passed a destination — '/notes', '/feed',
-- '/classroom/<id>' — but `notifications` has no link column, so 20260921
-- accepted the argument and dropped it. The table's canonical destination
-- mechanism is the `ref_type` / `ref_id` pair, and the notifications page reads
-- exactly that, BEFORE it looks at `type`:
--
--     // src/app/notifications/page.tsx
--     const targetFor = (n) => {
--       if (n.ref_type === 'post' && n.ref_id) return `/post/${n.ref_id}`
--       if (n.ref_type === 'team_request') return '/teams'
--       switch (n.type) { ... case 'new_note': return '/notes' ... }
--     }
--
-- So `create_notification` is extended to store them. `p_link` is retained in
-- the signature (DEFAULT NULL) purely so that no existing call site can break;
-- it is intentionally still not stored, because there is no column for it and
-- `ref_type`/`ref_id` is the correct replacement.
--
-- ── TYPE VALUES CHOSEN ──────────────────────────────────────────────────────
--   announcement -> 'system'   Official platform/campus broadcast. There is no
--                              announcement value in the CHECK, and 'system' is
--                              the neutral member already present in it.
--                              The destination comes from ref_type='post', so
--                              clicking opens /post/<id> (a real route — see
--                              src/app/post/[id]/page.tsx).
--   assignment   -> 'system'   Same reasoning. NOTE: there is no /classroom
--                              route in the application (verified — src/app has
--                              no classroom directory), so the old
--                              '/classroom/<id>' link was already dead. No ref
--                              is set, the notification renders as a Classroom
--                              entry through the page's body-keyword classify()
--                              and simply has no click target.
--   note         -> 'new_note' Unchanged, already correct and verified.
--
-- The CHECK constraint is NOT widened and NOT modified. These are NOT NULL
-- changes: an official post and an assignment currently fail outright, so any
-- valid type value is strictly an improvement over a rolled-back insert.
--
-- ── PRIVILEGES ──────────────────────────────────────────────────────────────
-- `create_notification` is dropped and recreated, which RESETS its ACL to the
-- default (EXECUTE to PUBLIC). The revokes are therefore repeated here — they
-- are not redundant with 20260921.
--
-- DELIBERATELY NOT CHANGED
--   * No trigger is disabled, dropped or rebound; all three stay enabled.
--   * RLS stays enabled and no policy is added, weakened or dropped.
--   * Message text, recipients and scope are unchanged everywhere except the
--     assignment role filter described above.
--   * notify_on_like / notify_on_comment / notify_on_connection / notify_answer
--     / notify_user / respond_to_connection / join_hackathon / request_team_join
--     / respond_team_join were audited and already write the canonical columns
--     (recipient_id, actor_id, type, ref_type, ref_id, title, body) — untouched.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. create_notification: canonical columns + real destination ─────────────
-- Dropping the 4-argument version first keeps exactly one overload, so a 4 or 5
-- argument call can never become ambiguous.

DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id  uuid,
  p_type     text,
  p_content  text,
  p_link     text DEFAULT NULL,   -- retained for call-site compatibility; not stored
  p_ref_type text DEFAULT NULL,   -- canonical destination, e.g. 'post'
  p_ref_id   uuid DEFAULT NULL
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

  -- `body` is what the notifications page renders (it shows `body || title`).
  -- `ref_type`/`ref_id` are what it navigates with. `p_link` has no column and
  -- is intentionally ignored.
  INSERT INTO public.notifications (recipient_id, type, ref_type, ref_id, body, is_read)
  VALUES (p_user_id, p_type, p_ref_type, p_ref_id, p_content, false);
END;
$function$;

COMMENT ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid) IS
  'Inserts a notification for one recipient using the live notifications columns. SECURITY DEFINER so the insert satisfies notifications RLS, which has no INSERT policy. Called only by the notify_on_* trigger functions. p_link is kept for compatibility and deliberately not stored; use p_ref_type/p_ref_id for the click destination.';

-- DROP + CREATE reset the ACL to EXECUTE-for-PUBLIC, so this must be repeated.
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid) TO service_role;

-- ── 2. notify_on_note — unchanged behaviour, now also sets its destination ──
-- Body, recipient set, scope and type are byte-for-byte what 20260921 applied
-- and verified; only the ref pair is new.

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
      'new_note',
      uploader_name || ' uploaded a new note 📚',
      '/notes',
      'note',        -- ref_type: not special-cased by the UI, which then
      NEW.id         -- uses type 'new_note' -> /notes
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ── 3. notify_on_announcement — BUG 1 ───────────────────────────────────────
-- The type value 'announcement' -> 'system' (the former is not in the CHECK),
-- plus ref_type='post' so the click lands on /post/<id>. Recipient set and
-- message text are unchanged. The old value is named here and not inside the
-- body, so that the verification query in section 5 returns zero rows.

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
          'system',
          '📢 New official announcement posted',
          '/feed',       -- kept for compatibility; the destination below is used
          'post',        -- ref_type: the UI routes this to /post/<id>
          NEW.id
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 4. notify_on_assignment — BUG 2 ────────────────────────────────────────
-- The predicate filtering recipients on the non-existent profiles.role column is
-- removed (see BUG 2 above). The type value 'assignment' -> 'system' (the former
-- is not in the CHECK). Message text is unchanged. No ref pair: there is no
-- /classroom route to point at, and the page's classify() already files the
-- notification under Classroom from the body text.

CREATE OR REPLACE FUNCTION public.notify_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  student_rec RECORD;
BEGIN
  -- faculty_name was selected and never used; removed rather than carried along.
  FOR student_rec IN
    SELECT id FROM profiles
    WHERE campus_id = NEW.campus_id
    AND department_id = NEW.department_id
    AND id != NEW.posted_by
  LOOP
    PERFORM create_notification(
      student_rec.id,
      'system',
      '📝 New assignment: ' || NEW.title || ' — ' || NEW.subject || ' (Due: ' || TO_CHAR(NEW.due_date, 'DD Mon') || ')',
      '/classroom/' || NEW.id::TEXT
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ── 5. Verification (run after applying) ───────────────────────────────────
--   -- one overload only, canonical columns, SECURITY DEFINER:
--   SELECT proname, pg_get_function_identity_arguments(oid), prosecdef
--   FROM pg_proc WHERE proname = 'create_notification';
--
--   -- no live function still emits a rejected type value:
--   SELECT p.proname FROM pg_proc p
--   WHERE p.prosrc ~ '''(announcement|assignment)'''
--     AND p.proname LIKE 'notify%';
--     -- expected: 0 rows
--
--   -- no live notification function reads profiles.role:
--   SELECT proname FROM pg_proc WHERE prosrc ILIKE '%role = ''student''%';
--     -- expected: 0 rows
--
--   -- the three triggers are still bound and enabled ('O'):
--   SELECT t.tgname, t.tgrelid::regclass, p.proname, t.tgenabled
--   FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE NOT t.tgisinternal AND p.proname IN
--     ('notify_on_note','notify_on_announcement','notify_on_assignment');
