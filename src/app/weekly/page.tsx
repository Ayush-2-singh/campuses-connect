'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function WeeklyPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState({ posts: 0, notes: 0, opportunities: 0, newUsers: 0 })
  const [topPosts, setTopPosts] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) { setUser(user); const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); setProfile(data) }
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const [postsRes, notesRes, oppsRes, usersRes, topRes] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('notes').select('id', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('opportunities').select('id', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('profiles').select('id', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('posts').select('*, profiles!posts_author_id_fkey(full_name, username)').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(5)
      ])
      setStats({ posts: postsRes.count || 0, notes: notesRes.count || 0, opportunities: oppsRes.count || 0, newUsers: usersRes.count || 0 })
      setTopPosts(topRes.data || [])
    }
    load()
  }, [])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/more')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Weekly Wrap</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>This week on your campus</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Posts', value: stats.posts, emoji: '📝' },
            { label: 'Notes uploaded', value: stats.notes, emoji: '📚' },
            { label: 'Opportunities', value: stats.opportunities, emoji: '💼' },
            { label: 'New members', value: stats.newUsers, emoji: '👥' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ fontSize: 28, margin: '0 0 4px' }}>{s.emoji}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', margin: '0 0 4px' }}>{s.value}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Recent Posts</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {topPosts.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No posts this week yet</p> :
            topPosts.map(post => (
              <div key={post.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.5 }}>{post.body?.slice(0, 120)}{post.body?.length > 120 ? '...' : ''}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{post.profiles?.username}</p>
              </div>
            ))
          }
        </div>
      </div>
    </Layout>
  )
}
