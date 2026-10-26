-- 20261114_backfill_existing_experience_review.sql — do not unpublish what was
-- already public.
--
-- 20261113 added `review_status` with a `pending_review` default, and made the
-- public read rule "approved only". That is right for new submissions and for
-- seeded research leads, but every write-up that already existed in the table
-- had been publicly readable up to that moment. Leaving it pending would have
-- silently taken a student's published account off the site (and out of the
-- sitemap) without anybody deciding to.
--
-- So: rows that were written BY a user, have no source URL (i.e. are not seeded
-- leads) and predate the review column are approved ONCE, here.
--
-- This is deliberately time-boxed. A submission made after this migration keeps
-- the pending default and goes through review like everything else — this file
-- is a one-time backfill, not a policy.

UPDATE public.interview_experiences
   SET review_status = 'approved',
       verification_status = 'approved'
 WHERE provenance = 'user'
   AND source_url IS NULL
   AND review_status = 'pending_review'
   AND created_at < TIMESTAMPTZ '2026-10-27 00:00:00+05:30';
