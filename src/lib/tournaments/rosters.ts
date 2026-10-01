// ═══════════════════════════════════════════════════════════════════════════
// Tournament rosters client — typed wrappers for the 051_tournament_rosters
// RPCs. Every function maps 1:1 to a SECURITY DEFINER RPC; the SERVER is the
// authorization boundary — these wrappers only shape data for the UI.
// ═══════════════════════════════════════════════════════════════════════════

export interface RosterPlayer {
  id: string
  user_id: string | null
  name: string
  role: 'leader' | 'player' | 'substitute'
  ff_ign: string | null
  ff_uid: string | null
  user_confirmed: boolean
}

export interface MyTeamInfo {
  team_id: string
  team_name: string
  team_tag: string | null
  status: string
  roster_locked: boolean
  join_code: string | null
  team_size: number
  players: RosterPlayer[]
}

export interface InvitePreview {
  ok: boolean
  error?: 'invalid_code' | 'roster_locked' | 'registration_closed' | 'team_full'
  tournament_id?: string
  tournament_name?: string
  team_id?: string
  team_name?: string
  team_tag?: string | null
  roster?: number
  team_size?: number
}

export interface TournamentHistoryEntry {
  tournament_id: string
  tournament_name: string
  tournament_status: string
  team_name: string
  ff_ign: string | null
  role: string
  total_kills: number
  matches_played: number
  best_placement: number | null
  created_at: string
}

const errCode = (e: { message: string } | null): string => e?.message?.replace(/^exception:\s*/i, '').trim() || 'error'

// ── IGL ──────────────────────────────────────────────────────────────────────

export async function fetchMyTeam(sb: any, tournamentId: string): Promise<MyTeamInfo | null> {
  const { data, error } = await sb.rpc('get_my_tournament_team', { p_tournament: tournamentId })
  if (error) {
    if (errCode(error) === 'not_leader') return null
    throw new Error(errCode(error))
  }
  return (data as MyTeamInfo) || null
}

export async function regenerateJoinCode(sb: any, teamId: string): Promise<string> {
  const { data, error } = await sb.rpc('regenerate_team_join_code', { p_team: teamId })
  if (error) throw new Error(errCode(error))
  return data as string
}

export async function removePlayer(sb: any, teamId: string, playerId: string): Promise<void> {
  const { error } = await sb.rpc('remove_team_player', { p_team: teamId, p_player: playerId })
  if (error) throw new Error(errCode(error))
}

// ── Player join flow ─────────────────────────────────────────────────────────

export async function resolveInvite(sb: any, code: string): Promise<InvitePreview> {
  const { data } = await sb.rpc('resolve_team_invite', { p_code: code.trim() })
  return (data as InvitePreview) || { ok: false, error: 'invalid_code' }
}

export async function joinByCode(
  sb: any,
  code: string,
  ign: string,
  ffUid: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.rpc('join_team_by_code', {
    p_code: code.trim(),
    p_ign: ign.trim(),
    p_ff_uid: ffUid.trim(),
  })
  if (error) return { ok: false, error: errCode(error) }
  return { ok: true }
}

// Human copy for every server-side rejection (spec §31).
export const JOIN_ERROR_COPY: Record<string, string> = {
  invalid_code: 'This team invite is invalid or expired.',
  roster_locked: 'This roster is locked. Contact the tournament organizer.',
  registration_closed: 'Registration has closed.',
  team_full: 'This team is full.',
  already_on_team: 'You are already registered with another team for this tournament.',
  duplicate_uid: 'This Free Fire UID is already registered in this tournament.',
  unauthenticated: 'Please log in to ConnectToCampus first.',
  error: 'Something went wrong — try again.',
}

// ── Organizer controls ───────────────────────────────────────────────────────

export async function setRosterLock(sb: any, teamId: string, locked: boolean, reason?: string): Promise<void> {
  const { error } = await sb.rpc('set_team_roster_lock', {
    p_team: teamId,
    p_locked: locked,
    p_reason: reason || null,
  })
  if (error) throw new Error(errCode(error))
}

export async function setRegistrationClosed(sb: any, tournamentId: string, closed: boolean): Promise<void> {
  const { error } = await sb.rpc('set_registration_closed', { p_tournament: tournamentId, p_closed: closed })
  if (error) throw new Error(errCode(error))
}

export async function setFfIdentity(
  sb: any,
  playerId: string,
  ign: string,
  ffUid: string,
  reason?: string
): Promise<void> {
  const { error } = await sb.rpc('set_player_ff_identity', {
    p_player: playerId,
    p_ign: ign,
    p_ff_uid: ffUid,
    p_reason: reason || null,
  })
  if (error) throw new Error(errCode(error))
}

// ── Room credentials ─────────────────────────────────────────────────────────

export interface RoomCreds {
  ok: boolean
  released: boolean
  room_id?: string | null
  room_password?: string | null
}

export async function fetchRoomCreds(sb: any, matchId: string): Promise<RoomCreds> {
  const { data } = await sb.rpc('get_room_credentials', { p_match: matchId })
  return (data as RoomCreds) || { ok: false, released: false }
}

export async function setRoomCreds(sb: any, matchId: string, roomId: string, password: string): Promise<void> {
  const { error } = await sb.rpc('set_room_credentials', {
    p_match: matchId,
    p_room_id: roomId,
    p_password: password,
  })
  if (error) throw new Error(errCode(error))
}

// ── Player history ───────────────────────────────────────────────────────────

export async function fetchMyHistory(sb: any): Promise<TournamentHistoryEntry[]> {
  const { data } = await sb.rpc('get_my_tournament_history')
  return (data as TournamentHistoryEntry[]) || []
}

// ── UI helpers ───────────────────────────────────────────────────────────────

/** Roster state for pills/badges — the caller renders it with Icon, never emoji. */
export function rosterState(filled: number, size: number, locked: boolean): 'incomplete' | 'complete' | 'locked' {
  if (locked) return 'locked'
  return filled >= size ? 'complete' : 'incomplete'
}

/** Build the invite link for sharing (WhatsApp etc.). Short path, no raw IDs. */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/tournaments/join?code=${code}`
}
