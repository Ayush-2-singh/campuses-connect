'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'

export default function SavedPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data } = await supabase
        .from('saved_posts')
        .select('posts(*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      setPosts((data || []).map((s: any) => s.posts).filter(Boolean))
      setLoading(false)
    }
    load()
  }, [supabase, router])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Saved</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>Posts you bookmarked</p>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</p>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔖</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Nothing saved yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Tap Save on any post to find it here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map((post: any) => (
              <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
