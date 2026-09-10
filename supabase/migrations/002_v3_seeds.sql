-- ============================================================
-- CampusConnect V3 — Seeds (migration 002)
-- Categories, communities, admin types, default permission
-- matrix, AI agents, demo college data, and data backfills.
-- ============================================================

-- Self-healing: ensure geo columns exist on legacy tables before inserting
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS state TEXT;

-- ------------------------------------------------------------
-- 1. Content categories
-- ------------------------------------------------------------
INSERT INTO public.content_categories (key, label, description, icon, sort_order) VALUES
  ('discussion',   'Discussion',   'Conversations, doubts, open threads',           '💬', 1),
  ('resource',     'Resource',     'Curated links, blogs, tools',                   '🔗', 2),
  ('notes',        'Notes',        'Semester notes, PYQs, study material',          '📚', 3),
  ('hackathon',    'Hackathon',    'Hackathons near you and online',                '⚡', 4),
  ('internship',   'Internship',   'Internship openings and referrals',             '💼', 5),
  ('event',        'Event',        'Campus events, talks, workshops',               '📅', 6),
  ('announcement', 'Announcement', 'Official campus announcements',                 '📢', 7),
  ('project',      'Project',      'Find teammates, show your builds',              '🚀', 8),
  ('opportunity',  'Opportunity',  'Scholarships, collabs, startup roles & more',   '🎯', 9)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- ------------------------------------------------------------
-- 2. Global communities
-- ------------------------------------------------------------
INSERT INTO public.communities (key, name, tagline, description, icon, is_global, is_active) VALUES
  ('dsa',            'DSA',            'Data Structures & Algorithms', 'Solve, discuss and level up your DSA together.', '🧩', TRUE, TRUE),
  ('web-development', 'Web Development', 'Frontend, backend & full-stack', 'Build the web — share stacks, roadmaps and projects.', '🌐', TRUE, TRUE),
  ('startups',       'Startups',       'Founders, builders & interns',  'Ideas, collabs, internships and founder stories.', '🚀', TRUE, TRUE)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name;

-- ------------------------------------------------------------
-- 3. Admin types
-- ------------------------------------------------------------
INSERT INTO public.admin_types (key, label, sort_order) VALUES
  ('community_admin', 'Community Admin', 1),
  ('campus_admin',    'Campus Admin',    2),
  ('platform_admin',  'Platform Admin',  3)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 4. Default permission matrix (content_permissions)
--    actor_type × category → max_scope (NULL = cannot create)
--    V1: students cannot create posts.
-- ------------------------------------------------------------
INSERT INTO public.content_permissions (actor_type, category_id, max_scope)
SELECT actor.actor_type, cc.id, matrix.max_scope
FROM (VALUES
  -- student: disabled for everything in V1
  ('student', 'discussion',   NULL), ('student', 'resource', NULL),
  ('student', 'notes',        NULL), ('student', 'hackathon', NULL),
  ('student', 'internship',   NULL), ('student', 'event', NULL),
  ('student', 'announcement', NULL), ('student', 'project', NULL),
  ('student', 'opportunity',  NULL),
  -- community_admin: can create in global communities only
  ('community_admin', 'discussion',  'global'), ('community_admin', 'resource', 'global'),
  ('community_admin', 'internship',  'global'), ('community_admin', 'project', 'global'),
  ('community_admin', 'opportunity', 'global'),
  ('community_admin', 'notes',       NULL), ('community_admin', 'hackathon', NULL),
  ('community_admin', 'event',       NULL), ('community_admin', 'announcement', NULL),
  -- campus_admin
  ('campus_admin', 'discussion',  'college_network'), ('campus_admin', 'resource', 'campus'),
  ('campus_admin', 'notes',       'campus'), ('campus_admin', 'hackathon', 'college_network'),
  ('campus_admin', 'internship',  'college_network'), ('campus_admin', 'event', 'campus'),
  ('campus_admin', 'announcement','campus'), ('campus_admin', 'project', 'college_network'),
  ('campus_admin', 'opportunity', 'college_network'),
  -- platform_admin: everything, everywhere
  ('platform_admin', 'discussion', 'global'), ('platform_admin', 'resource', 'global'),
  ('platform_admin', 'notes',      'global'), ('platform_admin', 'hackathon', 'global'),
  ('platform_admin', 'internship', 'global'), ('platform_admin', 'event', 'global'),
  ('platform_admin', 'announcement','global'), ('platform_admin', 'project', 'global'),
  ('platform_admin', 'opportunity','global')
) AS matrix(actor_type, category_key, max_scope)
JOIN public.content_categories cc ON cc.key = matrix.category_key
JOIN (SELECT DISTINCT actor_type FROM (VALUES ('student'), ('community_admin'), ('campus_admin'), ('platform_admin')) AS a(actor_type)) AS actor
  ON actor.actor_type = matrix.actor_type
