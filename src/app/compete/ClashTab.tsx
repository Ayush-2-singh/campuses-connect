'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ClashTab — GAMES & CLASH hub
//
// Desktop game-hub composition (Lichess-style structure, CampusConnect skin):
//   [mode nav: Arena | Daily | Rankings]  (owned by compete/page tabs above)
//   ┌ main: Typing Battle + Campus Clash contest ┐ ┌ side: quick actions ┐
//   └ full-width: recent activity / champions ┘
// The old Programming Arena (DSA/Java/Python/… MCQ grid) was removed — the
// hub leads with the real-time games now.
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

// Inline SVG icon set — no emoji-as-icon, no new icon library (spec §8).
const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

const PATHS = {
  play: 'M7 5l12 7-12 7z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  users:
    'M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3 3-4.5 6-4.5s6 1.5 6 4.5M16 4.6a3.5 3.5 0 010 6.8M17 15.6c2.4.4 5 1.7 5 4.4',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Typing Battle — 1v1 keyboard race (real-time rooms) ───────── */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '18px 18px 20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          ⌨️
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
            Typing Battle
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
            Race another student. Type faster. Make fewer mistakes.
          </p>
        </div>
        <button
          onClick={() => router.push('/games/typing')}
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 10,
            padding: '10px 22px',
            fontSize: 13.5,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          Play Now
        </button>
      </div>

      {/* ── Desktop: main + side rail; mobile: stacked ─────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        {/* MAIN — Campus Clash contest (highlighted panel) */}
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--accent-border, var(--border))',
            borderRadius: 16,
            padding: '20px 18px',
            boxShadow: 'var(--shadow-sm)',
            textAlign: 'center',
          }}
        >
          {!contest ? (
            <>
              <p style={{ fontSize: 26, margin: '0 0 8px' }}>🏆</p>
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
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--accent-text)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  margin: '0 0 6px',
                }}
              >
                Campus Clash
              </p>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                {contest.name}
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                {fmtDate(contest.starts_at)} — {fmtDate(contest.ends_at)}
              </p>
              <p
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  margin: '12px 0 4px',
                  fontVariantNumeric: 'tabular-nums',
                  color: isLive ? 'var(--danger)' : 'var(--accent)',
                }}
              >
                {isLive ? '🔴 ' : '⏳ '}
                {countdown}
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
                    display: 'inline-block',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--success-text)',
                    background: 'var(--success-light)',
                    padding: '9px 20px',
                    borderRadius: 10,
                  }}
                >
                  ✓ Registered
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

        {/* SIDE — quick actions (spec §7). Challenge-a-Friend is honest about
            not existing yet; no fake multiplayer. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => router.push('/games/typing')}
            className="card-hover"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 12,
              padding: '13px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Icon d={PATHS.play} size={18} />
            Start Typing Battle
          </button>
          <button
            onClick={() => router.push('/compete?tab=daily')}
            className="card-hover"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '13px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Icon d={PATHS.bolt} size={18} />
            Daily Challenge
          </button>
          <button
            disabled
            title="Real-time 1v1 MCQ battles are coming soon"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              padding: '13px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'default',
              fontFamily: 'inherit',
            }}
          >
            <Icon d={PATHS.users} size={18} />
            Challenge a Friend
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '2px 6px',
              }}
            >
              Soon
            </span>
          </button>

          {/* Recent/live activity — REAL data only (game winners). */}
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              🔥 Recent Activity
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
              Live results from finished game rooms — winners stream in below.
            </p>
          </div>
        </div>
      </div>

      {/* ── Full-width: champions / recent activity (existing RPC) ────── */}
      <GameChampions />

      {/* Legacy math game entry moved out of the main flow (spec §15): it
          still exists for players who want it, at its own route. */}
      <button
        onClick={() => router.push('/games')}
        style={{
          alignSelf: 'flex-start',
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: 0,
        }}
      >
        Quick Math (real-time rooms) →
      </button>
    </div>
  )
}
