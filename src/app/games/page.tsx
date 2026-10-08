'use client'

/**
 * GAMES — the standalone games section (Games pulled out of Community).
 *
 * Two big game cards, one per game: Typing Battle and Quick Math. Each card
 * advertises the modes the game already offers (Quick Match, room code, the
 * typing daily challenge / the math difficulty ladder) and drops you into the
 * game's own lobby. Tournament / battle-royale content belongs to its own
 * pillar, never here.
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
    desc: 'Same words, fastest fingers win. Race a random student or share a room code with your batch.',
    href: '/games/typing',
    icon: 'type',
    chips: ['Quick Match', 'Room code', 'Daily challenge'],
  },
  {
    key: 'math',
    title: 'Quick Math',
    desc: 'Solve faster, beat the clock. Pick a difficulty, then duel a classmate round by round.',
    href: '/games/math',
    icon: 'zap',
    chips: ['Easy', 'Medium', 'Hard'],
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

  const prefetch = (href: string) => {
    try {
      router.prefetch(href)
    } catch {
      /* ignore */
    }
  }

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

        {/* ── Two big game cards — one per game ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          {GAME_CARDS.map((g) => (
            <div
              key={g.key}
              className="card-hover"
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                boxShadow: 'var(--shadow-sm)',
                padding: '22px 22px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {/* soft accent wash, top-left origin */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(520px 150px at 8% 0%, var(--accent-light), transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={g.icon} size={26} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      color: 'var(--accent-text)',
                      textTransform: 'uppercase',
                      margin: '0 0 3px',
                    }}
                  >
                    Live 1v1 · Real-time rooms
                  </p>
                  <h3
                    style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}
                  >
                    {g.title}
                  </h3>
                </div>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, position: 'relative' }}>{g.desc}</p>

              {/* Mode chips — what the game already offers */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
                {g.chips.map((chip) => (
                  <span
                    key={chip}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 999,
                      padding: '4px 10px',
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <span style={{ flex: 1 }} />

              <button
                onClick={() => router.push(g.href)}
                onMouseEnter={() => prefetch(g.href)}
                style={{
                  position: 'relative',
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Icon name="gamepad" size={16} />
                Play now
              </button>
            </div>
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
