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

export default function EsportsSection({
  signedIn,
  isPlatformAdmin = false,
}: {
  signedIn: boolean
  /** Only platform admins may create tournaments (see `create_tournament`). */
  isPlatformAdmin?: boolean
}) {
  const supabase = createClient()
  const router = useRouter()

  const [rows, setRows] = useState<TournamentRow[]>([])
  const [history, setHistory] = useState<EsportsHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ live: 0, upcoming: 0, completed: 0, totalPlayers: 0 })
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [codeErr, setCodeErr] = useState<string | null>(null)
  const [codeValidated, setCodeValidated] = useState(false)
  const [validatedTeamName, setValidatedTeamName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [listRes, historyRes] = await Promise.all([
        supabase.rpc('get_tournaments_list'),
        signedIn ? supabase.rpc('get_my_tournament_history') : Promise.resolve({ data: [] as EsportsHistoryEntry[] }),
      ])
      if (cancelled) return
      // Surface a real failure instead of silently rendering an empty board.
      if (listRes.error) {
        setLoadErr(listRes.error.message)
        setLoading(false)
        return
      }
      setLoadErr(null)
      setRows(((listRes.data as TournamentRow[]) || []).slice(0, 4))
      setHistory((historyRes.data as EsportsHistoryEntry[]) || [])
      const allRows = (listRes.data as TournamentRow[]) || []
      setStats({
        live: allRows.filter((r) => r.status === 'LIVE').length,
        upcoming: allRows.filter((r) => r.status === 'UPCOMING').length,
        completed: allRows.filter((r) => r.status === 'COMPLETED').length,
        totalPlayers: allRows.reduce((acc, r) => acc + (r.team_count || 0) * 4, 0),
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, signedIn])

  /** Validate the code SERVER-side, then hand off to the existing join page. */
  const validateCode = useCallback(
    async (rawCode: string) => {
      const normalized = normalizeTeamCode(rawCode)
      if (normalized.length === 0) {
        setCodeValidated(false)
        setValidatedTeamName(null)
        setCodeErr(null)
        return
      }
      if (!isPlausibleTeamCode(normalized)) {
        setCodeValidated(false)
        setValidatedTeamName(null)
        setCodeErr(JOIN_ERROR_COPY.invalid_code)
        return
      }
      setChecking(true)
      setCodeErr(null)
      const preview = await resolveInvite(supabase, normalized)
      setChecking(false)
      if (!preview.ok) {
        setCodeValidated(false)
        setValidatedTeamName(null)
        const errorKey = preview.error || 'invalid_code'
        setCodeErr(JOIN_ERROR_COPY[errorKey] || JOIN_ERROR_COPY.invalid_code)
        return
      }
      setCodeValidated(true)
      setValidatedTeamName(preview.team_name || null)
      setCodeErr(null)
    },
    [supabase]
  )

  const submitCode = useCallback(async () => {
    const normalized = normalizeTeamCode(code)
    if (checking || normalized.length === 0) return
    if (!signedIn) {
      router.push(`/auth/login?redirect=${encodeURIComponent(joinByCodeHref(normalized))}`)
      return
    }
    setChecking(true)
    setCodeErr(null)
    const preview = await resolveInvite(supabase, normalized)
    setChecking(false)
    if (!preview.ok) {
      setCodeErr(JOIN_ERROR_COPY[preview.error || 'invalid_code'])
      return
    }
    router.push(joinByCodeHref(normalized))
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

      {/* ── Quick Stats ── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'LIVE', value: stats.live, color: 'var(--danger)', bg: 'var(--danger-light)' },
            { label: 'UPCOMING', value: stats.upcoming, color: 'var(--accent-text)', bg: 'var(--accent-light)' },
            { label: 'COMPLETED', value: stats.completed, color: 'var(--text-muted)', bg: 'var(--bg-secondary)' },
            { label: 'SLOTS', value: stats.totalPlayers, color: 'var(--success-text)', bg: 'var(--success-light)' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: s.bg,
                borderRadius: 10,
                padding: '10px 8px',
                textAlign: 'center',
                border: `1px solid ${s.color}20`,
              }}
            >
              <p style={{ fontSize: 18, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1.1 }}>{s.value}</p>
              <p
                style={{
                  fontSize: 9.5,
                  color: 'var(--text-muted)',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {s.label}
              </p>
              {s.label === 'SLOTS' && (
                <p style={{ fontSize: 8.5, color: 'var(--text-muted)', margin: 0, opacity: 0.7 }}>est. slots</p>
              )}
            </div>
          ))}
        </div>
      )}

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
              const raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
              const normalized = normalizeTeamCode(raw).slice(0, TEAM_CODE_LENGTH)
              setCode(normalized)
              void validateCode(normalized)
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
              background:
                normalizeTeamCode(code).length === 0
                  ? 'var(--disabled)'
                  : checking
                    ? 'var(--text-muted)'
                    : codeValidated
                      ? 'var(--success)'
                      : 'var(--accent)',
              color:
                normalizeTeamCode(code).length === 0
                  ? 'var(--text-muted)'
                  : checking
                    ? 'var(--bg)'
                    : codeValidated
                      ? 'var(--bg)'
                      : 'var(--on-accent)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 800,
              cursor: normalizeTeamCode(code).length && !checking ? 'pointer' : 'default',
              fontFamily: 'inherit',
              flexShrink: 0,
              transition: 'all 0.2s ease',
            }}
          >
            {checking ? '…' : 'Join team'}
          </button>
        </div>
        {checking ? (
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: '8px 0 0 2px' }}>
            Checking team code...
          </p>
        ) : codeValidated && validatedTeamName ? (
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--success-text)', margin: '8px 0 0 2px' }}>
            ✓ Team found — {validatedTeamName}
          </p>
        ) : codeErr ? (
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

      {/* ── Create Tournament CTA — platform admins only. The `create_tournament`
          RPC rejects everyone else, so showing it to all signed-in students just
          sent regular players into the admin page's "no access" wall. ── */}
      {signedIn && isPlatformAdmin && (
        <button
          onClick={() => router.push('/tournaments/admin')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 12,
            padding: '11px 16px',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 14,
          }}
        >
          <Icon name="plus" size={16} />
          Create Tournament
        </button>
      )}

      {/* ── Live / upcoming ── */}
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading esports…</p>
      ) : loadErr ? (
        <p style={{ fontSize: 13, color: 'var(--danger-text)', margin: 0 }}>
          Tournaments couldn&apos;t load right now — try again in a moment.
        </p>
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
