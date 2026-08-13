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

const daysLeft = (deadline: string) => {
  if (!deadline) return null
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: 'Closed', tone: 'var(--text-muted)' }
  if (days === 0) return { label: 'Last day!', tone: 'var(--orange-text)' }
  return { label: `${days}d left`, tone: 'var(--text-secondary)' }
}

export default function GlobalPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [hackathons, setHackathons] = useState<Post[]>([])
  const [internships, setInternships] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  const POST_SELECT = '*, profiles!posts_author_id_fkey(full_name, username, avatar_url, is_verified), content_categories(key, label)'

  const fetchPosts = useCallback(async () => {
    // One global query, split client-side: hackathons get their own block,
    // everything else is the main feed.
    const { data } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('scope', 'global')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60)
    const all = data || []
    setHackathons(all.filter(p => p.categories?.key === 'hackathon').slice(0, 4))
    setPosts(all.filter(p => p.categories?.key !== 'hackathon'))
    setLoading(false)
  }, [supabase])

  const fetchInternships = useCallback(async () => {
    try {
      const res = await fetch('/api/opportunities?opp_type=internship&limit=4', { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setInternships(json.data ?? [])
      }
    } catch {
      /* internships block is optional — hide quietly */
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        fetchInternships()
      }
      fetchPosts()
    }
    load()
  }, [fetchPosts, fetchInternships, supabase])

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
            The Global Campus — open to every student, anywhere in India. Join now, move to your own college when it goes live.
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

        {loading ? (
          <ListSkeleton count={3} />
        ) : (
          <>

            {/* ⚡ Hackathons — separate block */}
            {hackathons.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>⚡ Hackathons</h3>
                  <button onClick={() => router.push('/opportunities?type=hackathon')}
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    View all →
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {hackathons.map(post => (
                    <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user} onChanged={fetchPosts} />
                  ))}
                </div>
              </div>
            )}

            {/* 💼 Internships — separate block (needs an account to read) */}
            {user && internships.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>💼 Internships</h3>
                  <button onClick={() => router.push('/opportunities?type=internship')}
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    View all →
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {internships.map(opp => {
                    const dl = daysLeft(opp.deadline)
                    return (
                      <div key={opp.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>{opp.title}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                              {opp.company_org ? `${opp.company_org} · ` : ''}
                              {opp.is_paid && opp.stipend_range ? `💰 ${opp.stipend_range} · ` : ''}
                              <span style={{ textTransform: 'capitalize' }}>{opp.location_type || 'remote'}</span>
                            </p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                            {dl && <span style={{ fontSize: 11, fontWeight: 600, color: dl.tone }}>{dl.label}</span>}
                            {opp.apply_link && (
                              <a href={opp.apply_link} target="_blank" rel="noopener noreferrer"
                                style={{ background: 'var(--accent)', color: 'var(--on-accent)', padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                                Apply →
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Main feed — recent global posts */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Recent from Global</h3>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>🇮🇳 all of India</span>
            </div>
            {posts.length === 0 && hackathons.length === 0 ? (
              <EmptyState
                icon="globe"
                title="No global posts yet"
                body={user ? 'Be the first to share something with students everywhere.' : 'Join free to make the first global post.'}
              />
            ) : posts.length === 0 ? (
              <EmptyState
                icon="globe"
                title="More posts coming soon"
                body="Hackathons and internships are above — the general feed fills up as students post."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {posts.map(post => (
                  <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user} onChanged={fetchPosts} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
