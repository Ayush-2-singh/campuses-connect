'use client'

/**
 * GAMES — the standalone games section (Games pulled out of Community).
 *
 * Only games live here: the real-time 1v1 games students actually play
 * (Typing Battle, Quick Math) and the champions board they feed. Tournament /
 * battle-royale content belongs to its own pillar, not this page.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient, getBootUser } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'

const GameChampions = dynamic(() => import('@/components/games/GameChampions'), { ssr: false })

const GAME_CARDS = [
  {
    key: 'typing',
    title: 'Typing Battle',
    desc: 'Quick match or share a room code — same words, fastest fingers win.',
    href: '/games/typing',
    icon: 'type',
    tag: 'Live 1v1 · Real-time rooms',
  },
  {
    key: 'math',
    title: 'Quick Math',
    desc: 'Real-time math duels — solve faster, beat the clock.',
    href: '/games/math',
    icon: 'zap',
    tag: 'Live 1v1 · Real-time rooms',
  },
]

export default function GamesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [profile, setProfile] = useState<{
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
  } | null>(null)

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
      <div className="ambient" style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 96px' }}>
        {/* Header strip — the homepage SectionShell pattern (icon tile + title) */}
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-sm)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'var(--accent-light)',
              color: 'var(--accent-text)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="gamepad" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
              Games
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Play with students in real time — quick 1v1 games.
            </p>
          </div>
          <span style={{ flex: 1 }} />
          <span style={{ textAlign: 'center' }}>
            <span
              style={{
                display: 'block',
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text-primary)',
                lineHeight: 1.15,
              }}
            >
              {GAME_CARDS.length}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Games</span>
          </span>
        </div>

        {/* ── The games ── */}
        <div className="section-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {GAME_CARDS.map((g) => (
            <button
              key={g.key}
              onClick={() => router.push(g.href)}
              onMouseEnter={() => {
                try {
                  router.prefetch(g.href)
                } catch {
                  /* ignore */
                }
              }}
              className="card-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 16,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'inherit',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  background: 'var(--accent-light)',
                  color: 'var(--accent-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                <Icon name={g.icon} size={22} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    color: 'var(--accent-text)',
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}
                >
                  {g.tag}
                </span>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {g.title}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
                  {g.desc}
                </span>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>

        {/* ── Champions board — winners of every game ── */}
        <div style={{ marginTop: 16 }}>
          <GameChampions />
        </div>
      </div>
    </Layout>
  )
}
