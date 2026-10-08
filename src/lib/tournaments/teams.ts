// ═══════════════════════════════════════════════════════════════════════════
// Tournament TEAM client — self-registration, my-team read, leave, IGL
// transfer and substitute roles (migration 052).
//
// Every function maps 1:1 to a SECURITY DEFINER RPC; the SERVER is the
// authorization boundary. These wrappers only shape data for the UI and turn
// server error codes into human copy — never a raw database message.
// ═══════════════════════════════════════════════════════════════════════════

import { JOIN_ERROR_COPY } from '@/lib/tournaments/rosters'

export interface TeamRosterMember {
  id: string
  user_id: string | null
  name: string
  role: 'leader' | 'player' | 'substitute'
  ff_ign: string | null
  ff_uid: string | null
  joined_via: string
  user_confirmed: boolean
  joined_at: string
}

export interface MyTeam {
  team_id: string
  team_name: string
  team_tag: string | null
  tournament_id: string
  tournament_name: string
  tournament_status: string
  status: string
  roster_locked: boolean
  locked_at: string | null
  join_code: string | null
  team_size: number
  substitute_limit: number
  substitute_count: number
  leader_id: string | null
  is_leader: boolean
  roster: TeamRosterMember[]
}

export interface TeamCodeRow {
  team_id: string
  team_name: string
  join_code: string | null
  roster_locked: boolean
}

/** The stable error code a Postgres RAISE arrives as, stripped of its prefix. */
export function errorCode(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message || ''
  return msg.replace(/^exception:\s*/i, '').trim()
}

/** Server code → sentence. Unknown codes degrade to the generic message. */
export function teamErrorCopy(code?: string | null): string {
  if (!code) return JOIN_ERROR_COPY.error
  return JOIN_ERROR_COPY[code] || JOIN_ERROR_COPY.error
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** The caller's team in this tournament (IGL or player). null = no team yet. */
export async function fetchMyTeamInTournament(sb: any, tournamentId: string): Promise<MyTeam | null> {
  const { data, error } = await sb.rpc('get_my_team_in_tournament', { p_tournament: tournamentId })
  if (error) throw new Error(errorCode(error) || 'team_load_failed')
  return (data as MyTeam) || null
}

/** Organizer view: every team + its live join code. Throws on forbidden. */
export async function fetchTeamCodes(sb: any, tournamentId: string): Promise<TeamCodeRow[]> {
  const { data, error } = await sb.rpc('get_tournament_team_codes', { p_tournament: tournamentId })
  if (error) throw new Error(errorCode(error) || 'codes_load_failed')
  return (data as TeamCodeRow[]) || []
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface TeamActionResult {
  ok: boolean
  /** Server error code (see JOIN_ERROR_COPY) — already human-readable via teamErrorCopy. */
  error?: string
  joinCode?: string
  teamId?: string
  teamName?: string
}

/** Register a brand-new team; the caller becomes IGL and receives a code. */
export async function createTournamentTeam(
  sb: any,
  tournamentId: string,
  teamName: string,
  teamTag?: string | null
): Promise<TeamActionResult> {
  const { data, error } = await sb.rpc('create_tournament_team', {
    p_tournament: tournamentId,
    p_team_name: teamName,
    p_tag: teamTag || null,
  })
  if (error) return { ok: false, error: errorCode(error) }
  return {
    ok: true,
    teamId: (data as any)?.team_id,
    teamName: (data as any)?.team_name,
    joinCode: (data as any)?.join_code,
  }
}

/** Leave your own team (blocked once the roster freezes; IGL must hand over). */
export async function leaveTournamentTeam(sb: any, teamId: string): Promise<TeamActionResult> {
  const { data, error } = await sb.rpc('leave_tournament_team', { p_team: teamId })
  if (error) return { ok: false, error: errorCode(error) }
  const code = String(data || '')
  return code === 'ok' ? { ok: true } : { ok: false, error: code }
}

/** Hand the IGL role to an existing teammate. */
export async function transferTeamIgl(sb: any, teamId: string, playerId: string): Promise<TeamActionResult> {
  const { data, error } = await sb.rpc('transfer_team_igl', { p_team: teamId, p_player: playerId })
  if (error) return { ok: false, error: errorCode(error) }
  const code = String(data || '')
  return code === 'ok' ? { ok: true } : { ok: false, error: code }
}

/** Promote/demote a roster member to `substitute` (bounded by the limit). */
export async function setPlayerRole(
  sb: any,
  teamId: string,
  playerId: string,
  role: 'player' | 'substitute'
): Promise<TeamActionResult> {
  const { data, error } = await sb.rpc('set_player_role', {
    p_team: teamId,
    p_player: playerId,
    p_role: role,
  })
  if (error) return { ok: false, error: errorCode(error) }
  const code = String(data || '')
  return code === 'ok' ? { ok: true } : { ok: false, error: code }
}

/** Freeze or release every roster in the tournament at once. */
export async function setTournamentRosterLock(
  sb: any,
  tournamentId: string,
  locked: boolean,
  reason?: string
): Promise<TeamActionResult> {
  const { data, error } = await sb.rpc('set_tournament_roster_lock', {
    p_tournament: tournamentId,
    p_locked: locked,
    p_reason: reason || null,
  })
  if (error) return { ok: false, error: errorCode(error) }
  const code = String(data || '')
  return code === 'ok' ? { ok: true } : { ok: false, error: code }
}

/** Registration controls: close/open, deadline and max teams (all optional). */
export async function setTournamentRegistration(
  sb: any,
  tournamentId: string,
  closed: boolean,
  deadline?: string | null,
  maxTeams?: number | null
): Promise<TeamActionResult> {
  const { data, error } = await sb.rpc('set_tournament_registration', {
    p_tournament: tournamentId,
    p_closed: closed,
    p_deadline: deadline || null,
    p_max_teams: maxTeams ?? null,
  })
  if (error) return { ok: false, error: errorCode(error) }
  const code = String(data || '')
  return code === 'ok' ? { ok: true } : { ok: false, error: code }
}

/** Match lifecycle: 'LIVE' to start, 'CANCELLED' (with reason) to call it off. */
export async function setMatchStatus(
  sb: any,
  matchId: string,
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED',
  reason?: string
): Promise<TeamActionResult> {
  const { data, error } = await sb.rpc('set_match_status', {
    p_match: matchId,
    p_status: status,
    p_reason: reason || null,
  })
  if (error) return { ok: false, error: errorCode(error) }
  const code = String(data || '')
  return code === 'ok' ? { ok: true } : { ok: false, error: code }
}
