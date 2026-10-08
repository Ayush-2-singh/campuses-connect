'use client'

// ═══════════════════════════════════════════════════════════════════════════
// TEAM REGISTRATION — the missing "player" half of the roster flow (052).
//
// USER → REGISTER TEAM → IGL → code → players join → roster → lock.
// This panel is rendered for anyone who is NOT the IGL of a team:
//   • no team yet        → register a team (name + tag) OR join with a code
//   • registered player  → "my team" card with roster + leave
// Registration state (closed / full / deadline passed) is decided by the
// SERVER (tournament_registration_state) and only mirrored here for display.
// ═══════════════════════════════════════════════════════════════════════════

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'
import { createTournamentTeam, leaveTournamentTeam, teamErrorCopy, type MyTeam } from '@/lib/tournaments/teams'

const STATE_COPY: Record<string, { title: string; body: string; icon: 'lock' | 'clock' | 'users' | 'alert' }> = {
  closed: {
    title: 'Registration is closed',
    body: 'The organizer has closed team registration for this tournament.',
    icon: 'lock',
  },
  not_accepting: {
    title: 'Registration is not open',
    body: 'This tournament is no longer accepting new teams.',
    icon: 'lock',
  },
  deadline_passed: {
    title: 'Registration deadline passed',
    body: 'The registration window for this tournament has closed.',
    icon: 'clock',
  },
  full: {
    title: 'Tournament is full',
    body: 'This tournament has reached its maximum number of teams.',
    icon: 'users',
  },
  invalid: {
    title: 'Registration unavailable',
    body: 'This tournament is not accepting registrations right now.',
    icon: 'alert',
  },
}

const ROLE_LABEL: Record<string, string> = {
  leader: 'IGL',
  player: 'Player',
  substitute: 'Sub',
}

