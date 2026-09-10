-- ============================================================
-- 036: Feature Flags & Platform Admin Panel
--
-- Gives platform admins full control over features, settings,
-- and audit logging — all from the website UI, no code deploys.
-- ============================================================

-- ── Feature Flags ───────────────────────────────────────────
-- Each row is a feature the admin can toggle on/off from the panel.
-- Examples: events, meetings, polls, notes, compete, communities, etc.
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,          -- machine name: 'events', 'polls', ...
  label       TEXT NOT NULL,                 -- human label: 'Events & Hackathons'
  description TEXT,                          -- tooltip / help text
  enabled     BOOLEAN NOT NULL DEFAULT TRUE, -- toggle from admin panel
  category    TEXT NOT NULL DEFAULT 'core',  -- grouping: core, social, academics, tools
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feature_flags_updated ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_updated BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_feature_flags_updated_at();

-- Seed default features (all enabled by default)
INSERT INTO public.feature_flags (key, label, description, category, sort_order) VALUES
  ('feed',           'Campus Feed',          'Main post feed for the campus',                    'core',      1),
  ('global_feed',    'Global Feed',          'Global campus feed visible to all students',        'core',      2),
  ('events',         'Events & Hackathons',  'Campus events, hackathons and event memories',     'social',    3),
  ('polls',          'Campus Polls',         'Create and vote on campus polls',                   'social',    4),
  ('communities',    'Global Communities',   'DSA, Web Dev, Startups and other communities',      'social',    5),
  ('teams',          'Find Teammates',       'Hackathon team formation and matching',             'social',    6),
  ('meetings',       'Meetings',             'Schedule and manage meetings',                      'social',    7),
  ('notes',          'Notes Library',        'Subject-wise notes, PYQs and resources',            'academics', 8),
  ('brain',          'AI Brain',             'Personal academic memory — ask your notes anything', 'academics', 9),
  ('ask',            'Ask a Senior',         'Doubt-solving with college seniors',                'academics', 10),
  ('compete',        'Compete (DSA)',        'Daily DSA challenges, Campus Clash & rankings',      'academics', 11),
  ('talent',         'Talent Discovery',     'Discover students by skill',                        'tools',     12),
  ('lost_found',     'Lost & Found',         'Report lost items or return found ones',            'tools',     13),
  ('travel',         'Travel Buddies',       'Find campus mates on the same route',               'tools',     14),
  ('connections',    'My Network',           'Chats, connections, requests and DMs',              'social',    15),
  ('saved',          'Saved Posts',          'Bookmark posts for later',                          'tools',     16),
  ('leaderboard',    'Leaderboard',          'Top contributors on campus',                        'social',     17),
  ('weekly_wrap',    'Weekly Wrap',          'Weekly digest of campus activity',                  'social',    18),
  ('notifications',  'Notifications',        'Push and in-app notifications',                     'tools',     19),
  ('onboarding',     'Student Onboarding',   'New user onboarding flow',                          'core',      20),
  ('profile',        'Student Profiles',     'User profile pages with bio, skills, links',        'core',      21)
ON CONFLICT (key) DO NOTHING;

-- ── Platform Settings (extended) ────────────────────────────
-- Broader platform-wide settings beyond the campus_content_to_global switch.
-- key/value pairs — same pattern as app_settings, but with description column.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',  -- general, appearance, security, ai
  updated_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_settings_updated ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_updated BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_settings_updated_at();

-- Seed default platform settings
INSERT INTO public.platform_settings (key, value, description, category) VALUES
  ('platform_name',           'ConnectMyCampus',        'Display name of the platform',                'general'),
  ('platform_tagline',        'Your campus, connected','Tagline shown on landing page',               'general'),
  ('maintenance_mode',        'false',                 'When true, shows maintenance banner',         'general'),
  ('maintenance_message',     'We are undergoing scheduled maintenance. Please check back soon.', 'Maintenance banner text', 'general'),
  ('allow_signup',            'true',                  'Allow new student registrations',             'security'),
  ('require_email_verify',    'true',                  'Require email verification for new accounts', 'security'),
  ('ai_moderation_enabled',   'true',                  'AI auto-flagging of questionable content',    'ai'),
  ('ai_brain_enabled',        'true',                  'AI Brain feature for students',               'ai'),
  ('max_post_length',         '5000',                  'Maximum characters per post',                 'general'),
  ('max_notes_upload_mb',     '50',                    'Maximum file upload size for notes (MB)',      'general'),
  ('karma_per_post',          '5',                     'Karma points earned per post',                'general'),
  ('karma_per_comment',       '2',                     'Karma points earned per comment',             'general'),
  ('karma_per_upvote',        '1',                     'Karma points earned per upvote received',     'general'),
  ('max_reports_before_flag', '3',                     'Number of reports before AI flags content',   'general')
ON CONFLICT (key) DO NOTHING;

-- RLS policies: read for authenticated, write for platform_admin only
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- feature_flags policies
DROP POLICY IF EXISTS feature_flags_select ON public.feature_flags;
CREATE POLICY feature_flags_select ON public.feature_flags
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS feature_flags_insert ON public.feature_flags;
CREATE POLICY feature_flags_insert ON public.feature_flags
  FOR INSERT WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS feature_flags_update ON public.feature_flags;
CREATE POLICY feature_flags_update ON public.feature_flags
  FOR UPDATE USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS feature_flags_delete ON public.feature_flags;
CREATE POLICY feature_flags_delete ON public.feature_flags
  FOR DELETE USING (public.is_platform_admin());

-- platform_settings policies
DROP POLICY IF EXISTS platform_settings_select ON public.platform_settings;
CREATE POLICY platform_settings_select ON public.platform_settings
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS platform_settings_insert ON public.platform_settings;
CREATE POLICY platform_settings_insert ON public.platform_settings
  FOR INSERT WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_settings_update ON public.platform_settings;
CREATE POLICY platform_settings_update ON public.platform_settings
  FOR UPDATE USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_settings_delete ON public.platform_settings;
CREATE POLICY platform_settings_delete ON public.platform_settings
  FOR DELETE USING (public.is_platform_admin());

-- ── Enhanced Audit Log ──────────────────────────────────────
-- Add more columns for better tracking
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log (action, created_at DESC);

-- ── RPC: Get all feature flags (cached-friendly) ────────────
CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS TABLE (key text, enabled boolean, label text, description text, category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT f.key, f.enabled, f.label, f.description, f.category
  FROM public.feature_flags f
  ORDER BY f.sort_order;
$fn$;

-- ── RPC: Get platform settings ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_settings()
RETURNS TABLE (key text, value text, description text, category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT s.key, s.value, s.description, s.category
  FROM public.platform_settings s
  ORDER BY s.key;
$fn$;

-- ── RPC: Check if a feature is enabled ──────────────────────
CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (SELECT enabled FROM public.feature_flags WHERE key = p_key),
    TRUE  -- default: unknown features are enabled
  );
$fn$;

-- ── RPC: Log admin action ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
END;
$fn$;
