// ═══════════════════════════════════════════════════════════════════════════
// Tournament scoring engine — THE one calculation (spec §13/§14).
//
// Mirrors recalc_match_team() in 050_tournaments.sql exactly. The client uses
// it for the admin's live preview; the server recomputes the same numbers and
// is authoritative. No other place may compute scores.
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoringConfig {
  killPointValue: number
  /** placement → points, e.g. {1: 15, 2: 12, ...} — from tournament_scoring_rules */
  placementPoints: Record<number, number>
}

export interface PlayerKillEntry {
  player_id: string
  kills: number
}

export interface TeamResultInput {
  team_id: string
  placement: number | null
  players: PlayerKillEntry[]
}

export interface CalculatedTeamScore {
  team_id: string
  total_kills: number
  kill_points: number
  placement_points: number
  total_points: number
}

/** The single scoring formula. Server (recalc_match_team) mirrors this. */
export function calculateTeamScore(team: TeamResultInput, config: ScoringConfig): CalculatedTeamScore {
  const totalKills = team.players.reduce((sum, p) => sum + Math.max(0, p.kills || 0), 0)
  const killPoints = totalKills * config.killPointValue
  const placementPoints = team.placement != null ? (config.placementPoints[team.placement] ?? 0) : 0
  return {
    team_id: team.team_id,
    total_kills: totalKills,
    kill_points: killPoints,
    placement_points: placementPoints,
    total_points: killPoints + placementPoints,
  }
}

/** Rank teams: points DESC → kills DESC → best placement ASC → name ASC.
 *  A team is `tie` when the FULL tiebreak chain matches its neighbour (either
 *  side) — the whole group needs admin review, no silent ordering. */
export function rankTeams(
  scores: (CalculatedTeamScore & { team_name?: string })[]
): (CalculatedTeamScore & { team_name?: string; rank: number; tie: boolean })[] {
  const key = (s: CalculatedTeamScore & { team_name?: string }) =>
    `${s.total_points}|${s.total_kills}|${(s as any).best_placement ?? Infinity}`
  const sorted = [...scores].sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points
    if (b.total_kills !== a.total_kills) return b.total_kills - a.total_kills
    const ap = (a as any).best_placement ?? Infinity
    const bp = (b as any).best_placement ?? Infinity
    if (ap !== bp) return ap - bp
    return (a.team_name || '').localeCompare(b.team_name || '')
  })
  return sorted.map((s, i) => {
    const prev = i > 0 ? sorted[i - 1] : null
    const next = i < sorted.length - 1 ? sorted[i + 1] : null
    const tie = (prev && key(prev) === key(s)) || (next && key(next) === key(s))
    return { ...s, rank: i + 1, tie: !!tie }
  })
}

/** Top-N qualify from a ranked list (spec §20). */
export function topNQualify<T extends { rank: number; tie: boolean }>(
  ranked: T[],
  limit: number
): (T & { qualifies: boolean })[] {
  return ranked.map((r) => ({
    ...r,
    // a tie straddling the cut line needs admin review, not a silent pick
    qualifies: r.rank <= limit && !r.tie,
  }))
}

/** Qualification eligibility for the NEXT stage (spec §25): only QUALIFIED
 *  (or re-qualified) teams; REVERSED/REJECTED/ELIMINATED/DISQUALIFIED are out. */
export function isEligibleForNextStage(team: { status: string; qualification_status?: string | null }): boolean {
  if (team.status === 'DISQUALIFIED' || team.status === 'ELIMINATED') return false
  return team.qualification_status === 'QUALIFIED'
}

/** Client-side result validation before submit (server re-checks everything). */
export function validateResultEntry(
  teams: TeamResultInput[],
  opts: { teamSize: number; maxPlacement: number }
): string | null {
  const placements = teams.map((t) => t.placement).filter((p): p is number => p != null)
  const seen = new Set<number>()
  for (const p of placements) {
    if (p < 1 || p > opts.maxPlacement) return `Placement ${p} is out of range`
    if (seen.has(p)) return `Two teams share placement ${p}`
    seen.add(p)
  }
  for (const t of teams) {
    if (t.players.length > opts.teamSize + 1) return 'Too many players in a team'
    if (t.players.some((p) => p.kills < 0)) return 'Kills cannot be negative'
  }
  return null
}

/** CSV export (spec §56) — reused by admin export buttons. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}