ON CONFLICT (actor_type, category_id) DO UPDATE SET max_scope = EXCLUDED.max_scope;

-- ------------------------------------------------------------
-- 5. AI agents
-- ------------------------------------------------------------
INSERT INTO public.ai_agents (key, name, description, enabled, config) VALUES
  ('content_moderation', 'Content Moderation',
   'Scans new posts/comments for spam, abuse and PII. Holds suspicious content for admin review.', TRUE,
   '{"hold_heuristics": ["spam", "abuse", "pii"], "auto_dismiss_score": 0.3}'),
  ('opportunity_scam_filter', 'Opportunity Scam Filter',
   'Flags hackathons/internships/opportunities with phishing links or implausible stipends.', TRUE,
   '{"link_denylist_patterns": ["bit.ly", "tinyurl"], "stipend_alert_below": 500}')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 6. Demo college data (PW IOI — CSE streams only)
-- ------------------------------------------------------------
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified)
SELECT 'PW IOI', 'pw-ioi', 'Lucknow', 'Uttar Pradesh', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.colleges WHERE slug = 'pw-ioi');

INSERT INTO public.campuses (college_id, name, slug, city, is_active)
SELECT c.id, v.name, v.slug, v.city, TRUE
FROM (VALUES ('PW IOI Lucknow', 'lucknow', 'Lucknow'), ('PW IOI Delhi', 'delhi', 'Delhi')) AS v(name, slug, city)
JOIN public.colleges c ON c.slug = 'pw-ioi'
WHERE NOT EXISTS (SELECT 1 FROM public.campuses WHERE slug = v.slug);

INSERT INTO public.departments (campus_id, name, short_name)
SELECT camp.id, v.name, v.short_name
FROM (VALUES
  ('Computer Science & Engineering', 'CSE'),
  ('Information Technology',          'IT'),
  ('Artificial Intelligence & ML',    'AIML'),
  ('Data Science',                    'DS'),
  ('Cyber Security',                  'CYSEC')
) AS v(name, short_name)
CROSS JOIN (SELECT id FROM public.campuses WHERE slug = 'lucknow') AS camp
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.campus_id = camp.id AND d.name = v.name
);

-- ------------------------------------------------------------
-- 7. Data backfills
-- ------------------------------------------------------------
-- 7a. posts: map legacy post_type → category, legacy visibility → scope
UPDATE public.posts p
SET category_id = cc.id,
    scope       = CASE p.visibility WHEN 'global' THEN 'global'
                                    ELSE 'campus' END,
    status      = 'published'
FROM public.content_categories cc
WHERE p.category_id IS NULL
  AND cc.key = CASE p.post_type
                 WHEN 'announcement' THEN 'announcement'
                 WHEN 'opportunity'  THEN 'opportunity'
                 WHEN 'resource'     THEN 'resource'
                 WHEN 'event'        THEN 'event'
                 WHEN 'discussion'   THEN 'discussion'
                 ELSE 'discussion'
               END;

-- 7b. admin_grants backfill from legacy profiles.role
-- Guarded: the `role` column is dropped at the end of this file, so this
-- block must be a no-op on re-runs (e.g. via `supabase db push` after a
-- manual SQL-editor run already dropped the column).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    INSERT INTO public.admin_grants (user_id, admin_type, campus_id, college_id, granted_by)
    SELECT id, 'platform_admin', NULL, NULL, id FROM public.profiles WHERE role = 'platform_admin'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.admin_grants (user_id, admin_type, campus_id, college_id, granted_by)
    SELECT id, 'campus_admin', campus_id, college_id, id FROM public.profiles WHERE role = 'campus_admin'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.admin_grants (user_id, admin_type, community_id, granted_by)
    SELECT p.id, 'community_admin', c.id, p.id
    FROM public.profiles p
    CROSS JOIN public.communities c
    WHERE p.role = 'ambassador'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 7b2. Give campus admins their default moderation capabilities (campus-scoped)
INSERT INTO public.moderation_permissions (user_id, permission_key, scope, campus_id, granted_by)
SELECT g.user_id, v.key, 'campus', g.campus_id, g.user_id
FROM public.admin_grants g
CROSS JOIN (VALUES
  ('post.pin'), ('post.manage'), ('content.moderation'),
  ('report.manage'), ('campus.settings'), ('opportunity.verify')
) AS v(key)
WHERE g.admin_type = 'campus_admin'
ON CONFLICT DO NOTHING;

-- 7c. Remove the legacy role column (faculty/roles are gone)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
