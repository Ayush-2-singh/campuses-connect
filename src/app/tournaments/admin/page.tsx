'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /tournaments/admin — the tournament admin workflow (spec §36–§44, §50).
//
// Sections: setup · stages · matches · teams · results · qualification ·
// announcements · audit. The admin enters FACTS only (placement, kills);
// every total comes from the shared scoring engine for preview and from the
// server RPC for persistence. Locked results need reopen+reason; qualifiers
// are reviewable, reversible and manually overridable with reasons.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'
import { useAdminContext } from '@/lib/permissions'
import {
  calculateTeamScore,
  toCsv,
  validateResultEntry,
  type ScoringConfig,
  type TeamResultInput,
} from '@/lib/tournaments/scoring'

type Section = 'setup' | 'stages' | 'matches' | 'teams' | 'results' | 'qualification' | 'announcements' | 'audit'

interface TournamentRow {
  id: string
  name: string
  game: string
  status: string
  team_size: number
  kill_point_value: number
  description: string | null
  champion_team_id: string | null
}
interface Stage {
  id: string
  name: string
  stage_number: number
  stage_type: string
  qualification_limit: number | null
  status: string
}
interface Match {
  id: string
  stage_id: string
  match_number: number
  status: string
  result_state: string
  result_version: number
  team_count: number
}
interface Team {
  id: string
  team_name: string
  team_tag: string | null
  status: string
  players: { id: string; display_name_snapshot: string; role: string }[]
}
interface AuditRow {
  id: number
  actor_name: string
  action: string
  entity: string
  old_value: any
  new_value: any
  reason: string | null
  created_at: string
}
interface QualifierRow {
  team_id: string
  team_name: string
  total_points: number
  total_kills: number
  qualifies: boolean
}
interface QualificationRecord {
  id: string
  team_id: string
  stage_id: string
  qualification_status: string
  is_manual: boolean
  reason: string | null
}

const SECTIONS: [Section, string, string][] = [
  ['setup', '⚙️', 'Setup'],
  ['stages', '🪜', 'Stages'],
  ['matches', '📅', 'Matches'],
  ['teams', '👥', 'Teams'],
  ['results', '📝', 'Results'],
  ['qualification', '✅', 'Qualification'],
  ['announcements', '📢', 'Announcements'],
  ['audit', '🧾', 'Audit Log'],
]

