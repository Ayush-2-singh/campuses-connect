'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'

export default function LeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) { setUser(user); const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); setProfile(data) }
      const { data } = await supabase.from('profiles').select('*, departments(short_name)').eq('is_public', true).order('karma_points', { ascending: false }).limit(50)
      setLeaders(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/more')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Leaderboard</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>Top contributors on your campus</p>

        {loading ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaders.map((leader, i) => (
              <div key={leader.id} onClick={() => leader.username && router.push(`/profile/${leader.username}`)}
                style={{ background: 'var(--bg)', border: i < 3 ? '1px solid var(--accent-border)' : '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{medal(i) || `${i + 1}`}</span>
                <Avatar name={leader.full_name} avatarUrl={leader.avatar_url} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{leader.full_name || 'Anonymous'}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{leader.username} {leader.departments?.short_name && `· ${leader.departments.short_name}`}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--yellow-text)', margin: '0 0 2px' }}>⭐ {leader.karma_points || 0}</p>
                  {leader.streak_days > 0 && <p style={{ fontSize: 11, color: 'var(--orange-text)', margin: 0 }}>🔥 {leader.streak_days} streak</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
