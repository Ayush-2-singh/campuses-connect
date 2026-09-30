'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ClashTab — GAMES & CLASH hub
//
//   ┌ HERO: Typing Battle (real-time 1v1) ┐ ┌ side: quick actions ┐
//   ┌ Campus Clash contest ┌ ┌ GameChampions ┘
// The section's green accent flows from the layout shell; icons are the
// shared inline-SVG set — no emoji-as-icon anywhere.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const GameChampions = dynamic(() => import('@/components/games/GameChampions'), { ssr: false })

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const s = Math.floor(ms / 1000),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60
  return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':')
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Inline SVG icon set — one visual language across the hub.
const Icon = ({ d, size = 20, filled = false }: { d: string; size?: number; filled?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

const P = {
  keyboard:
    'M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  keyboardAlt: 'M2 7h20v10H2zM6 11h.01M10 11h.01M14 11h.01M18 11h.01M7 14h10',
  play: 'M7 5l12 7-12 7z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6z',
  users:
    'M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20c0-3 3-4.5 6-4.5s6 1.5 6 4.5M16 4.6a3.5 3.5 0 0 1 0 6.8M17 15.6c2.4.4 5 1.7 5 4.4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 3',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  trophy: 'M4 19h16M4 19 2.5 8l5.5 4L12 4l4 8 5.5-4L20 19',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  gamepad:
    'M6 12h4M8 10v4M15 11h.01M18 13h.01M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258a4 4 0 0 0-3.995-3.742Z',
  target:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  check: 'M20 6 9 17l-5-5',
  pin: 'M12 17v5M9 10.76V5a3 3 0 1 1 6 0v5.76L19 14H5l4-3.24z',
  flame:
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  padlock: 'M7 10V8a5 5 0 0 1 10 0v2M5 10h14v11H5zM12 14.5v3',
}

function StatusDot({ live }: { live: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: live ? 'var(--danger)' : 'var(--warning-text)',
        boxShadow: live ? '0 0 6px var(--danger)' : 'none',
      }}
    />
  )
}

