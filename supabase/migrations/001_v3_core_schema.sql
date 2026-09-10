-- ============================================================
-- CampusConnect V3 — Core Schema (migration 001)
-- Student-only, CSE-focused, RBAC + dynamic permission matrix
-- Run in Supabase SQL Editor or via `supabase db push`
-- ============================================================

-- ------------------------------------------------------------
-- 0. Profile changes: no more `role` (dropped in 002 after backfill),
--    add moderation status.
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'banned'));

-- Geo columns on legacy tables (may not exist on some projects)
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS state TEXT;

-- ------------------------------------------------------------
-- 1. Global Communities
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  tagline     TEXT,
  description TEXT,
  icon        TEXT,
  is_global   BOOLEAN NOT NULL DEFAULT TRUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

-- ------------------------------------------------------------
-- 2. Content catalog — categories are DATA (editable, no deploy)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------
-- 3. Unified posts — every post = 1 category × 1 scope
-- ------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.content_categories(id),
  ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('campus', 'college_network', 'global')),
  ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'held', 'removed')),
  ADD COLUMN IF NOT EXISTS share_count INT NOT NULL DEFAULT 0,
  -- category-specific meta (nullable)
  ADD COLUMN IF NOT EXISTS company_org TEXT,
  ADD COLUMN IF NOT EXISTS apply_link TEXT,
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stipend_range TEXT,
  ADD COLUMN IF NOT EXISTS location_type TEXT,
  ADD COLUMN IF NOT EXISTS skills_required JSONB,
  ADD COLUMN IF NOT EXISTS is_verified_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS drive_link TEXT,
  ADD COLUMN IF NOT EXISTS external_link TEXT,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS held_reason TEXT;

-- comments already reference posts; add deleted-at helper if missing
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Saved posts (student bookmarking)
CREATE TABLE IF NOT EXISTS public.saved_posts (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- ------------------------------------------------------------
-- 4. College space entities
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clubs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id  UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  logo_url    TEXT,
  created_by  UUID REFERENCES auth.users(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_members (
  club_id  UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.study_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id  UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  subject     TEXT,
  created_by  UUID REFERENCES auth.users(id),
  max_size    INT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_group_members (
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campus_insights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id    UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT,
  insight_type TEXT NOT NULL DEFAULT 'general',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Legacy tables that may not exist on all projects (kept for the legacy pages)
CREATE TABLE IF NOT EXISTS public.lost_found (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id   UUID REFERENCES public.colleges(id) ON DELETE CASCADE,
  campus_id    UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  posted_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  item_type    TEXT NOT NULL DEFAULT 'lost' CHECK (item_type IN ('lost', 'found')),
  category     TEXT,
  location     TEXT,
  contact_info TEXT,
  is_resolved  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id     UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  event_name    TEXT NOT NULL,
  description   TEXT,
  skills_needed TEXT,
  team_size     INT,
  contact_info  TEXT,
  is_open       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travel_buddies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id       UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  from_location   TEXT NOT NULL,
  to_location     TEXT NOT NULL,
  travel_date     DATE,
  transport_mode  TEXT,
  seats_available INT,
  contact_info    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Faculty feature removed
DROP TABLE IF EXISTS public.meetings;

-- ------------------------------------------------------------
-- 5. Authorization: admin types, grants, dynamic matrix
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.admin_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_type   TEXT NOT NULL REFERENCES public.admin_types(key),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  college_id   UUID REFERENCES public.colleges(id) ON DELETE CASCADE,
  campus_id    UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  granted_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, admin_type, community_id, college_id, campus_id),
  CHECK (admin_type = 'platform_admin' AND community_id IS NULL AND college_id IS NULL AND campus_id IS NULL
         OR admin_type = 'campus_admin'  AND community_id IS NULL
         OR admin_type = 'community_admin' AND campus_id IS NULL AND college_id IS NULL AND community_id IS NOT NULL)
);

-- ★ THE DYNAMIC MATRIX — who can create which category at what scope
CREATE TABLE IF NOT EXISTS public.content_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type  TEXT NOT NULL,          -- 'student' | admin_types.key
  category_id UUID NOT NULL REFERENCES public.content_categories(id) ON DELETE CASCADE,
  max_scope   TEXT CHECK (max_scope IN ('campus', 'college_network', 'global')),  -- NULL = cannot create
  updated_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actor_type, category_id)
);

-- Granular moderation capabilities (kept from v2 design)
CREATE TABLE IF NOT EXISTS public.moderation_permissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL CHECK (permission_key IN
    ('post.pin', 'post.manage', 'opportunity.verify', 'content.moderation',
     'report.manage', 'agent.manage', 'campus.settings', 'ai_agent.configure',
     'users.manage', 'analytics.view')),
  scope       TEXT NOT NULL DEFAULT 'campus' CHECK (scope IN ('campus', 'global')),
  campus_id   UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key, campus_id)
);

-- ------------------------------------------------------------
-- 6. AI layer
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_ai_agents (
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL REFERENCES public.ai_agents(key) ON DELETE CASCADE,
  enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (campus_id, agent_key)
);

CREATE TABLE IF NOT EXISTS public.moderation_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'comment', 'opportunity', 'note')),
  content_id   UUID NOT NULL,
  reason       TEXT,
  source       TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'user_report')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.content_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id   UUID NOT NULL,
  reported_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  handled_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- College email verification tokens
CREATE TABLE IF NOT EXISTS public.college_email_verifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_scope_created   ON public.posts (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category        ON public.posts (category_id);
CREATE INDEX IF NOT EXISTS idx_posts_community       ON public.posts (community_id);
CREATE INDEX IF NOT EXISTS idx_posts_campus          ON public.posts (campus_id);
CREATE INDEX IF NOT EXISTS idx_posts_college         ON public.posts (college_id);
CREATE INDEX IF NOT EXISTS idx_posts_author          ON public.posts (author_id);
CREATE INDEX IF NOT EXISTS idx_comments_post         ON public.post_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_saved_user            ON public.saved_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_campus       ON public.profiles (campus_id);
CREATE INDEX IF NOT EXISTS idx_profiles_college      ON public.profiles (college_id);
CREATE INDEX IF NOT EXISTS idx_profiles_karma        ON public.profiles (karma_points DESC);
CREATE INDEX IF NOT EXISTS idx_queue_status          ON public.moderation_queue (status, created_at);

-- ------------------------------------------------------------
-- 8. Triggers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_updated ON public.posts;
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_new_user ON auth.users;
CREATE TRIGGER trg_new_user AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
