'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'
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

const CATEGORIES = [
  { key: 'all', label: 'All', icon: '📄' },
  { key: 'interview_experience', label: 'Interviews', icon: '🎯' },
  { key: 'tech_blog', label: 'Tech', icon: '💻' },
  { key: 'campus_life', label: 'Campus', icon: '🏫' },
  { key: 'how_to', label: 'How-To', icon: '📚' },
  { key: 'project', label: 'Projects', icon: '🚀' },
  { key: 'review', label: 'Reviews', icon: '⭐' },
]

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  interview_experience: { bg: 'var(--accent-light)', text: 'var(--accent-text)' },
  tech_blog: { bg: 'var(--purple-light)', text: 'var(--purple-text)' },
  campus_life: { bg: 'var(--success-light)', text: 'var(--success-text)' },
  how_to: { bg: 'var(--cyan-light)', text: 'var(--cyan-text)' },
  project: { bg: 'var(--orange-light)', text: 'var(--orange-text)' },
  review: { bg: 'var(--yellow-light)', text: 'var(--yellow-text)' },
  general: { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' },
}

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

  const fetchPosts = useCallback(async (offset = 0) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    if (category !== 'all') params.set('category', category)
    if (search.trim()) params.set('q', search.trim())

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
      setPosts(prev => [...prev, ...list])
    }
    setHasMore(list.length === PAGE_SIZE)
    setLoading(false)
    setLoadingMore(false)
  }, [category, search, featured])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
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

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                📝 Blog
              </h1>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                Interview experiences, tech guides, campus stories & more
              </p>
            </div>
            {user && (
              <button
                onClick={() => { haptic.tap(); router.push('/blog/new') }}
                className="btn-shine"
                style={{
                  background: 'var(--accent)', color: 'var(--on-accent)',
                  border: 'none', padding: '10px 20px', borderRadius: 10,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ✍️ Write
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search blogs... (e.g. Google interview, React project)"
            style={{
              width: '100%', border: '1px solid var(--border)', borderRadius: 12,
              padding: '12px 16px 12px 44px', fontSize: 14, outline: 'none',
              fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)',
              boxSizing: 'border-box' as const,
            }}
          />
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>🔍</span>
        </div>

        {/* Category Filters */}
        <div
          className="scrollbar-hide fade-x chips-wrap"
          style={{ display: 'flex', gap: 8, paddingBottom: 4, marginBottom: 24 }}
          role="tablist"
          aria-label="Blog categories"
        >
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => { haptic.tap(); setCategory(cat.key) }}
              role="tab"
              aria-selected={category === cat.key}
              style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 20, fontSize: 13,
                fontWeight: category === cat.key ? 600 : 500,
                border: category === cat.key ? 'none' : '1px solid var(--border)',
                background: category === cat.key ? 'var(--accent)' : 'var(--bg)',
                color: category === cat.key ? 'var(--on-accent)' : 'var(--text-secondary)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Featured Post */}
        {featured && category === 'all' && !search && (
          <div
            onClick={() => { haptic.tap(); router.push(`/blog/${featured.slug}`) }}
            className="card-hover"
            style={{
              background: 'var(--bg)', border: '1px solid var(--accent-border)',
              borderRadius: 16, padding: 24, marginBottom: 24, cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                background: 'var(--accent-light)', color: 'var(--accent-text)',
              }}>
                ⭐ Featured
              </span>
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                ...CATEGORY_COLORS[featured.category],
                fontWeight: 600,
              }}>
                {CATEGORIES.find(c => c.key === featured.category)?.icon} {featured.category.replace('_', ' ')}
              </span>
              {featured.company_name && (
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  background: 'var(--purple-light)', color: 'var(--purple-text)',
                  fontWeight: 600,
                }}>
                  🏢 {featured.company_name}
                </span>
              )}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.3 }}>
              {featured.title}
            </h2>
            {featured.excerpt && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
                {featured.excerpt}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={featured.author_name} avatarUrl={featured.author_avatar} size={28} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {featured.author_name} · {timeAgo(featured.published_at)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                👁 {featured.view_count} · ❤️ {featured.like_count} · 💬 {featured.comment_count}
              </span>
            </div>
          </div>
        )}

        {/* Blog List */}
        {loading ? (
          <ListSkeleton count={4} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="notebook"
            title={search ? `No blogs matching "${search}"` : "No blogs yet"}
            body={search ? "Try different keywords or browse all categories." : "Be the first to share your experience!"}
            cta={user ? "Write a blog" : "Sign in to write"}
            onCta={user ? () => router.push('/blog/new') : () => router.push('/auth/login')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {posts.map(post => {
              const catColor = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.general
              return (
                <article
                  key={post.id}
                  onClick={() => { haptic.tap(); router.push(`/blog/${post.slug}`) }}
                  className="card-hover"
                  style={{
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 14, padding: 20, cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 16 }}>
                    {/* Cover image */}
                    {post.cover_url && (
                      <div style={{
                        width: 120, height: 80, borderRadius: 10, overflow: 'hidden',
                        flexShrink: 0, background: 'var(--bg-tertiary)',
                      }}>
                        <img
                          src={post.cover_url}
                          alt={post.title}
                          loading="lazy"
                          decoding="async"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Tags */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 20,
                          background: catColor.bg, color: catColor.text, fontWeight: 600,
                        }}>
                          {CATEGORIES.find(c => c.key === post.category)?.icon} {post.category.replace('_', ' ')}
                        </span>
                        {post.company_name && (
                          <span style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 20,
                            background: 'var(--purple-light)', color: 'var(--purple-text)',
                            fontWeight: 600,
                          }}>
                            🏢 {post.company_name}
                          </span>
                        )}
                        {post.role && (
                          <span style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 20,
                            background: 'var(--orange-light)', color: 'var(--orange-text)',
                            fontWeight: 600,
                          }}>
                            💼 {post.role}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 style={{
                        fontSize: 17, fontWeight: 700, color: 'var(--text-primary)',
                        margin: '0 0 6px', lineHeight: 1.3,
                      }}>
                        {post.title}
                      </h3>

                      {/* Excerpt */}
                      {post.excerpt && (
                        <p style={{
                          fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px',
                          lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                        }}>
                          {post.excerpt}
                        </p>
                      )}

                      {/* Tags */}
                      {post.tags && post.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                          {post.tags.slice(0, 4).map(tag => (
                            <span key={tag} style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 12,
                              background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                              fontWeight: 500,
                            }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={post.author_name} avatarUrl={post.author_avatar} size={22} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {post.author_name} · {timeAgo(post.published_at)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          👁 {post.view_count} · ❤️ {post.like_count}
                        </span>
                      </div>
                    </div>
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
                  width: '100%', padding: '12px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: loadingMore ? 'var(--text-muted)' : 'var(--accent)',
                  fontSize: 14, fontWeight: 600,
                  cursor: loadingMore ? 'default' : 'pointer',
                  fontFamily: 'inherit', marginTop: 8,
                }}
              >
                {loadingMore ? 'Loading…' : 'Load more blogs'}
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
