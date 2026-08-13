'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'
import PostComposer from '@/components/PostComposer'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { Icon } from '@/components/icons'
import type { Post } from '@/types'

const FILTERS = ['all', 'discussion', 'hackathon', 'opportunity', 'project', 'resource']

const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  discussion: 'Discussion',
  hackathon: 'Hackathon',
  opportunity: 'Opportunity',
  project: 'Project',
  resource: 'Resource',
}

export default function GlobalPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  const fetchPosts = useCallback(async () => {
    let q = supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(full_name, username, avatar_url, is_verified), content_categories(key, label)')
      .eq('scope', 'global')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    if (filter !== 'all') q = q.eq('content_categories.key', filter)
    const { data } = await q
    setPosts(data || [])
    setLoading(false)
  }, [filter, supabase])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      fetchPosts()
    }
    load()
  }, [fetchPosts, supabase])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="globe" size={17} />
            </span>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Global
            </h2>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '6px 0 0', paddingLeft: 44 }}>
            Connect with students everywhere — no campus required. Posts here reach everyone.
          </p>
        </div>

        {user && (
          <PostComposer
            userId={user.id}
            profile={profile}
            onPosted={fetchPosts}
            context={{}} /* no campus context → global scope by default */
            placeholder="Share something with students everywhere..."
          />
        )}

        {!user && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', margin: '0 0 4px' }}>Browse the global community</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Anyone can read these posts. <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/auth/signup')}>Join free</span> to post, comment and connect nationally.
            </p>
          </div>
        )}

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }} className="scrollbar-hide fade-x" role="tablist" aria-label="Filter global posts">
          {FILTERS.map(type => (
            <button key={type} onClick={() => setFilter(type)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: filter === type ? 'none' : '1px solid var(--border)', background: filter === type ? 'var(--accent)' : 'var(--bg)', color: filter === type ? 'var(--on-accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {FILTER_LABELS[type] || type}
            </button>
          ))}
        </div>

        {loading ? (
          <ListSkeleton count={3} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="globe"
            title="No global posts yet"
            body={user ? 'Be the first to share something with students everywhere.' : 'Join free to make the first global post.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(post => (
              <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user} onChanged={fetchPosts} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
