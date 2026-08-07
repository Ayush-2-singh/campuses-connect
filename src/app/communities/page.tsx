'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function CommunitiesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [communities, setCommunities] = useState<any[]>([])
  const [memberships, setMemberships] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        const { data: mem } = await supabase.from('community_members').select('community_id').eq('user_id', user.id)
        setMemberships((mem || []).map((m: any) => m.community_id))
      }
      const { data } = await supabase.from('communities').select('*').eq('is_active', true)
      setCommunities(data || [])
    }
    load()
  }, [supabase])

  const toggleJoin = async (communityId: string) => {
    if (!user) { router.push('/auth/login'); return }
    if (memberships.includes(communityId)) {
      await supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', user.id)
      setMemberships(m => m.filter(id => id !== communityId))
    } else {
      await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id })
      setMemberships(m => [...m, communityId])
    }
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Global Communities</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Join a community — every CSE student, every college, together.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {communities.map(c => (
            <div key={c.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
                  <span style={{ fontSize: 40, lineHeight: 1 }}>{c.icon}</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{c.name}</h3>
                    <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, margin: '0 0 6px' }}>{c.tagline}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>{c.description}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => router.push(`/communities/${c.key}`)}
                    style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Open
                  </button>
                  <button onClick={() => toggleJoin(c.id)}
                    style={{ background: memberships.includes(c.id) ? 'var(--bg-secondary)' : 'white', color: memberships.includes(c.id) ? 'var(--text-secondary)' : 'var(--accent)', border: memberships.includes(c.id) ? '1px solid var(--border)' : '1px solid var(--accent)', padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {memberships.includes(c.id) ? '✓ Joined' : 'Join'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
