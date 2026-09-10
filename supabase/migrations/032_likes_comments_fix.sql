-- 032: real like counts + like toggling
--
-- The old reactions SELECT policy (profile_id = auth.uid()) meant a user could
-- only ever see their OWN reaction — so a "like count" query on a post returned
-- 0 or 1 depending on whether the viewer had liked it. Nobody could see real
-- totals, and the UI had no way to show an accurate count.
--
-- Fix: match the comments pattern — anyone who can view the post can see all of
-- its reactions. Insert/update/delete stay locked to the row owner, so the
-- like toggle (insert like / delete like) remains safe.

DROP POLICY IF EXISTS reactions_select ON post_reactions;

CREATE POLICY reactions_select ON post_reactions
  FOR SELECT
  USING (can_view_post_id(post_id));
