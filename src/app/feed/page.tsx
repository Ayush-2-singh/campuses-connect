'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdminContext } from '@/lib/permissions'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'
import PostComposer from '@/components/PostComposer'
import type { Post } from '@/types'

const FILTERS = ['all', 'discussion', 'resource', 'notes', 'hackathon', 'internship', 'event', 'announcement', 'project', 'opportunity']

export default function FeedPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  const fetchPosts = useCallback(async () => {
    let q = supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label)')
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
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Feed</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {profile?.campuses?.name || profile?.colleges?.name || 'Your campus'} — campus, college & global posts
          </p>
        </div>

        {user && admin.isAdmin && (
          <PostComposer
            userId={user.id}
            profile={profile}
            onPosted={fetchPosts}
            context={{ campusId: profile?.campus_id, collegeId: profile?.college_id }}
          />
        )}

        {!user && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', margin: '0 0 4px' }}>Browse CampusConnect</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Join your campus community to like, comment and save.</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }} className="scrollbar-hide">
          {FILTERS.map(type => (
            <button key={type} onClick={() => setFilter(type)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: filter === type ? 'none' : '1px solid var(--border)', background: filter === type ? 'var(--accent)' : 'white', color: filter === type ? 'white' : 'var(--text-secondary)', cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit' }}>
              {type}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</p>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No posts yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {admin.isAdmin ? 'Use the composer above to make the first post.' : 'Admins will post announcements soon.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(post => (
              <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