export default function TeamRegistration({
  tournamentId,
  team,
  authed,
  registrationState,
  onReload,
}: {
  tournamentId: string
  team: MyTeam | null
  authed: boolean
  registrationState: string
  onReload: () => void | Promise<void>
}) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2600)
  }

  const register = async () => {
    if (busy || !name.trim()) return
    setBusy(true)
    setErr(null)
    const res = await createTournamentTeam(supabase, tournamentId, name.trim(), tag.trim() || null)
    setBusy(false)
    if (!res.ok) {
      setErr(teamErrorCopy(res.error))
      return
    }
    setName('')
    setTag('')
    await onReload()
  }

  const leave = async () => {
    if (!team || busy) return
    setBusy(true)
    setErr(null)
    const res = await leaveTournamentTeam(supabase, team.team_id)
    setBusy(false)
    if (!res.ok) {
      setErr(teamErrorCopy(res.error))
      return
    }
    await onReload()
    flash('You left the team.')
  }

  const card: React.CSSProperties = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px 18px',
    boxShadow: 'var(--shadow-sm)',
    marginBottom: 18,
  }
  const input: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 13px',
    fontSize: 13.5,
    fontFamily: 'inherit',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  }

  // ── Not logged in: gate the whole flow behind login ──
  if (!authed) {
    return (
      <div style={card}>
        <p
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 14,
            fontWeight: 800,
            margin: '0 0 4px',
            color: 'var(--text-primary)',
          }}
        >
          <Icon name="users" size={15} style={{ color: 'var(--accent-text)' }} /> Register your squad
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Log in to register a team or join one with an invite code.
        </p>
        <Link
          href={`/auth/login?redirect=/tournaments/${tournamentId}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 13.5,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          <Icon name="user" size={14} /> Log in to compete
        </Link>
      </div>
    )
  }

  // ── Registered (non-IGL) player: show the team + roster + leave ──
  if (team) {
    const filled = team.roster.length
    const complete = filled >= team.team_size
    const state = team.roster_locked ? 'locked' : complete ? 'complete' : 'incomplete'
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <h3
            style={{
              flex: 1,
              minWidth: 140,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            <Icon name="users" size={15} style={{ color: 'var(--accent-text)' }} /> {team.team_name}
            {team.team_tag ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>[{team.team_tag}]</span>
            ) : null}
          </h3>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10.5,
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: 9,
              background:
                state === 'locked' ? 'var(--bg-tertiary)' : complete ? 'var(--success-light)' : 'var(--warning-light)',
              color:
                state === 'locked' ? 'var(--text-muted)' : complete ? 'var(--success-text)' : 'var(--warning-text)',
            }}
          >
            <Icon name={state === 'locked' ? 'lock' : complete ? 'check' : 'clock'} size={10} />
            {state === 'locked' ? 'ROSTER LOCKED' : complete ? 'COMPLETE' : 'INCOMPLETE'} {filled}/{team.team_size}
          </span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          You are registered in {team.tournament_name}.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {team.roster.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 11px',
                borderRadius: 10,
                background: p.user_id && p.role !== 'substitute' ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
              }}
            >
              <span style={{ display: 'inline-flex', color: 'var(--success-text)' }} aria-hidden="true">
                <Icon name="check" size={13} />
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: p.role === 'leader' ? 'var(--accent-text)' : 'var(--text-muted)',
                    marginLeft: 6,
                  }}
                >
                  {ROLE_LABEL[p.role] || p.role}
                </span>
              </span>
              {p.ff_ign ? (
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{p.ff_ign}</span>
              ) : null}
            </div>
          ))}
          {Array.from({ length: Math.max(0, team.team_size - filled) }).map((_, i) => (
            <div
              key={`slot-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 11px',
                borderRadius: 10,
                border: '1px dashed var(--border-strong)',
                color: 'var(--text-muted)',
                fontSize: 12.5,
              }}
            >
              <span style={{ display: 'inline-flex' }} aria-hidden="true">
                <Icon name="plus" size={13} />
              </span>
              Open slot — your IGL can invite more players
            </div>
          ))}
        </div>

        {err && <p style={{ fontSize: 12, color: 'var(--danger-text)', margin: '10px 0 0' }}>{err}</p>}
        {msg && (
          <p
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent-text)',
              margin: '10px 0 0',
            }}
          >
            <Icon name="check" size={12} /> {msg}
          </p>
        )}

        {!team.roster_locked && (
          <button
            onClick={leave}
            disabled={busy}
            style={{
              marginTop: 12,
              width: '100%',
              background: 'transparent',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Leaving…' : 'Leave team'}
          </button>
        )}
      </div>
    )
  }

  // ── Not on a team yet ──
  const blocked = registrationState !== 'open'
  if (blocked) {
    const copy = STATE_COPY[registrationState] || STATE_COPY.invalid
    return (
      <div style={card}>
        <p
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 14,
            fontWeight: 800,
            margin: '0 0 4px',
            color: 'var(--text-primary)',
          }}
        >
          <Icon name={copy.icon} size={15} style={{ color: 'var(--text-muted)' }} /> {copy.title}
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>{copy.body}</p>
      </div>
    )
  }

  return (
    <div style={card}>
      <p
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 14,
          fontWeight: 800,
          margin: '0 0 4px',
          color: 'var(--text-primary)',
        }}
      >
        <Icon name="users" size={15} style={{ color: 'var(--accent-text)' }} /> Register your squad
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        Become the IGL, get a team code, then share it so your teammates can join.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          style={{ ...input, flex: 1, minWidth: 150 }}
          placeholder="Team name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Team name"
        />
        <input
          style={{ ...input, width: 96 }}
          placeholder="TAG"
          maxLength={6}
          value={tag}
          onChange={(e) => setTag(e.target.value.toUpperCase())}
          aria-label="Team tag"
        />
      </div>

      {err && <p style={{ fontSize: 12, color: 'var(--danger-text)', margin: '10px 0 0' }}>{err}</p>}

      <button
        onClick={register}
        disabled={busy || name.trim().length < 3}
        style={{
          marginTop: 12,
          width: '100%',
          background: busy || name.trim().length < 3 ? 'var(--disabled, var(--bg-tertiary))' : 'var(--accent)',
          color: 'var(--on-accent)',
          border: 'none',
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 14,
          fontWeight: 800,
          cursor: busy || name.trim().length < 3 ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {busy ? 'Creating team…' : 'Create team & become IGL'}
      </button>

      <p
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-muted)',
          margin: '12px 0 0',
        }}
      >
        <Icon name="link" size={12} />
        <span>
          Already have an invite code?{' '}
          <Link
            href="/tournaments/join"
            style={{ color: 'var(--accent-text)', fontWeight: 700, textDecoration: 'none' }}
          >
            Join a team
          </Link>
        </span>
      </p>
    </div>
  )
}
