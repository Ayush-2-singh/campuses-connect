'use client'

// ═══════════════════════════════════════════════════════════════════════════
// IGL TEAM PANEL — the team captain's self-service surface (spec §7/§24/§10).
// Roster slots render as filled/empty/locked states with the SVG Icon system
// (spec §10: no emoji state markers). Share targets: copy link, copy code.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'
import {
  fetchMyTeam,
  regenerateJoinCode,
  removePlayer,
  rosterState,
  inviteLink,
  type MyTeamInfo,
} from '@/lib/tournaments/rosters'

export default function IglTeamPanel({ tournamentId }: { tournamentId: string }) {
  const supabase = createClient()
  const [team, setTeam] = useState<MyTeamInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    let cancelled = false
    void fetchMyTeam(supabase, tournamentId)
      .then((t) => !cancelled && setTeam(t))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [supabase, tournamentId])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2200)
  }

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      flash(`${label} copied`)
    } catch {
      flash('Copy failed — long-press to copy manually')
    }
  }, [])

  const onRegen = async () => {
    if (!team || busy) return
    setBusy(true)
    try {
      const code = await regenerateJoinCode(supabase, team.team_id)
      setTeam({ ...team, join_code: code })
      flash('New code generated — old one is dead')
    } catch (e: any) {
      flash(e.message || 'Could not regenerate')
    }
    setBusy(false)
  }

  const onRemove = async (playerId: string, name: string) => {
    if (!team || busy) return
    setBusy(true)
    try {
      await removePlayer(supabase, team.team_id, playerId)
      setTeam({ ...team, players: team.players.filter((p) => p.id !== playerId) })
      flash(`${name} removed from roster`)
    } catch (e: any) {
      flash(e.message || 'Could not remove')
    }
    setBusy(false)
  }

  if (loading) return null
  if (!team) return null // the IGL view only exists for leaders

  const filled = team.players.length
  const state = rosterState(filled, team.team_size, team.roster_locked)
  const link = team.join_code ? inviteLink(origin, team.join_code) : null

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 18px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header: team + roster state pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <Icon name="users" size={15} style={{ color: 'var(--accent-text)' }} /> {team.team_name}
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
              state === 'locked'
                ? 'var(--bg-tertiary)'
                : state === 'complete'
                  ? 'var(--success-light)'
                  : 'var(--warning-light)',
            color:
              state === 'locked'
                ? 'var(--text-muted)'
                : state === 'complete'
                  ? 'var(--success-text)'
                  : 'var(--warning-text)',
          }}
        >
          <Icon name={state === 'locked' ? 'lock' : state === 'complete' ? 'check' : 'clock'} size={10} />
          {state === 'locked' ? 'ROSTER LOCKED' : state === 'complete' ? 'COMPLETE' : 'INCOMPLETE'} {filled}/
          {team.team_size}
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        {team.team_tag ? `[${team.team_tag}] · ` : ''}You are the IGL — manage your roster below.
      </p>
      {!team.roster_locked && (
        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Share this code with your teammates to let them join your team.
        </p>
      )}

      {/* Roster slots — filled vs empty (§7 wireframe) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {team.players.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 11px',
              borderRadius: 10,
              background: 'var(--bg-secondary)',
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
              {p.role === 'leader' && (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', marginLeft: 6 }}>IGL</span>
              )}
            </span>
            {p.ff_uid ? (
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }} title={`UID ${p.ff_uid}`}>
                UID ····{p.ff_uid.slice(-4)}
              </span>
            ) : (
              <span style={{ fontSize: 10.5, color: 'var(--warning-text)', flexShrink: 0 }}>no UID</span>
            )}
            {/* IGL can remove self-registered players before lock (server enforces) */}
            {!team.roster_locked && p.role !== 'leader' && (
              <button
                onClick={() => onRemove(p.id, p.name)}
                disabled={busy}
                aria-label={`Remove ${p.name} from roster`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  padding: 2,
                }}
              >
                <Icon name="x" size={13} />
              </button>
            )}
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
            Open slot — share the invite
          </div>
        ))}
      </div>

      {/* Invite controls — hidden entirely once locked (§24) */}
      {!team.roster_locked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {link && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => copy(link, 'Invite link')}
                className="card-hover"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Icon name="link" size={14} /> Copy Invite Link
              </button>
            </div>
          )}
          {team.join_code && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--bg-secondary)',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Join code</span>
              <span
                style={{
                  flex: 1,
                  fontSize: 17,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  color: 'var(--accent-text)',
                  fontFamily: 'monospace',
                }}
              >
                {team.join_code}
              </span>
              <button
                onClick={() => copy(team.join_code!, 'Code')}
                aria-label="Copy join code"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  padding: 3,
                }}
              >
                <Icon name="copy" size={14} />
              </button>
              <button
                onClick={onRegen}
                disabled={busy}
                aria-label="Generate a new join code"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  padding: 3,
                }}
              >
                <Icon name="shuffle" size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {msg && (
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--accent-text)',
            margin: '10px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name="check" size={12} /> {msg}
        </p>
      )}
    </div>
  )
}
