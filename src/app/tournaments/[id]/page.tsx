'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /tournaments/[id] — the public tournament homepage (spec §45).
// One overview RPC + tabbed leaderboards (ALL / per stage) + match results +
// top fraggers + announcements + champion. Realtime on results (§47).
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import IglTeamPanel from '@/components/tournaments/IglTeamPanel'
import { Icon } from '@/components/icons'
import { fetchRoomCreds, type RoomCreds } from '@/lib/tournaments/rosters'

interface StageMatch {
  id: string
  match_number: number
  status: string
  scheduled_at: string | null
  result_state: string
  team_count: number
}
interface Stage {
  id: string
  name: string
  stage_number: number
  stage_type: string
  status: string
  qualification_limit: number | null
  matches: StageMatch[]
}
interface Overview {
  tournament: {
    id: string
    name: string
    game: string
    status: string
    description: string | null
    team_size: number
    kill_point_value: number
    start_date: string | null
    end_date: string | null
  }
  champion: { team_id: string; team_name: string; team_tag: string | null } | null
  stages: Stage[]
  team_count: number
  player_count: number
  match_count: number
  completed_matches: number
  latest_announcement: { title: string; body: string } | null
  top_fraggers: { rank: number; display_name: string; team_name: string; total_kills: number }[]
}
interface TeamRow {
  rank: number
  team_id: string
  team_name: string
  team_tag: string | null
  status: string
  matches_played: number
  total_kills: number
  kill_points: number
  placement_points: number
  total_points: number
}
interface PlayerRow {
  rank: number
  display_name: string
  team_name: string
  total_kills: number
  matches_played: number
}
interface MatchResult {
  team_name: string
  team_tag: string | null
  placement: number | null
  total_kills: number
  kill_points: number
  placement_points: number
  total_points: number
  players: { display_name: string; kills: number }[]
}