export default function ClashTab({
  contest,
  registered,
  now,
  onRegister,
}: {
  contest: any
  registered: boolean
  now: number
  onRegister: () => void
}) {
  const router = useRouter()

  const isLive = contest && now >= new Date(contest.starts_at).getTime() && now <= new Date(contest.ends_at).getTime()
  const countdown = useMemo(() => {
    if (!contest) return ''
    if (isLive) return fmtCountdown(new Date(contest.ends_at).getTime() - now)
    return fmtCountdown(new Date(contest.starts_at).getTime() - now)
  }, [contest, now, isLive])

  const card = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    boxShadow: 'var(--shadow-sm)',
  } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ═══ HERO — Typing Battle ═══ */}
      <div
        className="card-hover"
        role="link"
        tabIndex={0}
        onClick={() => router.push('/games/typing')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && router.push('/games/typing')}
        style={{
          ...card,
          padding: '22px 22px 24px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          flexWrap: 'wrap',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* soft accent wash, top-left origin */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(600px 160px at 12% 0%, var(--accent-light), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <span
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
            position: 'relative',
          }}
          aria-hidden="true"
        >
          <Icon d={P.keyboard} size={26} />
        </span>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
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
          <h3 style={{ fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Typing Battle
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Quick Match against any student, or create a room and share the code. Same words, fastest fingers win.
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            router.push('/games/typing')
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 12,
            padding: '12px 24px',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <Icon d={P.play} size={15} filled />
          Play Now
        </button>
      </div>

      {/* ═══ Quick actions row ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <button
          onClick={() => router.push('/games/math')}
          className="card-hover"
          style={{
            ...card,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '15px 16px',
            fontSize: 13.5,
            fontWeight: 700,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <span
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
            aria-hidden="true"
          >
            <Icon d={P.gamepad} size={19} />
          </span>
          <span style={{ flex: 1 }}>
            Quick Math
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>
              Real-time math duels
            </span>
          </span>
          <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }} aria-hidden="true">
            <Icon d={P.arrow} size={16} />
          </span>
        </button>

        <button
          onClick={() => router.push('/compete?tab=daily')}
          className="card-hover"
          style={{
            ...card,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '15px 16px',
            fontSize: 13.5,
            fontWeight: 700,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <span
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
            aria-hidden="true"
          >
            <Icon d={P.bolt} size={19} />
          </span>
          <span style={{ flex: 1 }}>
            Daily Challenge
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>
              Today&apos;s DSA problem
            </span>
          </span>
          <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }} aria-hidden="true">
            <Icon d={P.arrow} size={16} />
          </span>
        </button>

        <button
          onClick={() => router.push('/tournaments')}
          className="card-hover"
          style={{
            ...card,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '15px 16px',
            fontSize: 13.5,
            fontWeight: 700,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <span
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
            aria-hidden="true"
          >
            <Icon d={P.trophy} size={19} />
          </span>
          <span style={{ flex: 1 }}>
            Tournaments
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>
              Free Fire &amp; campus esports
            </span>
          </span>
          <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }} aria-hidden="true">
            <Icon d={P.arrow} size={16} />
          </span>
        </button>
      </div>

      {/* ═══ E-SPORTS — Free Fire Tournaments ═══ */}
      <div
        className="card-hover"
        style={{
          ...card,
          padding: '18px 20px',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(420px 120px at 88% 0%, var(--accent-light), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
          }}
          aria-hidden="true"
        >
          <Icon d={P.flame} size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
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
            E-sports Hub
          </p>
          <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Free Fire Tournaments
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
            Squad up for campus Battle Royale — live brackets, verified kills, champion trophies.
          </p>
        </div>
        <button
          onClick={() => router.push('/tournaments')}
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            position: 'relative',
          }}
        >
          Enter Arena
        </button>
      </div>

      {/* ═══ Campus Clash contest + side rail ═══ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        {/* MAIN — contest panel */}
        <div style={{ ...card, padding: '20px 18px', textAlign: 'center' }}>
          {!contest ? (
            <>
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 13,
                  background: 'var(--accent-light)',
                  color: 'var(--accent-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px',
                }}
                aria-hidden="true"
              >
                <Icon d={P.target} size={24} />
              </span>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                Campus Clash
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
                No contest scheduled yet. Check back for the next Clash!
              </p>
            </>
          ) : (
            <>
              <p
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--accent-text)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  margin: '0 0 6px',
                }}
              >
                <Icon d={P.pin} size={12} />
                Campus Clash
              </p>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                {contest.name}
              </h3>
              <p
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  margin: '0 0 4px',
                }}
              >
                <Icon d={P.calendar} size={13} />
                {fmtDate(contest.starts_at)} — {fmtDate(contest.ends_at)}
              </p>
              <p
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  margin: '12px 0 4px',
                  fontVariantNumeric: 'tabular-nums',
                  color: isLive ? 'var(--success-text)' : 'var(--accent-text)',
                }}
              >
                <StatusDot live={isLive} /> {countdown}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
                {isLive
                  ? 'Contest is LIVE — problems are open now!'
                  : now < new Date(contest.starts_at).getTime()
                    ? 'Starts when the timer hits zero.'
                    : 'Contest finished.'}
              </p>
              {registered ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--success-text)',
                    background: 'var(--success-light)',
                    padding: '9px 20px',
                    borderRadius: 10,
                  }}
                >
                  <Icon d={P.check} size={14} />
                  Registered
                </span>
              ) : (
                <button
                  onClick={onRegister}
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Register for {contest.name}
                </button>
              )}
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '14px 0 0', lineHeight: 1.6 }}>
                Every Saturday 9 PM IST · 60 minutes · climb the national + campus boards.
              </p>
            </>
          )}
        </div>

        {/* SIDE — recent activity teaser (real data lives in GameChampions below) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...card, padding: 16 }}>
            <p
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12.5,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: '0 0 4px',
              }}
            >
              <span style={{ display: 'inline-flex', color: 'var(--accent-text)' }} aria-hidden="true">
                <Icon d={P.users} size={15} />
              </span>
              Recent Activity
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
              Live results from finished game rooms — winners stream in below.
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Full-width champions board ═══ */}
      <GameChampions />
    </div>
  )
}
