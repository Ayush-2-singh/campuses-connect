'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const SECTIONS = [
  { icon: '🌐', label: 'Global', desc: 'Post & connect with students everywhere', href: '/global' },
  { icon: '⚔️', label: 'Compete', desc: 'Daily DSA challenges, Campus Clash & Aura rankings', href: '/compete' },
  { icon: '🎪', label: 'Events', desc: 'Campus events, hackathons & memories', href: '/events' },
  { icon: '🤝', label: 'Find Teammates', desc: 'Post or join hackathon teams', href: '/teams' },
  { icon: '💬', label: 'Messages', desc: 'Chat with people you\'re connected with', href: '/messages' },
  { icon: '📚', label: 'Notes Library', desc: 'Subject-wise notes, PYQs and resources', href: '/notes' },
  { icon: '⭐', label: 'Talent', desc: 'Discover students by skill', href: '/talent' },
  { icon: '🧠', label: 'AI Brain', desc: 'Your personal academic memory — ask your notes anything', href: '/brain' },
  { icon: '👤', label: 'My Profile', desc: 'Your identity, links and activity', href: '/profile' },
  { icon: '❓', label: 'Ask a Senior', desc: 'Doubt-solving with your college seniors', href: '/ask' },
  { icon: '📊', label: 'Campus Polls', desc: 'Vote on what matters — live results', href: '/polls' },
  { icon: '🌐', label: 'Global Communities', desc: 'DSA, Web Development & Startups', href: '/communities' },
  { icon: '🔖', label: 'Saved', desc: 'Posts you bookmarked', href: '/saved' },
  { icon: '🔍', label: 'Lost & Found', desc: 'Report lost items or return found ones', href: '/lost-found' },
  { icon: '🚂', label: 'Travel Buddies', desc: 'Find campus mates on the same route', href: '/travel' },
  { icon: '🏆', label: 'Leaderboard', desc: 'Top contributors on your campus', href: '/leaderboard' },
  { icon: '📊', label: 'Weekly Wrap', desc: 'This week on your campus', href: '/weekly' },
  { icon: '🔔', label: 'Notifications', desc: 'Your latest activity', href: '/notifications' },
]

export default function MorePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
      }
    }
    load()
  }, [])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>More</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>All features in one place</p>
        </div>

        {/* Stats Card */}
        {profile && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Your Stats</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-text)', margin: '0 0 4px' }}>{profile.aura_points || 0}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Aura ⚡ (season)</p>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--yellow-text)', margin: '0 0 4px' }}>{profile.karma_points || 0}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Karma ⭐ (lifetime)</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--orange-text)', margin: '0 0 4px' }}>{profile.streak_days || 0}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Day Streak 🔥</p>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--purple-text)', margin: '0 0 4px' }}>{profile.streak_freezes || 0}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Freezes ❄️</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/leaderboard')}
              style={{ width: '100%', background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              View Campus Leaderboard →
            </button>
          </div>
        )}

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SECTIONS.map(s => (
            <button
              key={s.href}
              onClick={() => router.push(s.href)}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 28, flexShrink: 0 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px' }}>{s.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{s.desc}</p>
              </div>
              <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  )
}
