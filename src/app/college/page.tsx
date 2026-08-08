'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'
import PostComposer from '@/components/PostComposer'
import { useAdminContext } from '@/lib/permissions'

const SECTIONS = [
  { icon: '🎭', label: 'Clubs', href: '/college/clubs' },
  { icon: '📅', label: 'Events', href: '/feed?filter=event' },
  { icon: '⚡', label: 'Hackathons', href: '/feed?filter=hackathon' },
  { icon: '💼', label: 'Internships', href: '/feed?filter=internship' },
  { icon: '📢', label: 'Announcements', href: '/feed?filter=announcement' },
  { icon: '📊', label: 'Campus Insights', href: '/college/insights' },
  { icon: '🔍', label: 'Lost & Found', href: '/lost-found' },
  { icon: '👥', label: 'Study Groups', href: '/college/study-groups' },
]

export default function CollegePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  const loadPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label)')
      .or(`college_id.eq.${profile?.college_id || '00000000-0000-0000-0000-000000000000'},scope.eq.global`)
      .eq('community_id', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)
    setPosts(data || [])
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*, colleges(name), campuses(name)').eq('id', user.id).single()
        setProfile(prof)
        await loadPosts()
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {profile?.colleges?.name || 'Your College'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{profile?.campuses?.name || 'College space'} — clubs, events, hackathons, internships and more</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          {SECTIONS.map(s => (
            <button key={s.href} onClick={() => router.push(s.href)}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: 22, display: 'block', marginBottom: 6 }}>{s.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</span>
            </button>
          ))}
        </div>

        {user && admin.isAdmin && profile?.college_id && (
          <PostComposer
            userId={user.id}
            profile={profile}
            onPosted={loadPosts}
            context={{ campusId: profile?.campus_id, collegeId: profile?.college_id }}
            placeholder="Post to your college..."
          />
        )}

        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>College Feed</h3>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>Loading...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>No posts in your college yet.</p>
            ) : posts.map((post: any) => (
              <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user} onChanged={loadPosts} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
