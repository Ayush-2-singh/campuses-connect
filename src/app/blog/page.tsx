'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'
import { useHaptic } from '@/hooks/useMobile'

type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  category: string
  tags: string[]
  company_name: string | null
  role: string | null
  cover_url: string | null
  view_count: number
  like_count: number
  comment_count: number
  published_at: string
  author_name: string
  author_username: string
  author_avatar: string | null
}

type CatDef = { key: string; label: string; icon: string; accent: string; soft: string }

const CATEGORIES: CatDef[] = [
  { key: 'all', label: 'All', icon: 'layers', accent: 'var(--accent)', soft: 'var(--accent-light)' },
  {
    key: 'interview_experience',
    label: 'Interviews',
    icon: 'target',
    accent: 'var(--accent)',
    soft: 'var(--accent-light)',
  },
  { key: 'tech_blog', label: 'Tech', icon: 'code', accent: 'var(--purple-text)', soft: 'var(--purple-light)' },
  { key: 'campus_life', label: 'Campus', icon: 'school', accent: 'var(--success-text)', soft: 'var(--success-light)' },
  { key: 'how_to', label: 'How-To', icon: 'book', accent: 'var(--cyan-text)', soft: 'var(--cyan-light)' },
  { key: 'project', label: 'Projects', icon: 'rocket', accent: 'var(--orange-text)', soft: 'var(--orange-light)' },
  { key: 'review', label: 'Reviews', icon: 'star', accent: 'var(--yellow-text)', soft: 'var(--yellow-light)' },
]

const GENERAL_CAT: CatDef = {
  key: 'general',
  label: 'Blog',
  icon: 'notebook',
  accent: 'var(--text-secondary)',
  soft: 'var(--bg-tertiary)',
}

const catOf = (key: string): CatDef => CATEGORIES.find((c) => c.key === key) || GENERAL_CAT

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const Stat = ({ icon, value }: { icon: string; value: number }) => (
  <span className="blog-stat">
    <Icon name={icon} size={13} strokeWidth={2} />
    {value}
  </span>
)

