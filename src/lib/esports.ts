// ═══════════════════════════════════════════════════════════════════════════
// ESPORTS — the dashboard's Free Fire layer.
//
// Pure helpers only: join-code shape checks, the shared game label, and the
// "my team / my record" roll-ups the dashboard renders. Authorization stays
// server-side (`resolve_team_invite`, `join_team_by_code` in
// 051_tournament_rosters.sql) — nothing here guards any data.
// ═══════════════════════════════════════════════════════════════════════════

/** Exactly what `tournament_gen_code()` uses: unambiguous, no 0/O/1/I/L. */
export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TEAM_CODE_LENGTH = 6

/**
 * Uppercase a pasted code and keep only alphabet characters.
 * People paste codes with spaces, dashes, a trailing "." or in lowercase —
 * the server compares `upper(btrim(code))`, so the client meets it halfway.
 *
 * NOTE: this deliberately does NOT truncate. A 7-character paste must fail
 * the shape check, not silently become the first six characters and join some
 * other team. Input fields clamp with `TEAM_CODE_LENGTH` themselves.
 */
export function normalizeTeamCode(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .split('')
    .filter((ch) => TEAM_CODE_ALPHABET.includes(ch))
    .join('')
}

/** Plausible = exactly six alphabet characters. Shape only — never a lookup. */
export function isPlausibleTeamCode(raw: string): boolean {
  return normalizeTeamCode(raw).length === TEAM_CODE_LENGTH
}

/** Deep link into the EXISTING self-join flow (/tournaments/join). */
export function joinByCodeHref(code: string): string {
  return `/tournaments/join?code=${normalizeTeamCode(code)}`
}

const GAME_LABELS: Record<string, string> = {
  FREE_FIRE: 'Free Fire',
  BGMI: 'BGMI',
  VALORANT: 'Valorant',
  CHESS: 'Chess',
}

export function gameLabel(game: string | null | undefined): string {
  return (game && GAME_LABELS[game]) || 'Esports'
}

// ── Dashboard roll-ups ──────────────────────────────────────────────────────

/** The shape `get_my_tournament_history()` returns (see rosters.ts). */
export interface EsportsHistoryEntry {
  tournament_id: string
  tournament_name: string
  tournament_status: string
  team_name: string
  ff_ign: string | null
  role: string
  total_kills: number
  matches_played: number
  best_placement: number | null
}

export interface EsportsRecord {
  tournaments: number
  matches: number
  kills: number
  bestPlacement: number | null
}

/** One pass over the player's history → the numbers the dashboard shows. */
export function esportsRecord(history: EsportsHistoryEntry[]): EsportsRecord {
  const rows = history || []
  let matches = 0
  let kills = 0
  let bestPlacement: number | null = null

  for (const h of rows) {
    matches += h.matches_played || 0
    kills += h.total_kills || 0
    const p = h.best_placement
    if (typeof p === 'number' && p > 0 && (bestPlacement === null || p < bestPlacement)) {
      bestPlacement = p
    }
  }

  return { tournaments: rows.length, matches, kills, bestPlacement }
}

/** The one entry worth surfacing as "my team" — a tournament still running. */
export function activeTeamEntry(history: EsportsHistoryEntry[]): EsportsHistoryEntry | null {
  return (history || []).find((h) => h.tournament_status === 'LIVE' || h.tournament_status === 'UPCOMING') || null
}

/** '1st' / '2nd' / '3rd' / '#7' — one definition, shared by profile + dashboard. */
export function placementLabel(placement: number | null | undefined): string {
  if (!placement || placement < 1) return '—'
  if (placement === 1) return '1st'
  if (placement === 2) return '2nd'
  if (placement === 3) return '3rd'
  return `#${placement}`
}
