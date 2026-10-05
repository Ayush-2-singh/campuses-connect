'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ESPORTS SECTION — the dashboard's Free Fire block (spec: esports lives here).
//
// Three things a student actually needs on the dashboard, in order:
//   1. MY TEAM      — the tournament you are already in, with your IGN/role
//   2. JOIN BY CODE — paste the 6-char code an IGL shared; server resolves it
//   3. LIVE / UPCOMING — what is on right now, tap into the tournament page
// Everything writes through the existing SECURITY DEFINER RPCs. This
// component never decides what is allowed — the server does (rosters.ts).
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'
import { resolveInvite, JOIN_ERROR_COPY } from '@/lib/tournaments/rosters'
import {
  TEAM_CODE_LENGTH,
  activeTeamEntry,
  esportsRecord,
  gameLabel,
  isPlausibleTeamCode,
  joinByCodeHref,
  normalizeTeamCode,
  placementLabel,
  type EsportsHistoryEntry,
} from '@/lib/esports'

interface TournamentRow {
  id: string
  name: string
  game: string
  status: string
  start_date: string | null
  end_date: string | null
  team_count: number
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  LIVE: { bg: 'var(--success-light)', fg: 'var(--success-text)' },
  UPCOMING: { bg: 'var(--accent-light)', fg: 'var(--accent-text)' },
  COMPLETED: { bg: 'var(--bg-secondary, var(--bg))', fg: 'var(--text-muted)' },
}

export default function EsportsSection({ signedIn }: { signedIn: boolean }) {
  const supabase = createClient()
  const router = useRouter()

  const [rows, setRows] = useState<TournamentRow[]>([])
  const [history, setHistory] = useState<EsportsHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [codeErr, setCodeErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [listRes, historyRes] = await Promise.all([
        supabase.rpc('get_tournaments_list'),
        signedIn ? supabase.rpc('get_my_tournament_history') : Promise.resolve({ data: [] as EsportsHistoryEntry[] }),
      ])
      if (cancelled) return
      setRows(((listRes.data as TournamentRow[]) || []).slice(0, 4))
      setHistory((historyRes.data as EsportsHistoryEntry[]) || [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, signedIn])

  /** Validate the code SERVER-side, then hand off to the existing join page. */
  const submitCode = useCallback(async () => {
    if (checking) return
    if (!isPlausibleTeamCode(code)) {
      setCodeErr(JOIN_ERROR_COPY.invalid_code)
      return
    }
    if (!signedIn) {
      router.push(`/auth/login?redirect=${encodeURIComponent(joinByCodeHref(code))}`)
      return
    }
    setChecking(true)
    setCodeErr(null)
    const preview = await resolveInvite(supabase, normalizeTeamCode(code))
    setChecking(false)
    if (!preview.ok) {
      setCodeErr(JOIN_ERROR_COPY[preview.error || 'invalid_code'])
      return
    }
    router.push(joinByCodeHref(code))
  }, [checking, code, router, signedIn, supabase])

  const myTeam = activeTeamEntry(history)
  const record = esportsRecord(history)

  return (
    <section style={{ marginBottom: 24 }} aria-label="Esports — Free Fire">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <Icon name="gamepad" size={16} style={{ color: 'var(--accent-text)' }} />
          Esports — Free Fire
        </h3>
        <button
          onClick={() => router.push('/tournaments')}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          All tournaments →
        </button>
      </div>

      {/* ── My team — only when the student is actually registered ── */}
      {myTeam && (
        <button
          onClick={() => router.push(`/tournaments/${myTeam.tournament_id}`)}
          className="card-hover"
          style={{
            width: '100%',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg)',
            border: '1px solid var(--accent-border, var(--accent))',
            borderRadius: 14,
            padding: '13px 16px',
            marginBottom: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: 'var(--shadow-sm)',
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
            <Icon name="users" size={18} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
              {myTeam.team_name}
              {myTeam.role === 'leader' ? (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', marginLeft: 6 }}>IGL</span>
              ) : null}
            </span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {myTeam.tournament_name}
              {myTeam.ff_ign ? ` · IGN ${myTeam.ff_ign}` : ''}
              {` · ${myTeam.matches_played} matches`}
            </span>
          </span>
          <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--danger)', flexShrink: 0 }}>
            {myTeam.total_kills}
          </span>
        </button>
      )}

      {/* ── Join with a code ── */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 12,
          marginBottom: codeErr ? 6 : 12,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={(e) => {
              setCode(normalizeTeamCode(e.target.value).slice(0, TEAM_CODE_LENGTH))
              setCodeErr(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitCode()
            }}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={6}
            placeholder="Team code (6 letters)"
            aria-label="Team join code"
            style={{
              flex: 1,
              minWidth: 0,
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '0.18em',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button
            onClick={() => void submitCode()}
            disabled={checking || normalizeTeamCode(code).length === 0}
            style={{
              background: normalizeTeamCode(code).length && !checking ? 'var(--accent)' : 'var(--disabled)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 800,
              cursor: normalizeTeamCode(code).length && !checking ? 'pointer' : 'default',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {checking ? '…' : 'Join team'}
          </button>
        </div>
        {codeErr ? (
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger-text)', margin: '8px 0 0 2px' }}>{codeErr}</p>
        ) : (
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0 2px' }}>
            Got a code from your IGL? Paste it to join the squad.
          </p>
        )}
      </div>

      {/* ── Record ── */}
      {record.tournaments > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Played', value: record.tournaments },
            { label: 'Matches', value: record.matches },
            { label: 'Kills', value: record.kills },
            { label: 'Best', value: placementLabel(record.bestPlacement) },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1,
                background: 'var(--bg-secondary)',
                borderRadius: 10,
                padding: '9px 6px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 9.5, color: 'var(--text-muted)', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Live / upcoming ── */}
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading esports…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          No tournaments yet — the first Free Fire cup is coming.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((t) => {
            const tone = STATUS_TONE[t.status] || STATUS_TONE.COMPLETED
            return (
              <button
                key={t.id}
                onClick={() => router.push(`/tournaments/${t.id}`)}
                className="card-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  textAlign: 'left',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '11px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <span
                  style={{ display: 'inline-flex', color: 'var(--text-secondary)', flexShrink: 0 }}
                  aria-hidden="true"
                >
                  <Icon name="trophy" size={17} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                    {gameLabel(t.game)} · {t.team_count} teams
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: tone.bg,
                    color: tone.fg,
                    flexShrink: 0,
                  }}
                >
                  {t.status}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