export default function BlogPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [featured, setFeatured] = useState<BlogPost | null>(null)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 12
  const router = useRouter()
  const supabase = createClient()
  const haptic = useHaptic()

  const fetchPosts = useCallback(
    async (offset = 0) => {
      const { data } = await supabase.rpc('search_blog_posts', {
        search_query: search.trim() || '',
        p_category: category === 'all' ? null : category,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      })

      const list = (data || []) as BlogPost[]
      if (offset === 0) {
        setPosts(list)
        // Featured = first post with most views
        if (!featured && list.length > 0) {
          setFeatured(list.reduce((a, b) => (b.view_count > a.view_count ? b : a)))
        }
      } else {
        setPosts((prev) => [...prev, ...list])
      }
      setHasMore(list.length === PAGE_SIZE)
      setLoading(false)
      setLoadingMore(false)
    },
    [category, search, featured]
  )

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      await fetchPosts()
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPosts([])
    setLoading(true)
    fetchPosts(0)
  }, [category]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    setLoadingMore(true)
    await fetchPosts(posts.length)
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    // Debounce search
    setTimeout(() => {
      setPosts([])
      setLoading(true)
      fetchPosts(0)
    }, 300)
  }

  const featuredCat = featured ? catOf(featured.category) : null

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px 40px' }}>
        {/* Header */}
        <div className="blog-header">
          <div className="blog-header-left">
            <div className="blog-head-tile">
              <Icon name="notebook" size={24} strokeWidth={2} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className="blog-head-title">Blog</h1>
              <p className="blog-head-sub">Interview experiences, tech guides, campus stories &amp; more</p>
            </div>
          </div>
          {user && (
            <button
              onClick={() => {
                haptic.tap()
                router.push('/blog/new')
              }}
              className="btn-shine"
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Icon name="pencil" size={15} strokeWidth={2.2} />
              Write
            </button>
          )}
        </div>

        {/* Search */}
        <div className="blog-search">
          <span className="blog-search-icon">
            <Icon name="search" size={17} strokeWidth={2} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search blogs... (e.g. Google interview, React project)"
            aria-label="Search blogs"
          />
        </div>

        {/* Category Filters */}
        <div
          className="scrollbar-hide fade-x chips-wrap"
          style={{ display: 'flex', gap: 8, paddingBottom: 4, marginBottom: 24 }}
          role="tablist"
          aria-label="Blog categories"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className="blog-chip"
              onClick={() => {
                haptic.tap()
                setCategory(cat.key)
              }}
              role="tab"
              aria-selected={category === cat.key}
              style={{
                ['--chip-accent' as any]: cat.accent,
                ['--chip-soft' as any]: cat.soft,
              }}
            >
              <Icon name={cat.icon} size={14} strokeWidth={2.2} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Featured Post */}
        {featured && featuredCat && category === 'all' && !search && (
          <article
            onClick={() => {
              haptic.tap()
              router.push(`/blog/${featured.slug}`)
            }}
            className="blog-featured"
            aria-label={`Featured post: ${featured.title}`}
          >
            <div className="blog-featured-banner">
              <span className="blog-featured-badge">
                <Icon name="sparkles" size={13} strokeWidth={2.2} />
                Featured
              </span>
              <span className="blog-pill" style={{ background: 'var(--bg)', color: featuredCat.accent }}>
                <Icon name={featuredCat.icon} size={12} strokeWidth={2.2} />
                {featuredCat.label}
              </span>
              {featured.company_name && (
                <span className="blog-pill" style={{ background: 'var(--purple-light)', color: 'var(--purple-text)' }}>
                  <Icon name="building" size={12} strokeWidth={2.2} />
                  {featured.company_name}
                </span>
              )}
              {featured.role && (
                <span className="blog-pill" style={{ background: 'var(--orange-light)', color: 'var(--orange-text)' }}>
                  <Icon name="briefcase" size={12} strokeWidth={2.2} />
                  {featured.role}
                </span>
              )}
            </div>
            <div className="blog-featured-body">
              <h2 className="blog-featured-title">{featured.title}</h2>
              {featured.excerpt && <p className="blog-featured-excerpt">{featured.excerpt}</p>}
              <div className="blog-meta">
                <Avatar name={featured.author_name} avatarUrl={featured.author_avatar} size={28} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {featured.author_name} · {timeAgo(featured.published_at)}
                </span>
                <div style={{ flex: 1 }} />
                <Stat icon="eye" value={featured.view_count} />
                <Stat icon="heart" value={featured.like_count} />
                <Stat icon="message" value={featured.comment_count} />
              </div>
              <div className="blog-card-arrow" style={{ bottom: 16, right: 16 }}>
                <Icon name="chevron" size={15} strokeWidth={2.4} />
              </div>
            </div>
          </article>
        )}

        {/* Blog List */}
        {loading ? (
          <ListSkeleton count={4} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="notebook"
            title={search ? `No blogs matching "${search}"` : 'No blogs yet'}
            body={
              search ? 'Try different keywords or browse all categories.' : 'Be the first to share your experience!'
            }
            cta={user ? 'Write a blog' : 'Sign in to write'}
            onCta={user ? () => router.push('/blog/new') : () => router.push('/auth/login')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {posts.map((post) => {
              const cat = catOf(post.category)
              return (
                <article
                  key={post.id}
                  onClick={() => {
                    haptic.tap()
                    router.push(`/blog/${post.slug}`)
                  }}
                  className="blog-card"
                  style={{
                    ['--blog-accent' as any]: cat.accent,
                    ['--blog-soft' as any]: cat.soft,
                  }}
                >
                  {/* Cover / tinted category thumb */}
                  <div className="blog-thumb">
                    {post.cover_url ? (
                      <img src={post.cover_url} alt={post.title} loading="lazy" decoding="async" />
                    ) : (
                      <Icon name={cat.icon} size={34} strokeWidth={1.6} />
                    )}
                  </div>

                  <div className="blog-card-body">
                    {/* Chips */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span className="blog-pill" style={{ background: cat.soft, color: cat.accent }}>
                        <Icon name={cat.icon} size={12} strokeWidth={2.2} />
                        {cat.label}
                      </span>
                      {post.company_name && (
                        <span
                          className="blog-pill"
                          style={{ background: 'var(--purple-light)', color: 'var(--purple-text)' }}
                        >
                          <Icon name="building" size={12} strokeWidth={2.2} />
                          {post.company_name}
                        </span>
                      )}
                      {post.role && (
                        <span
                          className="blog-pill"
                          style={{ background: 'var(--orange-light)', color: 'var(--orange-text)' }}
                        >
                          <Icon name="briefcase" size={12} strokeWidth={2.2} />
                          {post.role}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="blog-card-title">{post.title}</h3>

                    {/* Excerpt */}
                    {post.excerpt && <p className="blog-card-excerpt">{post.excerpt}</p>}

                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="blog-tags">
                        {post.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="blog-tag">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="blog-meta">
                      <Avatar name={post.author_name} avatarUrl={post.author_avatar} size={22} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {post.author_name} · {timeAgo(post.published_at)}
                      </span>
                      <div style={{ flex: 1 }} />
                      <Stat icon="eye" value={post.view_count} />
                      <Stat icon="heart" value={post.like_count} />
                      {post.comment_count > 0 && <Stat icon="message" value={post.comment_count} />}
                    </div>
                  </div>

                  <div className="blog-card-arrow">
                    <Icon name="chevron" size={15} strokeWidth={2.4} />
                  </div>
                </article>
              )
            })}

            {/* Load More */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  width: '100%',
                  padding: '12px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: loadingMore ? 'var(--text-muted)' : 'var(--accent-text)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loadingMore ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  marginTop: 8,
                  transition: 'border-color 0.16s ease, background 0.16s ease',
                }}
                className="blog-loadmore"
              >
                {loadingMore ? (
                  'Loading…'
                ) : (
                  <>
                    Load more blogs
                    <Icon name="chevron" size={14} strokeWidth={2.4} style={{ transform: 'rotate(90deg)' }} />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
