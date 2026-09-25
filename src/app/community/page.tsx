'use client'

/**
 * COMMUNITY — the community hub (final IA).
 *
 * One entry point that surfaces the EXISTING systems — communities, chat,
 * confessions, compete, live voice — without rebuilding any of them.
 * Confessions' UI entry lives here (spec): the anonymous backend, RPCs, RLS
 * and anonymity-by-design are untouched; the composer/feed is the relocated
 * ConfessionsTab.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, getBootUser } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'
import ConfessionsTab from '@/components/discovery/ConfessionsTab'

const HUB_ITEMS: {
  key: string
  title: string
  desc: string
  icon: string
  accent: string
  accentText: string
  href?: string
  action?: 'confessions'
}[] = [
  {
    key: 'communities',
    title: 'Communities',
    desc: 'Join communities — every CSE student, every college, together',
    icon: 'users',
    accent: 'var(--purple-light)',
    accentText: 'var(--purple-text)',
    href: '/communities',
  },
  {
    key: 'confessions',
    title: 'Confessions',
    desc: 'Anonymous student confessions — react, report, or share your own',
    icon: 'message',
    accent: 'var(--accent-light)',
    accentText: 'var(--accent-text)',
    action: 'confessions',
  },
  {
    key: 'chat',
    title: 'Chat',
    desc: 'Global rooms and your direct conversations',
    icon: 'message',
    accent: 'var(--success-light)',
    accentText: 'var(--success-text)',
    href: '/chat',
  },
  {
    key: 'compete',
    title: 'Compete & Leaderboard',
    desc: 'Daily challenges, DSA clashes and rankings',
    icon: 'zap',
    accent: 'var(--orange-light)',
    accentText: 'var(--orange-text)',
    href: '/compete',
  },
  {
    key: 'live',
    title: 'Live Voice',
    desc: 'Drop into live voice rooms across campuses',
    icon: 'mic',
    accent: 'var(--danger-light)',
    accentText: 'var(--danger)',
    href: '/live-voice-chat',
  },
]

export default function CommunityHubPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [profile, setProfile] = useState<{
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
  } | null>(null)
  const [showConfessions, setShowConfessions] = useState(false)

  // Deep link: /community?view=confessions (used by the desktop sidebar's
  // Confessions child and any legacy /discover confessions links). Also
  // listens for soft-navigates — clicking the sidebar child while already on
  // /community only changes the query, which doesn't remount the page.
  useEffect(() => {
    const apply = () => {
      if (new URLSearchParams(window.location.search).get('view') === 'confessions') setShowConfessions(true)
    }
    apply()
    window.addEventListener('cc-soft-navigate', apply)
    return () => window.removeEventListener('cc-soft-navigate', apply)
  }, [])

  // SPEED: local-session user on the next tick (no auth network round-trip
  // blocking first paint); validation continues in the background.
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      const u = await getBootUser(supabase)
      if (cancelled) return
      setUser(u ? { id: u.id } : null)
      if (u) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .eq('id', u.id)
          .single()
        if (!cancelled) setProfile(prof)
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [supabase])

  return (
    <Layout user={user} profile={profile}>
      {/* Confessions surface — full experience opens in place (spec: Community → Confessions) */}
      {showConfessions ? (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 96px' }}>
          <button
            onClick={() => setShowConfessions(false)}
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
              marginBottom: 14,
            }}
          >
            ← Community
          </button>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
            Confessions
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>
            Anonymous by design — read freely, sign in to react or post.
          </p>
          <ConfessionsTab userId={user?.id ?? null} />
        </div>
      ) : (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 96px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>Community</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>
            Everything social — communities, confessions, chat, compete and live voice.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {HUB_ITEMS.map((item) => {
              const inner = (
                <>
                  <span
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      background: item.accent,
                      color: item.accentText,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={item.icon} size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.title}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12.5,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}
                    >
                      {item.desc}
                    </span>
                  </span>
                  <Icon name="chevron" size={16} />
                </>
              )
              const wrapperStyle: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 14,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'inherit',
                textDecoration: 'none',
              }
              // Client-side navigation (NOT <a href>, which forces a full
              // page reload — the #1 speed killer). Hover prefetch makes the
              // target page render instantly.
              const href = item.href
              return href ? (
                <button
                  key={item.key}
                  onClick={() => router.push(href)}
                  onMouseEnter={() => {
                    try {
                      router.prefetch(href)
                    } catch {
                      /* ignore */
                    }
                  }}
                  style={wrapperStyle}
                >
                  {inner}
                </button>
              ) : (
                <button key={item.key} onClick={() => setShowConfessions(true)} style={wrapperStyle}>
                  {inner}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Layout>
  )
}
