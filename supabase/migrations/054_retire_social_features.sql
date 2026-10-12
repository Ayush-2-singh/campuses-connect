-- ============================================================
-- 054: Retire the Social / Engagement Layer  (V4 pivot → Campus Hiring)
--
-- NON-DESTRUCTIVE. Nothing is dropped here. This migration only flips the
-- `feature_flags` rows for the retired surface OFF so the admin panel reflects
-- reality, and registers flags for surfaces that never had one (games, watch,
-- confessions, social chat, social voice).
--
-- Runtime enforcement of the retirement lives in src/lib/featureGates.ts
-- (used by src/middleware.ts). Flipping a flag here does NOT re-enable a route:
-- set SOCIAL_LAYER_RETIRED = false in that file to restore everything.
--
-- Kept: jobs, companies, applications, experiences, opportunities, talent,
--       leaderboard, compete (→ assessment engine), brain (→ interview coach),
--       integrations, profile, campus-change, admin, notifications, reminders,
--       premium, blog.
-- ============================================================

-- ── Retire flags that already exist ────────────────────────
UPDATE public.feature_flags
   SET enabled = FALSE
 WHERE key IN (
   'feed', 'global_feed', 'events', 'polls', 'communities', 'teams',
   'meetings', 'notes', 'ask', 'lost_found', 'travel', 'connections',
   'saved', 'weekly_wrap'
 );

-- ── Register + retire flags that had no row ────────────────
INSERT INTO public.feature_flags (key, label, description, category, sort_order, enabled) VALUES
  ('games',       'Games',           'Typing Battle & Quick Math multiplayer games', 'social', 30, FALSE),
  ('watch',       'Videos',          'Netflix-style campus video wall',              'social', 31, FALSE),
  ('confessions', 'Confessions',     'Anonymous campus confessions',                 'social', 32, FALSE),
  ('chat',        'Chat & Network',  'Social DMs, connections, requests and groups', 'social', 33, FALSE),
  ('live_voice',  'Live Voice Chat', 'Always-on social voice rooms',                 'social', 34, FALSE)
ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- ============================================================
-- ROLLBACK (restore the social layer:
--   1) run the UPDATE below, then
--   2) set SOCIAL_LAYER_RETIRED = false in src/lib/featureGates.ts and redeploy)
-- ------------------------------------------------------------
-- UPDATE public.feature_flags
--    SET enabled = TRUE
--  WHERE key IN (
--    'feed', 'global_feed', 'events', 'polls', 'communities', 'teams',
--    'meetings', 'notes', 'ask', 'lost_found', 'travel', 'connections',
--    'saved', 'weekly_wrap', 'games', 'watch', 'confessions', 'chat', 'live_voice'
--  );
-- ============================================================
