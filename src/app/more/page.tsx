'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { isPulseVisible, readPulsePrefs, setPulseMuted, type PulsePrefs } from '@/lib/livePulsePrefs'
import { Icon } from '@/components/icons'

// V4 IA — kept (hiring-plane) features only. The social plane is retired and
// its routes redirect via src/lib/featureGates.ts, so nothing here may link to
// it (that would dead-end through the gate).
const SECTIONS = [
  {
    icon: 'school',
    label: 'Colleges',
    desc: 'Placement information for your own campus',
    href: '/colleges',
  },
  {
    icon: 'building',
    label: 'Companies',
    desc: 'Explore companies, roles & interview experiences',
    href: '/companies',
  },
  {
    icon: 'pencil',
    label: 'Interview Experiences',
    desc: 'Verified student reviews, tips & difficulty',
    href: '/experiences',
  },
  {
    icon: 'mic',
    label: 'Live Rooms',
    desc: 'Study, read and quiz each other in a voice room',
    href: '/live-voice-chat',
  },
  { icon: 'zap', label: 'Compete', desc: 'Daily DSA challenges & Aura rankings', href: '/compete' },
  { icon: 'trophy', label: 'Leaderboard', desc: 'Top contributors on your campus', href: '/leaderboard' },
  { icon: 'sparkles', label: 'AI Coach', desc: 'Interview & placement prep with AI', href: '/brain' },
  {
    icon: 'link',
    label: 'Integrations',
    desc: 'Connect GitHub & LeetCode to verify your skills',
    href: '/integrations',
  },
  { icon: 'pencil', label: 'Blog', desc: 'Interview experiences, guides & campus stories', href: '/blog' },
  { icon: 'user', label: 'My Profile', desc: 'Your identity, links and activity', href: '/profile' },
  {
    icon: 'school',
    label: 'Change Campus',
    desc: 'Switch to a different campus (ID verification required)',
    href: '/campus-change',
  },
  { icon: 'sparkles', label: 'Premium', desc: 'Unlock AI Coach and advanced prep', href: '/premium' },
  { icon: 'bell', label: 'Notifications', desc: 'Your latest activity', href: '/notifications' },
  { icon: 'clock', label: 'Smart Reminders', desc: 'Never miss a deadline or application', href: '/reminders' },
]

export default function MorePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  // Live-activity card switch — the one place that can always turn the
  // bottom-right flash card back on, no matter how it was silenced (hidden
  // for now / paused 24h / turned off). Read after mount (client-only value).
  const [pulsePrefs, setPulsePrefs] = useState<PulsePrefs | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setPulsePrefs(readPulsePrefs())
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
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
      <div className="page-wrap">
        <div className="hc-page-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="hc-h1">
              Everything else, <em className="hc-em">in one place.</em>
            </h1>
            <p className="hc-lede">Every feature the app ships, grouped so nothing gets lost.</p>
          </div>
        </div>

        {/* Stats Card */}
        {profile && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '20px',
              marginBottom: 20,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
              Your Stats
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div
                style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}
              >
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-text)', margin: '0 0 4px' }}>
                  {profile.aura_points || 0}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name="zap" size={11} style={{ color: 'var(--accent-text)' }} /> Aura (season)
                </p>
              </div>
              <div
                style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}
              >
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--yellow-text)', margin: '0 0 4px' }}>
                  {profile.karma_points || 0}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name="star" size={11} style={{ color: 'var(--yellow-text)' }} /> Karma (lifetime)
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div
                style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}
              >
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--orange-text)', margin: '0 0 4px' }}>
                  {profile.streak_days || 0}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name="flame" size={11} style={{ color: 'var(--orange-text)' }} /> Day Streak
                </p>
              </div>
              <div
                style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px', textAlign: 'center' }}
              >
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--purple-text)', margin: '0 0 4px' }}>
                  {profile.streak_freezes || 0}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name="lock" size={11} style={{ color: 'var(--blue-text)' }} /> Streak Freezes
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/leaderboard')}
              style={{
                width: '100%',
                background: 'var(--accent-light)',
                color: 'var(--accent)',
                border: 'none',
                borderRadius: 10,
                padding: '10px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              View Campus Leaderboard →
            </button>
          </div>
        )}

        {/* Live activity card — always reachable from here */}
        {pulsePrefs && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 20,
              boxShadow: 'var(--shadow-sm)',
              fontFamily: 'inherit',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="zap" size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                Live activity card
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                The bottom-right flash of what is happening right now
              </p>
            </div>
            <button
              role="switch"
              aria-checked={isPulseVisible(pulsePrefs)}
              aria-label="Live activity card on/off"
              onClick={() => setPulsePrefs(setPulseMuted(!pulsePrefs.muted))}
              style={{
                width: 46,
                height: 26,
                borderRadius: 13,
                border: 'none',
                background: isPulseVisible(pulsePrefs) ? 'var(--accent)' : 'var(--border)',
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                fontFamily: 'inherit',
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: isPulseVisible(pulsePrefs) ? 23 : 3,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.18s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              />
            </button>
          </div>
        )}

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SECTIONS.map((s) => (
            <button
              key={s.href}
              onClick={() => router.push(s.href)}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '16px 18px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                boxShadow: 'var(--shadow-sm)',
                fontFamily: 'inherit',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'var(--accent-light)',
                  color: 'var(--accent-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={s.icon} size={19} />
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px' }}>
                  {s.label}
                </p>
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
