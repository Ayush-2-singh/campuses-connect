-- ═══════════════════════════════════════════════════════════════════════════
-- 044: Blog Section — Interview experiences, tech blogs, campus life
-- ═══════════════════════════════════════════════════════════════════════════

-- Blog posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Content
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT, -- Short description for cards (150 chars)
  body TEXT NOT NULL, -- Full blog content (markdown supported)
  cover_url TEXT, -- Cover image URL
  
  -- Categorization
  category TEXT NOT NULL DEFAULT 'general', -- interview_experience, tech_blog, campus_life, how_to, review, project
  tags TEXT[] DEFAULT '{}', -- Array of tags for filtering
  company_name TEXT, -- For interview experiences (Google, Microsoft, etc.)
  role TEXT, -- For interview experiences (SDE, Intern, etc.)
  
  -- SEO
  meta_title TEXT, -- Custom SEO title (falls back to title)
  meta_description TEXT, -- Custom SEO description (falls back to excerpt)
  
  -- Engagement
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'draft', -- draft, published, archived
  is_featured BOOLEAN DEFAULT false,
  
  -- Timestamps
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags ON blog_posts USING GIN(tags);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_blog_posts_search ON blog_posts 
  USING GIN(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(body, '')));

-- Blog comments
CREATE TABLE IF NOT EXISTS blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  parent_id UUID REFERENCES blog_comments(id) ON DELETE CASCADE, -- For nested replies
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_author ON blog_comments(author_id);

-- Blog likes (bookmarks too)
CREATE TABLE IF NOT EXISTS blog_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_likes_post ON blog_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_likes_user ON blog_likes(user_id);

-- Blog comment likes
CREATE TABLE IF NOT EXISTS blog_comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES blog_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_comment_likes_comment ON blog_comment_likes(comment_id);

ALTER TABLE blog_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog_comment_likes_read" ON blog_comment_likes
  FOR SELECT USING (true);

CREATE POLICY "blog_comment_likes_insert_own" ON blog_comment_likes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "blog_comment_likes_delete_own" ON blog_comment_likes
  FOR DELETE USING (user_id = auth.uid());

-- Toggle comment like
CREATE OR REPLACE FUNCTION toggle_blog_comment_like(p_comment_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_liked BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM blog_comment_likes WHERE comment_id = p_comment_id AND user_id = auth.uid()) THEN
    DELETE FROM blog_comment_likes WHERE comment_id = p_comment_id AND user_id = auth.uid();
    v_liked := false;
  ELSE
    INSERT INTO blog_comment_likes (comment_id, user_id) VALUES (p_comment_id, auth.uid());
    v_liked := true;
  END IF;
  RETURN v_liked;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_likes ENABLE ROW LEVEL SECURITY;

-- Blog posts: anyone can read published posts, authors can manage their own
CREATE POLICY "blog_posts_read_published" ON blog_posts
  FOR SELECT USING (status = 'published' OR author_id = auth.uid());

CREATE POLICY "blog_posts_insert_own" ON blog_posts
  FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY "blog_posts_update_own" ON blog_posts
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "blog_posts_delete_own" ON blog_posts
  FOR DELETE USING (author_id = auth.uid());

-- Blog comments: anyone can read, authors can manage their own
CREATE POLICY "blog_comments_read" ON blog_comments
  FOR SELECT USING (true);

CREATE POLICY "blog_comments_insert_own" ON blog_comments
  FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY "blog_comments_update_own" ON blog_comments
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "blog_comments_delete_own" ON blog_comments
  FOR DELETE USING (author_id = auth.uid());

-- Blog likes: anyone can read, users can manage their own
CREATE POLICY "blog_likes_read" ON blog_likes
  FOR SELECT USING (true);

CREATE POLICY "blog_likes_insert_own" ON blog_likes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "blog_likes_delete_own" ON blog_likes
  FOR DELETE USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC Functions
-- ═══════════════════════════════════════════════════════════════════════════

-- Increment view count
CREATE OR REPLACE FUNCTION increment_blog_views(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE blog_posts SET view_count = view_count + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle like on blog post
CREATE OR REPLACE FUNCTION toggle_blog_like(p_post_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_liked BOOLEAN;
BEGIN
  -- Check if already liked
  IF EXISTS (SELECT 1 FROM blog_likes WHERE post_id = p_post_id AND user_id = auth.uid()) THEN
    DELETE FROM blog_likes WHERE post_id = p_post_id AND user_id = auth.uid();
    UPDATE blog_posts SET like_count = like_count - 1 WHERE id = p_post_id;
    v_liked := false;
  ELSE
    INSERT INTO blog_likes (post_id, user_id) VALUES (p_post_id, auth.uid());
    UPDATE blog_posts SET like_count = like_count + 1 WHERE id = p_post_id;
    v_liked := true;
  END IF;
  RETURN v_liked;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate slug from title
CREATE OR REPLACE FUNCTION generate_blog_slug(title TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(
    regexp_replace(
      regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    ),
    '-+', '-', 'g'
  ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Full-text search for blog posts
CREATE OR REPLACE FUNCTION search_blog_posts(
  search_query TEXT,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  excerpt TEXT,
  category TEXT,
  tags TEXT[],
  company_name TEXT,
  role TEXT,
  cover_url TEXT,
  view_count INTEGER,
  like_count INTEGER,
  comment_count INTEGER,
  published_at TIMESTAMPTZ,
  author_name TEXT,
  author_username TEXT,
  author_avatar TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bp.id,
    bp.title,
    bp.slug,
    bp.excerpt,
    bp.category,
    bp.tags,
    bp.company_name,
    bp.role,
    bp.cover_url,
    bp.view_count,
    bp.like_count,
    bp.comment_count,
    bp.published_at,
    p.full_name AS author_name,
    p.username AS author_username,
    p.avatar_url AS author_avatar,
    ts_rank(
      to_tsvector('english', coalesce(bp.title, '') || ' ' || coalesce(bp.excerpt, '') || ' ' || coalesce(bp.body, '')),
      plainto_tsquery('english', search_query)
    ) AS rank
  FROM blog_posts bp
  JOIN profiles p ON bp.author_id = p.id
  WHERE bp.status = 'published'
    AND (p_category IS NULL OR bp.category = p_category)
    AND (
      search_query = '' 
      OR to_tsvector('english', coalesce(bp.title, '') || ' ' || coalesce(bp.excerpt, '') || ' ' || coalesce(bp.body, '')) 
         @@ plainto_tsquery('english', search_query)
    )
  ORDER BY 
    CASE WHEN search_query = '' THEN bp.published_at END DESC NULLS LAST,
    CASE WHEN search_query != '' THEN ts_rank(
      to_tsvector('english', coalesce(bp.title, '') || ' ' || coalesce(bp.excerpt, '') || ' ' || coalesce(bp.body, '')),
      plainto_tsquery('english', search_query)
    ) END DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
