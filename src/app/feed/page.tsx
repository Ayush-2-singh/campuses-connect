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

const FILTERS = ['all', 'discussion', 'resource', 'notes', 'hackathon', 'internship', 'event', 'announcement', 'project', 'opportunity']

const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  discussion: 'Discussion',
  resource: 'Resource',
  notes: 'Notes',
  hackathon: 'Hackathon',
  internship: 'Internship',
  event: 'Event',
  announcement: 'Announcement',
  project: 'Project',
  opportunity: 'Opportunity',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function FeedPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'campus' | 'global'>('all')
  const [loading, setLoading] = useState(true)
  const [pulse, setPulse] = useState<{ opportunities: number; notes: number; discussions: number; hackathons: number }>({ opportunities: 0, notes: 0, discussions: 0, hackathons: 0 })
  const [mounted, setMounted] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const fetchPosts = useCallback(async () => {
    let q = supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    if (filter !== 'all') q = q.eq('content_categories.key', filter)
    if (scopeFilter !== 'all') q = q.eq('scope', scopeFilter)
    const { data } = await q
    setPosts(data || [])
    setLoading(false)
  }, [filter, scopeFilter, supabase])

  const fetchPulse = useCallback(async () => {
    const now = new Date().toISOString()
    const week = new Date(Date.now() + 7 * 86400000).toISOString()
    const [opps, notes, discussions, hacks] = await Promise.all([
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('notes').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('opp_type', 'hackathon').gte('deadline', now).lte('deadline', week),
    ])
    setPulse({
      opportunities: opps.count || 0,
      notes: notes.count || 0,
      discussions: discussions.count || 0,
      hackathons: hacks.count || 0,
    })
  }, [supabase])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*, colleges(name), campuses(name)').eq('id', user.id).single()
        setProfile(prof)
      }
      fetchPulse()
      fetchPosts()
    }
    load()
  }, [fetchPosts, fetchPulse, supabase])

  const firstName = profile?.full_name?.split(' ')[0]

  const PULSE_CARDS = [
    { key: 'opportunities', icon: 'briefcase', label: 'opportunities', desc: 'open right now', value: pulse.opportunities, href: '/opportunities' },
    { key: 'notes', icon: 'notebook', label: 'notes & resources', desc: 'in the library', value: pulse.notes, href: '/notes' },
    { key: 'discussions', icon: 'message', label: 'discussions', desc: 'happening now', value: pulse.discussions, href: '/feed' },
    { key: 'hackathons', icon: 'zap', label: 'hackathons closing soon', desc: 'within 7 days', value: pulse.hackathons, href: '/opportunities?type=hackathon' },
  ]

  return (
    <Layout user={user} profile={profile}>
      <div className="ambient" style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Campus Pulse header */}
        <div style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {mounted ? (firstName ? `${greeting()}, ${firstName} 👋` : greeting()) : 'Welcome 👋'}
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>Here&apos;s what&apos;s happening around your campus and across India.</p>
        </div>

        {/* Pulse stats — real counts from the database */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
          {PULSE_CARDS.map(c => (
            <button
              key={c.key}
              onClick={() => router.push(c.href)}
              className="card-hover"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={c.icon} size={14} />
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{c.value}</span>
              </div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{c.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{c.desc}</p>
            </button>
          ))}
        </div>

        {user && (
          <PostComposer
            userId={user.id}
            profile={profile}
            onPosted={fetchPosts}
            context={{ campusId: profile?.campus_id, collegeId: profile?.college_id }}
          />
        )}

        {!user && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', margin: '0 0 4px' }}>Browse CampusConnect</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Join your campus community to like, comment and save — or browse the <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/global')}>Global</span> feed.</p>
          </div>
        )}

        {/* Scope tabs — campus vs global */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, marginBottom: 10 }} role="tablist" aria-label="Post scope">
          {([['all', 'All'], ['campus', '🏫 Campus'], ['global', '🌐 Global']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScopeFilter(key)}
              role="tab"
              aria-selected={scopeFilter === key}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: scopeFilter === key ? 'var(--bg)' : 'transparent', color: scopeFilter === key ? 'var(--accent)' : 'var(--text-muted)', boxShadow: scopeFilter === key ? 'var(--shadow-sm)' : 'none' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }} className="scrollbar-hide fade-x" role="tablist" aria-label="Filter posts">
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
            icon="message"
            title={filter === 'all' ? 'No posts yet' : `No ${FILTER_LABELS[filter]?.toLowerCase()} posts yet`}
            body={user ? 'Be the first to post — use the composer above.' : 'Join your campus to post and discuss. Try a different category.'}
            cta={filter !== 'all' ? 'View all posts' : undefined}
            onCta={filter !== 'all' ? () => setFilter('all') : undefined}
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