export default function TournamentAdminPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const admin = useAdminContext(user?.id)

  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [stages, setStages] = useState<Stage[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [rules, setRules] = useState<Record<number, number>>({})
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [quals, setQuals] = useState<QualificationRecord[]>([])
  const [section, setSection] = useState<Section>('setup')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // create form
  const [form, setForm] = useState({ name: '', kill_point_value: 1, team_size: 4, description: '' })
  // result entry
  const [entryStage, setEntryStage] = useState('')
  const [entryMatch, setEntryMatch] = useState<Match | null>(null)
  const [entries, setEntries] = useState<
    {
      team_id: string
      team_name: string
      placement: string
      players: { player_id: string; name: string; kills: string }[]
    }[]
  >([])
  // qualification
  const [qualStage, setQualStage] = useState('')
  const [preview, setPreview] = useState<QualifierRow[]>([])

  const active = tournaments.find((t) => t.id === activeId) || null
  const isAdmin = admin.isPlatformAdmin

  const loadAll = useCallback(async () => {
    if (!isAdmin) return
    const { data: list } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false })
    setTournaments((list as TournamentRow[]) || [])
    const first = (list as TournamentRow[] | null)?.[0]
    if (first && !activeId) setActiveId(first.id)
  }, [supabase, isAdmin, activeId])

  const loadDetail = useCallback(async () => {
    if (!activeId) return
    const [stRes, mRes, tRes, rRes, aRes, qRes] = await Promise.all([
      supabase.from('tournament_stages').select('*').eq('tournament_id', activeId).order('stage_number'),
      supabase
        .from('tournament_matches')
        .select('*, tournament_stages!inner(tournament_id)')
        .eq('tournament_stages.tournament_id', activeId)
        .order('match_number'),
      supabase
        .from('tournament_teams')
        .select('*, tournament_team_players(*)')
        .eq('tournament_id', activeId)
        .order('team_name'),
      supabase.from('tournament_scoring_rules').select('*').eq('tournament_id', activeId),
      supabase
        .from('tournament_audit_log')
        .select('*')
        .eq('tournament_id', activeId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('stage_qualifications').select('*').eq('tournament_id', activeId),
    ])
    setStages((stRes.data as Stage[]) || [])
    setMatches(
      ((mRes.data as any[]) || []).map((m) => ({
        id: m.id,
        stage_id: m.stage_id,
        match_number: m.match_number,
        status: m.status,
        result_state: m.result_state,
        result_version: m.result_version,
        team_count: m.team_count ?? 0,
      }))
    )
    setTeams((tRes.data as any[]) || [])
    setRules(Object.fromEntries(((rRes.data as any[]) || []).map((r) => [r.placement, r.points])))
    setAudit((aRes.data as AuditRow[]) || [])
    setQuals((qRes.data as QualificationRecord[]) || [])
  }, [supabase, activeId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [supabase])
  useEffect(() => {
    void loadAll()
  }, [loadAll])
  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const scoringConfig: ScoringConfig = useMemo(
    () => ({ killPointValue: active?.kill_point_value ?? 1, placementPoints: rules }),
    [active, rules]
  )

  const say = (s: string) => {
    setMsg(s)
    setTimeout(() => setMsg(''), 4000)
  }
  const run = async (fn: () => PromiseLike<any>, ok: string) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (res?.error) {
      say(res.error.message || 'That did not work')
      return null
    }
    say(ok)
    void loadDetail()
    return res
  }

  // ── Setup ──
  const createTournament = async () => {
    if (!form.name.trim()) return
    const { data, error } = await supabase.rpc('create_tournament', {
      p_name: form.name.trim(),
      p_description: form.description.trim() || null,
      p_kill_point_value: form.kill_point_value,
      p_team_size: form.team_size,
    })
    if (error || !data) {
      say(error?.message || 'Could not create')
      return
    }
    await supabase.rpc('set_default_scoring', { p_tournament: data })
    setForm({ name: '', kill_point_value: 1, team_size: 4, description: '' })
    setActiveId(data as string)
    say('Tournament created with the standard 8-slot scoring table')
    void loadAll()
  }

  const setTournamentStatus = async (status: string) => {
    if (!active) return
    await run(
      () => supabase.rpc('update_tournament', { p_tournament: active.id, p_status: status }),
      `Tournament → ${status}`
    )
  }

  const saveRule = async (placement: number, points: number) => {
    await run(
      () =>
        supabase.rpc('set_scoring_rule', {
          p_tournament: activeId,
          p_placement: placement,
          p_points: points,
        }),
      `Placement ${placement} → ${points} pts`
    )
  }

  // ── Stages & matches ──
  const addStage = async (name: string, type: string, limit: string) => {
    await run(
      () =>
        supabase.rpc('add_tournament_stage', {
          p_tournament: activeId,
          p_name: name,
          p_stage_type: type,
          p_qualification_limit: limit ? Number(limit) : null,
        }),
      'Stage added'
    )
  }

  const addMatch = async (stageId: string, number: string, teamIds: string[]) => {
    await run(
      () => supabase.rpc('add_match', { p_stage: stageId, p_match_number: Number(number), p_team_ids: teamIds }),
      'Match created'
    )
  }

  // ── Teams ──
  const addTeam = async (name: string, tag: string, playerNames: string) => {
    const players = playerNames
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((display_name) => ({ display_name }))
    await run(
      () =>
        supabase.rpc('add_tournament_team', {
          p_tournament: activeId,
          p_team_name: name,
          p_team_tag: tag || null,
          p_players: players,
        }),
      'Team added'
    )
  }

  // ── Result entry ──
  const openResultEntry = async (m: Match) => {
    setEntryMatch(m)
    const { data } = await supabase
      .from('match_teams')
      .select('team_id, tournament_teams(team_name, tournament_team_players(id, display_name_snapshot))')
      .eq('match_id', m.id)
    const rows = ((data as any[]) || []).map((r) => {
      const team = Array.isArray(r.tournament_teams) ? r.tournament_teams[0] : r.tournament_teams
      const players = ((team?.tournament_team_players as any[]) || []).map((p) => ({
        player_id: p.id,
        name: p.display_name_snapshot,
        kills: '',
      }))
      return { team_id: r.team_id, team_name: team?.team_name || 'Team', placement: '', players }
    })
    setEntries(rows)
  }

  const liveScores = useMemo(() => {
    if (!entryMatch) return []
    return entries.map((e) =>
      calculateTeamScore(
        {
          team_id: e.team_id,
          placement: e.placement ? Number(e.placement) : null,
          players: e.players.map((p) => ({ player_id: p.player_id, kills: Number(p.kills || 0) })),
        },
        scoringConfig
      )
    )
  }, [entries, entryMatch, scoringConfig])

  const saveResult = async (asDraft: boolean) => {
    if (!entryMatch) return
    const payload: TeamResultInput[] = entries.map((e) => ({
      team_id: e.team_id,
      placement: e.placement ? Number(e.placement) : null,
      players: e.players.map((p) => ({ player_id: p.player_id, kills: Number(p.kills || 0) })),
    }))
    const invalid = validateResultEntry(payload, {
      teamSize: active?.team_size ?? 4,
      maxPlacement: entries.length,
    })
    if (invalid) {
      say(invalid)
      return
    }
    const { data, error } = await supabase.rpc('submit_match_result', {
      p_match: entryMatch.id,
      p_teams: payload,
      p_expected_version: entryMatch.result_version,
      p_as_draft: asDraft,
    })
    if (error || !['ok', 'draft'].includes(data as string)) {
      say(
        data === 'conflict'
          ? 'This result was modified by another admin. Refresh before saving.'
          : data === 'locked'
            ? 'Result is locked — reopen it first'
            : data === 'invalid'
              ? 'Invalid entry — check teams, players and placements'
              : error?.message || 'Could not save'
      )
      return
    }
    say(asDraft ? 'Draft saved' : 'Result submitted — verify it next')
    setEntryMatch(null)
    void loadDetail()
  }

  const lifecycle = async (action: string, reason?: string) => {
    if (!entryMatch && !matches.length) return
    await run(
      () => supabase.rpc('set_match_result_state', { p_match: entryMatch!.id, p_action: action, p_reason: reason }),
      `Result ${action}ed`
    )
  }

  // ── Qualification ──
  const loadPreview = async () => {
    const { data } = await supabase.rpc('preview_stage_qualifiers', { p_stage: qualStage })
    setPreview(((data as any)?.standings as QualifierRow[]) || [])
  }

  const confirmQuals = async () => {
    const res = await run(
      () => supabase.rpc('confirm_stage_qualifications', { p_stage: qualStage }),
      'Qualifications confirmed'
    )
    if (res && res.data !== 'ok') say(String(res.data))
    void loadPreview()
  }

  const reverseQual = async (id: string) => {
    const reason = window.prompt('Reason for reversal (required, min 5 chars):')
    if (!reason) return
    await run(
      () => supabase.rpc('reverse_qualification', { p_qualification: id, p_reason: reason }),
      'Qualification reversed'
    )
  }

  const manualOverride = async (teamId: string, qualify: boolean) => {
    const reason = window.prompt(`Reason for manual ${qualify ? 'qualification' : 'elimination'} (required):`)
    if (!reason) return
    await run(
      () =>
        supabase.rpc('manual_qualification_override', {
          p_stage: qualStage,
          p_team: teamId,
          p_qualify: qualify,
          p_reason: reason,
        }),
      'Override saved'
    )
  }

  // ── Announcement ──
  const addAnnouncement = async (title: string, body: string) => {
    await run(
      () => supabase.rpc('add_tournament_announcement', { p_tournament: activeId, p_title: title, p_body: body }),
      'Announcement published'
    )
  }

  // ── Export (§56) ──
  const exportCsv = async () => {
    const { data } = await supabase.rpc('get_tournament_team_leaderboard', { p_tournament: activeId, p_stage: null })
    const csv = toCsv((data as any[]) || [])
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${active?.name || 'tournament'}-leaderboard.csv`
    a.click()
  }

  if (!admin.loading && !isAdmin) {
    return (
      <Layout user={user}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Tournament admin only
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Ask a platform admin for access. Public results live at /tournaments.
          </p>
        </div>
      </Layout>
    )
  }

  const input = {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '9px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    background: 'var(--bg)',
    color: 'var(--text-primary)',
  } as React.CSSProperties

  const btn = (primary?: boolean) =>
    ({
      background: primary ? 'var(--accent)' : 'var(--bg)',
      color: primary ? 'var(--on-accent)' : 'var(--text-primary)',
      border: primary ? 'none' : '1px solid var(--border)',
      borderRadius: 10,
      padding: '9px 16px',
      fontSize: 13,
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }) as React.CSSProperties

  return (
    <Layout user={user} profile={null}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' }}>
        <h1 style={{ fontSize: 21, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          🏆 Tournament Admin
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Enter facts — placements and raw kills. Everything else is calculated.
        </p>

        {msg && (
          <p role="status" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-text)', margin: '0 0 12px' }}>
            {msg}
          </p>
        )}

        {/* Tournament selector */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <select
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            style={{ ...input, flex: 1, minWidth: 200 }}
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.status})
              </option>
            ))}
          </select>
          {active && active.status !== 'LIVE' && active.status !== 'COMPLETED' && (
            <button onClick={() => setTournamentStatus('LIVE')} style={btn()} disabled={busy}>
              🟢 Go LIVE
            </button>
          )}
          {active && active.status === 'LIVE' && (
            <button onClick={() => setTournamentStatus('COMPLETED')} style={btn()} disabled={busy}>
              Complete
            </button>
          )}
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 18 }}>
          {SECTIONS.map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              aria-pressed={section === key}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 12px',
                borderRadius: 999,
                border: section === key ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                background: section === key ? 'var(--accent-light)' : 'var(--bg)',
                color: section === key ? 'var(--accent-text)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ═══ SETUP ═══ */}
        {section === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>
                New tournament
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  style={input}
                  placeholder="Tournament name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  style={input}
                  placeholder="Description (optional)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...input, flex: 1 }}
                    type="number"
                    min={1}
                    max={10}
                    value={form.kill_point_value}
                    onChange={(e) => setForm({ ...form, kill_point_value: Number(e.target.value) })}
                    title="Kill point value"
                  />
                  <input
                    style={{ ...input, flex: 1 }}
                    type="number"
                    min={1}
                    max={6}
                    value={form.team_size}
                    onChange={(e) => setForm({ ...form, team_size: Number(e.target.value) })}
                    title="Team size"
                  />
                  <button onClick={createTournament} style={btn(true)} disabled={busy || !form.name.trim()}>
                    Create
                  </button>
                </div>
              </div>
            </div>

            {active && (
              <div
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}
              >
                <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>
                  Placement scoring (configurable — no code changes)
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                  Kill point value: <strong>{active.kill_point_value}</strong> per kill
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((p) => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                      <span style={{ fontWeight: 800, color: 'var(--text-secondary)', width: 26 }}>#{p}</span>
                      <input
                        style={{ ...input, width: 70 }}
                        type="number"
                        min={0}
                        defaultValue={rules[p] ?? 0}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v !== (rules[p] ?? 0)) saveRule(p, v)
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ STAGES ═══ */}
        {section === 'stages' && <StageManager stages={stages} onAdd={addStage} busy={busy} input={input} btn={btn} />}

        {/* ═══ MATCHES ═══ */}
        {section === 'matches' && (
          <MatchManager
            stages={stages}
            matches={matches}
            teams={teams}
            onAdd={addMatch}
            busy={busy}
            input={input}
            btn={btn}
          />
        )}

        {/* ═══ TEAMS ═══ */}
        {section === 'teams' && <TeamManager teams={teams} onAdd={addTeam} busy={busy} input={input} btn={btn} />}

        {/* ═══ RESULTS ═══ */}
        {section === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!entryMatch ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    style={{ ...input, flex: 1, minWidth: 160 }}
                    value={entryStage}
                    onChange={(e) => setEntryStage(e.target.value)}
                  >
                    <option value="">Select stage…</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {matches
                    .filter((m) => !entryStage || m.stage_id === entryStage)
                    .map((m) => {
                      const stage = stages.find((s) => s.id === m.stage_id)
                      return (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: '11px 14px',
                          }}
                        >
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {stage?.name} · Match {m.match_number}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                              {' '}
                              · v{m.result_version}
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: m.result_state === 'LOCKED' ? 'var(--success-light)' : 'var(--accent-light)',
                              color: m.result_state === 'LOCKED' ? 'var(--success-text)' : 'var(--accent-text)',
                            }}
                          >
                            {m.result_state}
                          </span>
                          <button onClick={() => openResultEntry(m)} style={btn(m.result_state === 'NONE')}>
                            {m.result_state === 'NONE' ? 'Enter Results' : 'Edit'}
                          </button>
                        </div>
                      )
                    })}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                  {stages.find((s) => s.id === entryMatch.stage_id)?.name} · Match {entryMatch.match_number} — RESULT
                  ENTRY
                </p>
                {entries.map((e, ti) => {
                  const calc = liveScores[ti]
                  return (
                    <div
                      key={e.team_id}
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {e.team_name}
                        </span>
                        <label
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          Placement
                          <input
                            style={{ ...input, width: 64 }}
                            type="number"
                            min={1}
                            value={e.placement}
                            onChange={(ev) =>
                              setEntries((rows) =>
                                rows.map((r, i) => (i === ti ? { ...r, placement: ev.target.value } : r))
                              )
                            }
                          />
                        </label>
                      </div>
                      {e.players.map((p, pi) => (
                        <div
                          key={p.player_id}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}
                        >
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{p.name}</span>
                          <input
                            style={{ ...input, width: 70 }}
                            type="number"
                            min={0}
                            placeholder="kills"
                            value={p.kills}
                            onChange={(ev) =>
                              setEntries((rows) =>
                                rows.map((r, i) =>
                                  i === ti
                                    ? {
                                        ...r,
                                        players: r.players.map((pp, j) =>
                                          j === pi ? { ...pp, kills: ev.target.value } : pp
                                        ),
                                      }
                                    : r
                                )
                              )
                            }
                          />
                        </div>
                      ))}
                      {/* LIVE PREVIEW — read-only, from the shared engine */}
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 8,
                          borderTop: '1px dashed var(--border)',
                          display: 'flex',
                          gap: 16,
                          fontSize: 12,
                          fontWeight: 800,
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span>{calc?.total_kills} kills</span>
                        <span>{calc?.kill_points} KP</span>
                        <span>{calc?.placement_points} PP</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--accent-text)', fontSize: 14 }}>
                          TOTAL {calc?.total_points}
                        </span>
                      </div>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => saveResult(true)} style={btn()} disabled={busy}>
                    Save Draft
                  </button>
                  <button onClick={() => saveResult(false)} style={btn(true)} disabled={busy}>
                    Submit Result
                  </button>
                  <button onClick={() => setEntryMatch(null)} style={btn()}>
                    Cancel
                  </button>
                </div>
                {/* Lifecycle on an already-submitted result */}
                {entryMatch.result_state !== 'NONE' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {entryMatch.result_state === 'SUBMITTED' && (
                      <button onClick={() => lifecycle('verify')} style={btn(true)} disabled={busy}>
                        ✓ Verify
                      </button>
                    )}
                    {entryMatch.result_state === 'VERIFIED' && (
                      <button onClick={() => lifecycle('lock')} style={btn(true)} disabled={busy}>
                        🔒 Lock Result
                      </button>
                    )}
                    {entryMatch.result_state === 'LOCKED' && (
                      <button
                        onClick={() => {
                          const reason = window.prompt('Reason for reopening a LOCKED result (required, min 5 chars):')
                          if (reason) lifecycle('reopen', reason)
                        }}
                        style={btn()}
                        disabled={busy}
                      >
                        🔓 Reopen (audited)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ QUALIFICATION ═══ */}
        {section === 'qualification' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                style={{ ...input, flex: 1, minWidth: 160 }}
                value={qualStage}
                onChange={(e) => setQualStage(e.target.value)}
              >
                <option value="">Select stage…</option>
                {stages
                  .filter((s) => s.qualification_limit)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (top {s.qualification_limit})
                    </option>
                  ))}
              </select>
              <button onClick={loadPreview} style={btn()} disabled={!qualStage}>
                Review Qualifiers
              </button>
              <button onClick={confirmQuals} style={btn(true)} disabled={!qualStage || busy}>
                Confirm Qualification
              </button>
            </div>

            {preview.map((q) => {
              const rec = quals.find((x) => x.team_id === q.team_id && x.stage_id === qualStage)
              return (
                <div
                  key={q.team_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: q.qualifies ? 'var(--success-light)' : 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '11px 14px',
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {q.qualifies ? '✓ ' : '✗ '}
                    {q.team_name}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {' '}
                      · {q.total_points} pts · {q.total_kills} kills
                    </span>
                    {rec?.is_manual && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--orange-text, var(--text-muted))' }}>
                        {' '}
                        · MANUAL
                      </span>
                    )}
                  </span>
                  {rec?.qualification_status === 'REVERSED' && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--danger)' }}>REVERSED</span>
                  )}
                  {rec?.qualification_status === 'QUALIFIED' && (
                    <button onClick={() => reverseQual(rec.id)} style={btn()} disabled={busy}>
                      Reverse
                    </button>
                  )}
                  <button onClick={() => manualOverride(q.team_id, !q.qualifies)} style={btn()} disabled={busy}>
                    {q.qualifies ? 'Eliminate' : 'Qualify'}
                  </button>
                </div>
              )
            })}

            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
              Reversals and manual overrides are permanent audit records — history is never deleted.
            </p>
          </div>
        )}

        {/* ═══ ANNOUNCEMENTS ═══ */}
        {section === 'announcements' && (
          <AnnouncementManager onAdd={addAnnouncement} busy={busy} input={input} btn={btn} />
        )}

        {/* ═══ AUDIT ═══ */}
        {section === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {audit.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No actions logged yet.</p>
            ) : (
              audit.map((a) => (
                <div
                  key={a.id}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '9px 12px',
                  }}
                >
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {a.action} · {a.entity}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {' '}
                      — {a.actor_name} · {new Date(a.created_at).toLocaleString()}
                    </span>
                  </p>
                  {(a.old_value || a.new_value || a.reason) && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      {a.old_value ? `${JSON.stringify(a.old_value)} → ` : ''}
                      {a.new_value ? JSON.stringify(a.new_value) : ''}
                      {a.reason ? ` · "${a.reason}"` : ''}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Export */}
        {active && (
          <button
            onClick={exportCsv}
            style={{ ...btn(), marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="download" size={14} /> Export team leaderboard (CSV)
          </button>
        )}
      </div>
    </Layout>
  )
}

// ── Section sub-components ────────────────────────────────────────────────────

function StageManager({
  stages,
  onAdd,
  busy,
  input,
  btn,
}: {
  stages: Stage[]
  onAdd: (name: string, type: string, limit: string) => void
  busy: boolean
  input: React.CSSProperties
  btn: (p?: boolean) => React.CSSProperties
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState('QUALIFIER')
  const [limit, setLimit] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>Add stage</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...input, flex: 1, minWidth: 140 }}
            placeholder="Day 1 / Grand Final"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select style={input} value={type} onChange={(e) => setType(e.target.value)}>
            <option>QUALIFIER</option>
            <option>SEMIFINAL</option>
            <option>FINAL</option>
          </select>
          <input
            style={{ ...input, width: 90 }}
            type="number"
            min={1}
            placeholder="top N"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
          <button
            onClick={() => name.trim() && (onAdd(name.trim(), type, limit), setName(''), setLimit(''))}
            style={btn(true)}
            disabled={busy}
          >
            Add
          </button>
        </div>
      </div>
      {stages.map((s) => (
        <div
          key={s.id}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '11px 14px',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            #{s.stage_number} {s.name}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)' }}>
            {s.stage_type}
            {s.qualification_limit ? ` · top ${s.qualification_limit}` : ''} · {s.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function MatchManager({
  stages,
  matches,
  teams,
  onAdd,
  busy,
  input,
  btn,
}: {
  stages: Stage[]
  matches: Match[]
  teams: Team[]
  onAdd: (stageId: string, number: string, teamIds: string[]) => void
  busy: boolean
  input: React.CSSProperties
  btn: (p?: boolean) => React.CSSProperties
}) {
  const [stageId, setStageId] = useState('')
  const [number, setNumber] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const stage = stages.find((s) => s.id === stageId)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>
          Create match
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select
            style={{ ...input, flex: 1, minWidth: 140 }}
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            <option value="">Stage…</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.stage_number} {s.name}
              </option>
            ))}
          </select>
          <input
            style={{ ...input, width: 90 }}
            type="number"
            min={1}
            placeholder="No."
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 6px' }}>
          Participating teams ({selected.size} selected)
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() =>
                setSelected((s) => {
                  const n = new Set(s)
                  if (n.has(t.id)) n.delete(t.id)
                  else n.add(t.id)
                  return n
                })
              }
              style={{
                ...input,
                cursor: 'pointer',
                borderColor: selected.has(t.id) ? 'var(--accent)' : 'var(--border)',
                background: selected.has(t.id) ? 'var(--accent-light)' : 'var(--bg)',
                fontWeight: selected.has(t.id) ? 800 : 500,
              }}
            >
              {t.team_name}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            stageId && number && (onAdd(stageId, number, [...selected]), setSelected(new Set()), setNumber(''))
          }
          style={btn(true)}
          disabled={busy || !stageId || !number || selected.size < 2}
        >
          Create match
        </button>
      </div>
      {matches.map((m) => (
        <div
          key={m.id}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '11px 14px',
            display: 'flex',
            gap: 10,
          }}
        >
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {stages.find((s) => s.id === m.stage_id)?.name} · Match {m.match_number}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)' }}>
            {m.status} · {m.result_state}
          </span>
        </div>
      ))}
      {stage && matches.length === 0 && null}
    </div>
  )
}

function TeamManager({
  teams,
  onAdd,
  busy,
  input,
  btn,
}: {
  teams: Team[]
  onAdd: (name: string, tag: string, players: string) => void
  busy: boolean
  input: React.CSSProperties
  btn: (p?: boolean) => React.CSSProperties
}) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [players, setPlayers] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>Add team</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            style={{ ...input, flex: 1, minWidth: 140 }}
            placeholder="Team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            style={{ ...input, width: 90 }}
            placeholder="TAG"
            maxLength={6}
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
          />
        </div>
        <input
          style={{ ...input, width: '100%', marginBottom: 10 }}
          placeholder="Players, comma-separated (names are snapshotted)"
          value={players}
          onChange={(e) => setPlayers(e.target.value)}
        />
        <button
          onClick={() =>
            name.trim() && (onAdd(name.trim(), tag.trim(), players), setName(''), setTag(''), setPlayers(''))
          }
          style={btn(true)}
          disabled={busy}
        >
          Add team
        </button>
      </div>
      {teams.map((t) => (
        <div
          key={t.id}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px' }}
        >
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {t.team_name}
            {t.team_tag ? ` [${t.team_tag}]` : ''}
            <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', marginLeft: 8 }}>
              {t.status}
            </span>
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
            {t.players.map((p) => p.display_name_snapshot).join(' · ')}
          </p>
        </div>
      ))}
    </div>
  )
}

function AnnouncementManager({
  onAdd,
  busy,
  input,
  btn,
}: {
  onAdd: (title: string, body: string) => void
  busy: boolean
  input: React.CSSProperties
  btn: (p?: boolean) => React.CSSProperties
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <input
        style={input}
        placeholder="Title (e.g. DAY 1 RESULTS VERIFIED)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        style={{ ...input, minHeight: 90, resize: 'vertical' }}
        placeholder="Announcement body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        onClick={() => title.trim() && body.trim() && (onAdd(title.trim(), body.trim()), setTitle(''), setBody(''))}
        style={btn(true)}
        disabled={busy}
      >
        📢 Publish
      </button>
    </div>
  )
}
