'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import { CardSkeleton } from '@/components/Skeleton'

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
    }
    const { data } = await supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(full_name, username, avatar_url, is_verified), content_categories(key, label)')
      .eq('id', id)
      .single()
    // RLS returns nothing when the post isn't viewable by this user.
    setPost(data || null)
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { load() }, [load])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => router.back()} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Post</h2>
        </div>

        {loading ? (
          <CardSkeleton rows={2} />
        ) : !post ? (
          <EmptyState
            icon="message"
            title="Post not found"
            body="This post isn't available — it may have been removed or isn't visible to you."
            cta="Back to feed"
            onCta={() => router.push('/feed')}
          />
        ) : (
          <PostCard post={post} currentUserId={user?.id} canInteract={!!user} onChanged={load} />
        )}
      </div>
    </Layout>
  )
}
