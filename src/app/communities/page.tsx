'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import SectionShell from '@/components/SectionShell'

/**
 * COMMUNITIES — visual pattern only (homepage SectionShell + wide card
 * grid). Every query, the join RPC, gateway routing and memberships logic
 * are EXACTLY as before — only colors/positions changed.
 */
export default function CommunitiesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [communities, setCommunities] = useState<any[]>([])
  const [memberships, setMemberships] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
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

  const toggleJoin = async (communityId: string, key: string) => {
    if (!user) {
      router.replace(
        '/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')
      )
      return
    }
    if (memberships.includes(communityId)) {
      await supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', user.id)
      setMemberships((m) => m.filter((id) => id !== communityId))
      return
    }
    // Joins go through the gateway: test / password / approval flows open the community page.
    const { data } = await supabase.rpc('join_community', { p_community_id: communityId })
    const res = data as string
    if (res === 'joined' || res === 'already') {
      setMemberships((m) => [...m, communityId])
    } else {
      // test_required | wrong_password | pending — full flow lives on the community page
      router.push(`/communities/${key}`)
    }
  }

  return (
    <Layout user={user} profile={profile}>
      <SectionShell
        icon="users"
        title="Global Communities"
        subtitle="Join a community — every CSE student, every college, together."
        stats={[
          { value: communities.length, label: 'Communities' },
          { value: memberships.length, label: 'Joined' },
        ]}
        actions={[
          {
            label: 'Start one',
            icon: 'plus',
            primary: true,
            onClick: () => router.push('/communities'),
          },
        ]}
      >
        <div className="section-grid">
          {communities.map((c) => (
            <div
              key={c.id}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 18,
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: 'var(--accent-light)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {c.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{c.name}</h3>
                  <p style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 700, margin: '2px 0 0' }}>
                    {c.tagline}
                  </p>
                </div>
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                  margin: '10px 0 12px',
                  lineHeight: 1.5,
                  flex: 1,
                }}
              >
                {c.description}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => router.push(`/communities/${c.key}`)}
                  style={{
                    flex: 1,
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    minHeight: 38,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Open
                </button>
                <button
                  onClick={() => toggleJoin(c.id, c.key)}
                  style={{
                    flex: 1,
                    background: memberships.includes(c.id) ? 'var(--bg-secondary)' : 'var(--bg)',
                    color: memberships.includes(c.id) ? 'var(--text-secondary)' : 'var(--accent)',
                    border: memberships.includes(c.id) ? '1px solid var(--border)' : '1px solid var(--accent)',
                    minHeight: 38,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {memberships.includes(c.id) ? '✓ Joined' : 'Join'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </SectionShell>
    </Layout>
  )
}
