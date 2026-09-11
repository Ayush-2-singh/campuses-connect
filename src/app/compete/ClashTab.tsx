'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ClashTab — Games & Clash section
// Extracted from compete/page.tsx for maintainability
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import dynamic from 'next/dynamic'

const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })
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
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Game Champions */}
      <GameChampions />

      {/* Quick Math Game */}
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--accent-border)',
        borderRadius: 16,
        padding: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--accent-light)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            ⚡
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Quick Math</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Real-time mental math battles — no login needed!
            </p>
          </div>
        </div>
        <QuickMath />
      </div>

      {/* Campus Clash Contest */}
      {!contest ? (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '40px 20px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 28, margin: '0 0 8px' }}>🏆</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            No contest scheduled yet. Check back for the next Campus Clash!
          </p>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--accent-border)',
          borderRadius: 16, padding: '22px 20px', boxShadow: 'var(--shadow-sm)', textAlign: 'center',
        }}>
          <p style={{
            fontSize: 12, fontWeight: 700, color: 'var(--accent-text)',
            textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px',
          }}>
            ⚡ Campus Clash
          </p>
          <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            {contest.name}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>
            {fmtDate(contest.starts_at)} — {fmtDate(contest.ends_at)}
          </p>
          <p style={{
            fontSize: 32, fontWeight: 800, margin: '14px 0 6px', fontVariantNumeric: 'tabular-nums',
            color: isLive ? 'var(--danger)' : 'var(--accent)',
          }}>
            {isLive ? '🔴 ' : '⏳ '}{countdown}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
            {isLive
              ? 'Contest is LIVE — problems are open now!'
              : now < new Date(contest.starts_at).getTime()
                ? 'Starts when the timer hits zero.'
                : 'Contest finished.'}
          </p>
          {registered ? (
            <span style={{
              display: 'inline-block', fontSize: 13, fontWeight: 700,
              color: 'var(--success-text)', background: 'var(--success-light)',
              padding: '9px 20px', borderRadius: 10,
            }}>
              ✓ Registered
            </span>
          ) : (
            <button onClick={onRegister} style={{
              background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
              padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Register for {contest.name}
            </button>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 0', lineHeight: 1.6 }}>
            Every Saturday 9 PM IST · 60 minutes · Solve problems, climb the national + campus boards.
          </p>
        </div>
      )}
    </div>
  )
}
