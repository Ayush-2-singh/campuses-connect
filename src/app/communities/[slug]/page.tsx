'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'
import PostComposer from '@/components/PostComposer'

export default function CommunityPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [community, setCommunity] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [isMember, setIsMember] = useState(false)
  const [isCommunityAdmin, setIsCommunityAdmin] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const supabase = createClient()

  const loadPosts = async () => {
    if (!community) return
    const { data } = await supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label)')
      .eq('community_id', community.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(data || [])
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      const { data: comm } = await supabase.from('communities').select('*').eq('key', slug).single()
      if (!comm) { router.push('/communities'); return }
      setCommunity(comm)
      if (user) {
        const { data: mem } = await supabase.from('community_members').select('id').eq('community_id', comm.id).eq('user_id', user.id).maybeSingle()
        setIsMember(!!mem)
        const { data: grants } = await supabase.rpc('my_admin_grants')
        const g = (grants as any[]) || []
        setIsCommunityAdmin(g.some((x: any) => x.admin_type === 'community_admin' && x.community_id === comm.id))
        setIsPlatformAdmin(g.some((x: any) => x.admin_type === 'platform_admin'))
      }
      const { data: ps } = await supabase
        .from('posts')
        .select('*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label)')
        .eq('community_id', comm.id)
        .order('created_at', { ascending: false })
        .limit(50)
      setPosts(ps || [])
    }
    load()
  }, [slug, supabase, router])

  const toggleJoin = async () => {
    if (!user) { router.push('/auth/login'); return }
    if (isMember) {
      await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', user.id)
      setIsMember(false)
    } else {
      await supabase.from('community_members').insert({ community_id: community.id, user_id: user.id })
      setIsMember(true)
    }
  }

  if (!community) return <Layout user={user} profile={profile}><p style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</p></Layout>

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{ fontSize: 44, lineHeight: 1 }}>{community.icon}</span>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>{community.name}</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{community.tagline}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{community.description}</p>
              </div>
            </div>
            <button onClick={toggleJoin}
              style={{ flexShrink: 0, background: isMember ? 'var(--bg-secondary)' : 'var(--accent)', color: isMember ? 'var(--text-secondary)' : 'var(--on-accent)', border: isMember ? '1px solid var(--border)' : 'none', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {isMember ? '✓ Joined' : 'Join'}
            </button>
          </div>
        </div>

        {user && (isCommunityAdmin || isPlatformAdmin) && (
          <PostComposer
            userId={user.id}
            profile={profile}
            onPosted={loadPosts}
            context={{ communityId: community.id }}
            placeholder={`Post to ${community.name}...`}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Nothing here yet</p>
            </div>
          ) : posts.map((post: any) => (
            <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user && isMember} onChanged={loadPosts} />
          ))}
        </div>
      </div>
    </Layout>
  )
}
