// ═══════════════════════════════════════════════════════════════════════════
// Tournament RBAC — the client-side half of the permission matrix (§10/§25).
//
// Mirrors tournament_allows() in 051_tournament_rbac.sql. The frontend uses
// it ONLY for UX (hide/disable, role-adaptive sections); the server RPCs are
// the security boundary. Hiding a button here is never the protection (§26).
// ═══════════════════════════════════════════════════════════════════════════

export type TournamentRole = 'PLATFORM_ADMIN' | 'OWNER' | 'ADMIN' | 'VIEWER'

export type TournamentAction =
  | 'view'
  | 'edit_info'
  | 'manage_teams'
  | 'manage_players'
  | 'manage_matches'
  | 'enter_kills'
  | 'submit_result'
  | 'verify_result'
  | 'lock_result'
  | 'reopen_result'
  | 'manage_qualification'
  | 'reverse_qualification'
  | 'change_scoring'
  | 'manage_organizers'
  | 'transfer_ownership'
  | 'cancel_tournament'
  | 'view_audit'
  | 'publish'
  | 'add_announcement'

/** Exactly what tournament_allows() encodes in SQL — keep the two in sync. */
const MATRIX: Record<Exclude<TournamentRole, 'PLATFORM_ADMIN'>, TournamentAction[]> = {
  OWNER: [
    'view',
    'edit_info',
    'manage_teams',
    'manage_players',
    'manage_matches',
    'enter_kills',
    'submit_result',
    'verify_result',
    'lock_result',
    'reopen_result',
    'manage_qualification',
    'reverse_qualification',
    'change_scoring',
    'manage_organizers',
    'transfer_ownership',
    'cancel_tournament',
    'view_audit',
    'publish',
    'add_announcement',
  ],
  ADMIN: [
    'view',
    'edit_info',
    'manage_teams',
    'manage_players',
    'manage_matches',
    'enter_kills',
    'submit_result',
    'verify_result',
    'manage_qualification',
    'add_announcement',
    'view_audit',
  ],
  VIEWER: ['view'],
}

/** The one client-side authorization check (§9): role + action, tournament-scoped. */
export function tournamentAllows(role: string | null | undefined, action: TournamentAction): boolean {
  if (!role) return false
  if (role === 'PLATFORM_ADMIN') return true
  return MATRIX[role as Exclude<TournamentRole, 'PLATFORM_ADMIN'>]?.includes(action) ?? false
}

/** Compute the caller's role from a membership row + platform-admin flag. */
export function resolveRole(
  membershipRole: string | null | undefined,
  isPlatformAdmin: boolean
): TournamentRole | null {
  if (isPlatformAdmin) return 'PLATFORM_ADMIN'
  if (membershipRole === 'OWNER' || membershipRole === 'ADMIN' || membershipRole === 'VIEWER') {
    return membershipRole
  }
  return null
}

/** Which dashboard sections to render for a role (§25). */
export function visibleSections(role: string | null): string[] {
  const can = (a: TournamentAction) => tournamentAllows(role, a)
  const sections = ['overview', 'matches', 'teams', 'players', 'results', 'qualification', 'announcements']
  if (can('view_audit')) sections.push('audit')
  if (can('change_scoring')) sections.push('scoring')
  if (can('manage_organizers')) sections.push('organizers')
  return sections
}

/** Dashboard copy for the role badge (§40): organizer, never "admin of CampusConnect". */
export function roleLabel(role: string | null): string {
  switch (role) {
    case 'PLATFORM_ADMIN':
      return 'Platform Admin'
    case 'OWNER':
      return 'Owner'
    case 'ADMIN':
      return 'Organizer (Admin)'
    case 'VIEWER':
      return 'Viewer'
    default:
      return 'No access'
  }
}
