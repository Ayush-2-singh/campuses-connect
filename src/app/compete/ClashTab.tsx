'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ClashTab — CAMPUS CLASH (the Compete section's weekly contest).
//
// Games no longer live here: they have their own top-level section (/games),
// and battle-royale tournaments have their own pillar. This tab is only the
// contest panel — countdown, registration and the rules line.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react'

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

// Inline SVG icon set — one visual language across the section.
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
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  target:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  check: 'M20 6 9 17l-5-5',
  pin: 'M12 17v5M9 10.76V5a3 3 0 1 1 6 0v5.76L19 14H5l4-3.24z',
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
    <div style={{ ...card, padding: '24px 18px', textAlign: 'center' }}>
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
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Campus Clash</p>
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
  )
}
