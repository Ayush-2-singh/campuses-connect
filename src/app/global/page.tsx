'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /global — the landing dashboard. FUN ONLY.
//
// What a student sees here: who is live in voice right now, the chat groups
// they run/joined, and the Free Fire esports board. The study-shaped blocks
// (hackathons, internships) were removed from this surface — those live in
// their own sections. The feed stays: it is the social half of "masti".
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'
import PostComposer from '@/components/PostComposer'
import EsportsSection from '@/components/esports/EsportsSection'
import { useAdminContext } from '@/lib/permissions'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { Icon } from '@/components/icons'
import LiveRoomBrowser from '@/components/global/LiveRoomBrowser'
import type { Post } from '@/types'

interface MyGroup {
  id: string
  key: string
  name: string
  icon: string | null
}

export default function GlobalPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [myGroups, setMyGroups] = useState<MyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 30
  const supabase = createClient()
  const router = useRouter()
  const admin = useAdminContext(user?.id)

  const POST_SELECT =
    '*, profiles!posts_author_id_fkey(full_name, username, avatar_url, is_verified), content_categories(key, label)'

  const fetchPosts = useCallback(
    async (offset = 0) => {
      const { data } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('scope', 'global')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
      const all = (data as Post[]) || []
      if (offset === 0) setPosts(all)
      else setPosts((prev) => [...prev, ...all])
      setHasMore(all.length === PAGE_SIZE)
      setLoading(false)
      setLoadingMore(false)
    },
    [supabase]
  )

  const loadMore = async () => {
    setLoadingMore(true)
    await fetchPosts(posts.length)
  }

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        // Groups read needs the signed-in id, so it is scoped here.
        const { data: mineRaw } = await supabase
          .from('community_members')
          .select('communities(id, key, name, icon, created_by)')
          .eq('user_id', user.id)
          .eq('status', 'approved')
        const groups = ((mineRaw as any[]) || [])
          .map((r) => r.communities)
          .filter((c) => c && c.created_by)
          .slice(0, 4) as MyGroup[]
        setMyGroups(groups)
      }
      fetchPosts()
    }
    void load()
  }, [fetchPosts, supabase])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 40px' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="globe" size={17} />
            </span>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Global</h2>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '6px 0 0', paddingLeft: 44 }}>
            Voice rooms, your circles and the esports board — all in one place.
          </p>
        </div>

        {/* ── Live Rooms — the free4talk-style board (live rooms float up) ── */}
        <LiveRoomBrowser userId={user?.id ?? null} />

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
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              marginBottom: 16,
            }}
          >
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Browse the global community
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Anyone can read these posts.{' '}
              <span
                style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => router.push('/auth/signup')}
              >
                Join free
              </span>{' '}
              to post, comment and connect nationally.
            </p>
          </div>
        )}

        {/* ── Your chat groups ── circles the students make themselves */}
        <section style={{ marginBottom: 24 }} aria-label="Your chat groups">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Icon name="message" size={16} style={{ color: 'var(--accent-text)' }} />
              Your Groups
            </h3>
            <button
              onClick={() => router.push('/groups')}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--accent)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {myGroups.length > 0 ? 'All groups →' : 'Create one →'}
            </button>
          </div>

          {myGroups.length === 0 ? (
            <div
              style={{
                background: 'var(--bg)',
                border: '1px dashed var(--border-strong, var(--border))',
                borderRadius: 14,
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ display: 'inline-flex', color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true">
                <Icon name="users" size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                  No groups yet
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Make your own circle — batch, hostel wing, gaming squad — or join with a code.
                </p>
              </div>
              <button
                onClick={() => router.push('/groups')}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 15px',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                New group
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => router.push(`/chat/${g.key}`)}
                  className="card-hover"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    textAlign: 'left',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '11px 14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden="true">
                    {g.icon || '💬'}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.name}
                  </span>
                  <span style={{ display: 'inline-flex', color: 'var(--text-muted)', flexShrink: 0 }}>
                    <Icon name="chevron" size={15} />
                  </span>
                </button>
              ))}
              <button
                onClick={() => router.push('/groups')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  border: '1px dashed var(--border-strong, var(--border))',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  borderRadius: 12,
                  padding: '10px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Icon name="plus" size={14} /> New group
              </button>
            </div>
          )}
        </section>

        {/* ── Esports — the Free Fire board + team join by code ── */}
        <EsportsSection signedIn={!!user} isPlatformAdmin={admin.isPlatformAdmin} />

        {/* ── Feed — the social half of the dashboard ── */}
        {loading ? (
          <ListSkeleton count={3} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Recent from Global
              </h3>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>🇮🇳 all of India</span>
            </div>
            {posts.length === 0 ? (
              <EmptyState
                icon="globe"
                title="No global posts yet"
                body={
                  user
                    ? 'Be the first to share something with students everywhere.'
                    : 'Join free to make the first global post.'
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={user?.id}
                    canInteract={!!user}
                    onChanged={() => fetchPosts(0)}
                    isAdmin={admin.isAdmin}
                  />
                ))}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: loadingMore ? 'var(--text-muted)' : 'var(--accent)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loadingMore ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      marginTop: 4,
                    }}
                  >
                    {loadingMore ? 'Loading…' : 'Load more posts'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