type Tab = 'standings' | 'matches' | 'fraggers'

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [ov, setOv] = useState<Overview | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('standings')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [board, setBoard] = useState<TeamRow[]>([])
  const [fraggers, setFraggers] = useState<PlayerRow[]>([])
  const [openMatch, setOpenMatch] = useState<{ id: string; label: string; result: MatchResult[] } | null>(null)
  const [isIgl, setIsIgl] = useState(false)
  const [roomCreds, setRoomCreds] = useState<{ matchId: string; creds: RoomCreds } | null>(null)

  // The IGL sees their team-management panel on this page (server decides via
  // get_my_tournament_team — a non-leader gets null and the panel is hidden).
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void import('@/lib/tournaments/rosters').then(({ fetchMyTeam }) =>
      fetchMyTeam(supabase, id)
        .then((t) => !cancelled && setIsIgl(!!t))
        .catch(() => undefined)
    )
    return () => {
      cancelled = true
    }
  }, [supabase, id])

  const loadOverview = useCallback(async () => {
    setLoadErr(null)
    const { data, error } = await supabase.rpc('get_tournament_overview', { p_tournament: id })
    if (error) {
      // Real failure (RLS/network/permission) — NOT "not found". Show a retry
      // screen instead of silently pretending the tournament doesn't exist.
      setLoadErr(error.message)
      return
    }
    if (!data) {
      setNotFound(true)
      return
    }
    setOv(data as Overview)
  }, [supabase, id])

  const loadBoard = useCallback(async () => {
    const stageId = stageFilter === 'all' ? null : stageFilter
    const [teamRes, playerRes] = await Promise.all([
      supabase.rpc('get_tournament_team_leaderboard', { p_tournament: id, p_stage: stageId }),
      supabase.rpc('get_tournament_player_leaderboard', { p_tournament: id, p_stage: stageId, p_limit: 50 }),
    ])
    if (teamRes.error || playerRes.error) {
      setLoadErr(teamRes.error?.message || playerRes.error?.message || 'Could not load standings')
      return
    }
    setBoard((teamRes.data as TeamRow[]) || [])
    setFraggers((playerRes.data as PlayerRow[]) || [])
  }, [supabase, id, stageFilter])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])
  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  // Realtime: results/tournament changes refresh the boards (§47).
  useEffect(() => {
    const channel = supabase
      .channel(`tournament-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_team_results' }, () => void loadBoard())
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` },
        () => {
          void loadOverview()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, id, loadBoard, loadOverview])

  const openMatchResult = async (m: StageMatch, stage: Stage) => {
    const [resultRes, creds] = await Promise.all([
      supabase.rpc('get_match_result', { p_match: m.id }),
      fetchRoomCreds(supabase, m.id),
    ])
    setOpenMatch({
      id: m.id,
      label: `${stage.name} · Match ${m.match_number}`,
      result: ((resultRes.data as any)?.teams as MatchResult[]) || [],
    })
    setRoomCreds({ matchId: m.id, creds })
  }

  const medal = (r: number) => (r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : null)
  const stageTabs = useMemo(() => ov?.stages ?? [], [ov])

  // Match Center: walk every match with the stage that owns it. The overview
  // RPC nests matches under stages and does NOT repeat stage_id on each match,
  // so pair them as we flatten (looking up m.stage_id would always miss).
  const allMatches = useMemo(
    () => (ov ? ov.stages.flatMap((s) => s.matches.map((match) => ({ match, stage: s }))) : []),
    [ov]
  )
  const currentEntry = useMemo(() => allMatches.find((e) => e.match.status === 'LIVE') ?? null, [allMatches])
  const currentMatch = currentEntry?.match ?? null
  const currentStage = currentEntry?.stage ?? null
  const nextEntryRaw = useMemo(() => {
    if (!currentEntry) {
      // No live match: the first match still pending or locked.
      return allMatches.find((e) => e.match.result_state === 'NONE' || e.match.result_state === 'LOCKED') ?? null
    }
    // Otherwise: the next pending/locked match, in stage order.
    const idx = allMatches.indexOf(currentEntry)
    return (
      allMatches.slice(idx + 1).find((e) => e.match.result_state === 'NONE' || e.match.result_state === 'LOCKED') ??
      null
    )
  }, [allMatches, currentEntry])
  const nextMatch = nextEntryRaw?.match ?? null
  const nextStage = nextEntryRaw?.stage ?? null

  if (loadErr) {
    return (
      <Layout>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ margin: '0 auto 12px', color: 'var(--danger)', display: 'flex', justifyContent: 'center' }}>
            <svg
              width={40}
              height={40}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Tournament couldn&apos;t load
          </p>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              margin: '0 0 18px',
              maxWidth: 460,
              marginInline: 'auto',
            }}
          >
            This usually means a temporary network or permissions issue — not a login problem. Try again in a moment.
          </p>
          <button
            onClick={() => window.location.reload()}
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
            Retry
          </button>
        </div>
      </Layout>
    )
  }

  if (notFound) {
    return (
      <Layout>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Tournament not found</p>
        </div>
      </Layout>
    )
  }
  if (!ov) {
    return (
      <Layout>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
        </div>
      </Layout>
    )
  }

  const t = ov.tournament

  return (
    <Layout>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* ── Header ── */}
        <p
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            margin: '0 0 6px',
          }}
        >
          🎮 CAMPUSCONNECT TOURNAMENT
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: 'var(--text-primary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {t.name}
          </h1>
          {t.status === 'LIVE' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.06em',
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                animation: 'pulse-live 2s ease-in-out infinite',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--danger)',
                  boxShadow: '0 0 6px var(--danger)',
                  animation: 'pulse-dot 1.5s ease-in-out infinite',
                }}
              />
              LIVE NOW
            </span>
          ) : (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.06em',
                padding: '3px 9px',
                borderRadius: 999,
                background: t.status === 'UPCOMING' ? 'var(--accent-light)' : 'var(--bg-secondary, var(--bg))',
                color: t.status === 'UPCOMING' ? 'var(--accent-text)' : 'var(--text-muted)',
              }}
            >
              {t.status}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 18px' }}>
          {ov.team_count} teams · {ov.player_count} players · {ov.completed_matches}/{ov.match_count} matches scored
          {t.start_date ? ` · ${t.start_date}${t.end_date ? ` → ${t.end_date}` : ''}` : ''}
        </p>

        {/* ── Match Center — compact current match status ── */}
        {tab === 'standings' && (
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '14px 16px',
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.06em',
                  margin: 0,
                }}
              >
                MATCH CENTER
              </h3>
              {ov.stages.length > 0 && ov.stages[0].matches.length > 0 && (
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {ov.stages[0].name} · {ov.stages[0].matches.length} matches
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {currentMatch && (
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span
                      style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}
                    >
                      Current
                    </span>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--danger)',
                        boxShadow: '0 0 6px var(--danger)',
                        animation: 'pulse-dot 1.5s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Match {currentMatch.match_number}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {currentStage?.name ?? ''}
                  </p>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 6,
                      fontSize: 9.5,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: 'var(--danger-light)',
                      color: 'var(--danger)',
                    }}
                  >
                    LIVE
                  </span>
                </div>
              )}
              {nextMatch && (
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span
                      style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}
                    >
                      Next
                    </span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Match {nextMatch.match_number}
                  </p>
                  {nextStage && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{nextStage.name}</p>
                  )}
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 6,
                      fontSize: 9.5,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background:
                        nextMatch.result_state === 'LOCKED'
                          ? 'var(--success-light)'
                          : nextMatch.result_state === 'NONE'
                            ? 'var(--bg-tertiary)'
                            : 'var(--warning-light)',
                      color:
                        nextMatch.result_state === 'LOCKED'
                          ? 'var(--success-text)'
                          : nextMatch.result_state === 'NONE'
                            ? 'var(--text-muted)'
                            : 'var(--warning-text)',
                    }}
                  >
                    {nextMatch.result_state === 'NONE' ? 'PENDING' : nextMatch.result_state}
                  </span>
                </div>
              )}
              {!currentMatch && !nextMatch && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No matches available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Champion ── */}
        {ov.champion && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.14), var(--bg))',
              border: '2px solid #f59e0b',
              borderRadius: 16,
              padding: '18px 20px',
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', color: '#f59e0b', margin: '0 0 4px' }}>
              GRAND CHAMPION
            </p>
            <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
              {ov.champion.team_name}
              {ov.champion.team_tag ? ` [${ov.champion.team_tag}]` : ''}
            </p>
          </div>
        )}

        {/* ── My Team (IGL only — server-gated via get_my_tournament_team) ── */}
        {isIgl ? (
          <IglTeamPanel tournamentId={id} />
        ) : (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '14px 16px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--bg-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="shield" size={16} style={{ color: 'var(--text-muted)' }} />
            </span>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Team controls</span> are available to your
              registered team leader (IGL).
            </span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {(
            [
              ['standings', 'Standings'],
              ['matches', 'Matches'],
              ['fraggers', 'Top Fraggers'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              style={{
                flex: 1,
                padding: '9px 10px',
                borderRadius: 10,
                border: tab === key ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                background: tab === key ? 'var(--accent-light)' : 'var(--bg)',
                color: tab === key ? 'var(--accent-text)' : 'var(--text-secondary)',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stage filter (ALL / Day 1 / Day 2 / FINAL) */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
          {[['all', 'ALL'], ...stageTabs.map((s) => [s.id, s.name.toUpperCase()] as [string, string])].map(
            ([sid, label]) => (
              <button
                key={sid}
                onClick={() => setStageFilter(sid)}
                aria-pressed={stageFilter === sid}
                style={{
                  flexShrink: 0,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: stageFilter === sid ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  background: stageFilter === sid ? 'var(--accent-light)' : 'var(--bg)',
                  color: stageFilter === sid ? 'var(--accent-text)' : 'var(--text-muted)',
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            )
          )}
        </div>

        {/* ── Team standings ── */}
        {tab === 'standings' && (
          <>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                margin: '0 0 10px',
              }}
            >
              TEAM LEADERBOARD
            </h3>
            {board.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                No verified results yet — standings appear once matches are scored.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {board.map((r) => (
                  <div
                    key={r.team_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: r.rank <= 3 ? 'var(--accent-light)' : 'var(--bg)',
                      border: r.rank <= 3 ? '1px solid var(--accent-border, var(--border))' : '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      boxShadow: r.rank <= 3 ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                    }}
                  >
                    <span style={{ width: 28, textAlign: 'center', fontSize: 14, fontWeight: 900, flexShrink: 0 }}>
                      {medal(r.rank) ?? r.rank}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.team_name}
                        </span>
                        {r.team_tag && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                            [{r.team_tag}]
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          marginTop: 2,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>{r.matches_played} matches</span>
                        <span>{r.total_kills} kills</span>
                        <span>{r.kill_points} KP</span>
                        <span>{r.placement_points} PP</span>
                        {r.status === 'DISQUALIFIED' && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: 6,
                              background: 'var(--danger-light)',
                              color: 'var(--danger)',
                              flexShrink: 0,
                            }}
                          >
                            DSQ
                          </span>
                        )}
                      </div>
                    </span>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        color: 'var(--accent-text)',
                        flexShrink: 0,
                        minWidth: 32,
                        textAlign: 'right',
                      }}
                    >
                      {r.total_points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Matches ── */}
        {tab === 'matches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ov.stages.map((s) => (
              <div key={s.id}>
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.06em',
                    margin: '0 0 8px',
                  }}
                >
                  {s.name.toUpperCase()}
                  {s.qualification_limit ? ` · top ${s.qualification_limit} qualify` : ''}
                  {s.stage_type === 'FINAL' ? ' · FINAL' : ''}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {s.matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => openMatchResult(m, s)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '11px 14px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Match {m.match_number}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {' '}
                          · {m.team_count} teams
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background:
                            m.result_state === 'LOCKED'
                              ? 'var(--success-light)'
                              : m.result_state === 'NONE'
                                ? 'var(--bg-secondary, var(--bg))'
                                : 'var(--accent-light)',
                          color:
                            m.result_state === 'LOCKED'
                              ? 'var(--success-text)'
                              : m.result_state === 'NONE'
                                ? 'var(--text-muted)'
                                : 'var(--accent-text)',
                        }}
                      >
                        {m.result_state === 'NONE' ? 'NO RESULT' : m.result_state}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Player kill leaderboard ── */}
        {tab === 'fraggers' && (
          <>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                margin: '0 0 10px',
              }}
            >
              TOP FRAGGERS — individual kills only
            </h3>
            {fraggers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No kills recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fraggers.map((p) => (
                  <div
                    key={`${p.display_name}-${p.rank}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '10px 14px',
                    }}
                  >
                    <span style={{ width: 30, textAlign: 'center', fontWeight: 900, fontSize: 13 }}>
                      {medal(p.rank) ?? p.rank}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {p.display_name}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{p.team_name}</span>
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--danger)' }}>{p.total_kills}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Announcement ── */}
        {ov.latest_announcement && tab === 'standings' && (
          <div
            style={{
              marginTop: 24,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              📢 {ov.latest_announcement.title}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>
              {ov.latest_announcement.body}
            </p>
          </div>
        )}

        {/* ── Match result sheet ── */}
        {openMatch && (
          <div
            role="presentation"
            onClick={() => setOpenMatch(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.4)' }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={openMatch.label}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 0,
                top: '8%',
                maxWidth: 560,
                margin: '0 auto',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '16px 16px 0 0',
                padding: '18px 18px 30px',
                overflowY: 'auto',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 14px' }}>
                {openMatch.label}
              </p>
              {/* Room credentials — server gates the release (spec §27) */}
              {roomCreds?.matchId === openMatch.id &&
                (roomCreds.creds.released && roomCreds.creds.room_id ? (
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: 10,
                      padding: '11px 13px',
                      marginBottom: 14,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        margin: '0 0 6px',
                      }}
                    >
                      Room credentials
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {roomCreds.creds.room_id}
                      </span>
                      <button
                        onClick={() => void navigator.clipboard.writeText(roomCreds.creds.room_id || '')}
                        aria-label="Copy room ID"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          padding: 2,
                        }}
                      >
                        <Icon name="copy" size={13} />
                      </button>
                      {roomCreds.creds.room_password && (
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          pw: {roomCreds.creds.room_password}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      marginBottom: 14,
                    }}
                  >
                    <Icon name="lock" size={12} /> Room credentials appear here when the organizer releases them.
                  </p>
                ))}
              {openMatch.result.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No result entered yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {openMatch.result.map((r, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {medal(r.placement ?? 99) ?? `#${r.placement ?? '—'}`} {r.team_name}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--accent-text)' }}>
                          {r.total_points}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                        {r.total_kills} kills · {r.kill_points} KP + {r.placement_points} PP
                      </p>
                      {r.players.map((p) => (
                        <div
                          key={p.display_name}
                          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>{p.display_name}</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{p.kills}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
