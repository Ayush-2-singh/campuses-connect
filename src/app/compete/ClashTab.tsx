'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ClashTab — GAMES & CLASH hub
//
// Desktop game-hub composition (Lichess-style structure, CampusConnect skin):
//   [mode nav: Arena | Daily | Rankings]  (owned by compete/page tabs above)
//   ┌ main: Programming Arena topic grid ┐ ┌ side: quick actions ┐
//   └ full-width: recent activity / champions ┘
// Quick Math moved out of the main surface (it owns /games); the Campus Clash
// contest card stays as a highlighted panel. One MCQ engine (ArenaQuiz) backs
// every topic — no per-topic implementations, no fake multiplayer.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ARENA_TOPICS, getTopic, type ArenaTopicKey } from '@/lib/arena/questions'

const GameChampions = dynamic(() => import('@/components/games/GameChampions'), { ssr: false })
const ArenaQuiz = dynamic(() => import('@/components/games/ArenaQuiz'), { ssr: false })

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
  java: 'M4 20c3-1 13-1 16 0M6 16c0-4 2-6 6-6s6 2 6 6M9 10V7c0-2 6-2 6 0v3',
  python:
    'M12 3c-3 0-4 1.5-4 3v2h5v1H6c-2 0-3 1.5-3 4s1 4 3 4h2v-3c0-2 1.5-3 3-3h4c2 0 3-1 3-3V6c0-1.5-1-3-3-3zM9 6.5h.01M15 17.5h.01M12 21c3 0 4-1.5 4-3v-2h-5v-1h7c2 0 3-1.5 3-4',
  dsa: 'M6 4h5v5H6zM13 15h5v5h-5zM8.5 9v4a2 2 0 002 2h2.5',
  cpp: 'M8 9l-3 3 3 3M16 9l3 3-3 3M13 7l-2 10',
  javascript:
    'M4 5h16v14H4zM9 15c0 1.5-1 2-2 2s-2-.5-2-1.7M13 17c2 0 3-1 3-2.5S15 12 13.5 12 12 11 12 10s1-2 2.5-2 2.3.6 2.5 1.5',
  db: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  dbms: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
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
  const [active, setActive] = useState<ArenaTopicKey | null>(null)

  const isLive = contest && now >= new Date(contest.starts_at).getTime() && now <= new Date(contest.ends_at).getTime()
  const countdown = useMemo(() => {
    if (!contest) return ''
    if (isLive) return fmtCountdown(new Date(contest.ends_at).getTime() - now)
    return fmtCountdown(new Date(contest.starts_at).getTime() - now)
  }, [contest, now, isLive])

  const topic = active ? getTopic(active) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Programming Arena ─────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '18px 18px 20px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
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
            }}
          >
            <Icon d={PATHS.bolt} />
          </span>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Programming Arena
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
              {topic ? `${topic.title} — challenge in progress` : 'Choose your challenge'}
            </p>
          </div>
          {topic && (
            <button
              onClick={() => setActive(null)}
              style={{
                marginLeft: 'auto',
                minHeight: 34,
                padding: '5px 12px',
                borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← All topics
            </button>
          )}
        </div>

        {topic ? (
          <div style={{ marginTop: 10 }}>
            <ArenaQuiz topic={topic} onExit={() => setActive(null)} />
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 10,
            }}
          >
            {ARENA_TOPICS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className="card-hover"
                style={{
                  textAlign: 'left',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
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
                  }}
                >
                  <Icon d={PATHS[t.key] || PATHS.cpp} size={20} />
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>{t.title}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', minHeight: 28, lineHeight: 1.35 }}>
                  {t.desc}
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}
                >
                  <Icon d={PATHS.clock} size={11} />
                  {t.questions.length} questions · MCQ
                </span>
              </button>
            ))}
          </div>
        )}
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
            onClick={() => setActive(ARENA_TOPICS[0].key)}
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
            Start Practice
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
